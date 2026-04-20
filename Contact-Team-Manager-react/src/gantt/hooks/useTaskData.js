import { useState, useEffect, useCallback, useRef } from 'react';
import { addDays } from 'date-fns';
import { useAuth } from './useGanttAuth';

// ── DB行 → タスクオブジェクト ──────────────────────────────────────────────
const toTask = (row) => {
  try {
    return {
      id:        row.id,
      parentId:  row.parent_id ?? row.parentId ?? null,
      ownerId:   row.owner_id ?? row.ownerId ?? null,
      title:     row.title || 'Untitled',
      type:      row.type || 'task',
      status:    row.status || 'active',
      progress:  row.progress ?? 0,
      startDate: row.start_date ? new Date(row.start_date + 'T00:00:00') : new Date(),
      endDate:   row.end_date   ? new Date(row.end_date   + 'T00:00:00') : addDays(new Date(), 7),
      sortOrder: row.sort_order ?? 0,
      color:     row.color ?? null,
      children:  [],
    };
  } catch (e) {
    console.error('toTask error:', e, row);
    return null;
  }
};

// タスクオブジェクト → DB行形式
const toDbRow = (t) => ({
  id:         t.id,
  parent_id:  t.parentId ?? null,
  title:      t.title,
  type:       t.type,
  status:     t.status,
  progress:   t.progress,
  start_date: toDateStr(t.startDate),
  end_date:   toDateStr(t.endDate),
  sort_order: t.sortOrder ?? 0,
  color:      t.color ?? null,
});

// ツリーをフラットなタスクオブジェクト配列に展開
const flattenTree = (tasks, acc = []) => {
  tasks.forEach(t => { acc.push(t); if (t.children?.length) flattenTree(t.children, acc); });
  return acc;
};

// 子孫 id を再帰的に収集（削除時に使用）
const collectDescendantIds = (flat, id) => {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    flat.forEach(r => {
      if (r.parent_id && ids.has(r.parent_id) && !ids.has(r.id)) {
        ids.add(r.id);
        changed = true;
      }
    });
  }
  return ids;
};

const addComputedProgress = (task) => {
  const children = task.children.map(addComputedProgress);
  const computedProgress = children.length > 0
    ? Math.round(children.reduce((s, c) => s + c.computedProgress, 0) / children.length)
    : task.progress;
  return { ...task, children, computedProgress };
};

const buildTree = (flatList) => {
  const map = {};
  const tasks = (flatList || []).map(toTask).filter(Boolean);
  tasks.forEach(t => { map[t.id] = { ...t, children: [] }; });
  const roots = [];
  tasks.forEach(t => {
    const pId = t.parentId;
    if (pId && map[pId]) {
      map[pId].children.push(map[t.id]);
    } else {
      roots.push(map[t.id]);
    }
  });
  return roots.map(addComputedProgress);
};

// toISOString() は UTC変換するため JST では1日前になる → ローカル日付を使う
const toDateStr = (v) => {
  if (!(v instanceof Date)) return v ?? null;
  const y  = v.getFullYear();
  const mo = String(v.getMonth() + 1).padStart(2, '0');
  const d  = String(v.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
};

// ── ステートをDBフラット行で直接更新するヘルパー ────────────────────────────
const applyRows = (prev, fn) => buildTree(fn(flattenTree(prev).map(toDbRow)));

// ── Supabase REST API への生 fetch ヘルパー ──────────────────────────────────
// supabase-js v2.38+ の getSession() は Web Lock を使用するため、
// SIGNED_IN イベント処理中に呼ぶとデッドロックでハングする。
// supabase.from() を一切使わず raw fetch で REST API を直接呼ぶことで回避する。
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const restFetch = async (method, path, token, body = undefined) => {
  const headers = {
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
  };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`${method} ${path}: ${res.status} ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

export const useTaskData = () => {
  const { user, loading: authLoading, accessToken } = useAuth();
  const userId = user?.id ?? null;

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const fetchInProgress = useRef(false);
  const mutationActive  = useRef(false);
  const fetchSeq        = useRef(0);

  // accessToken を ref にも保持（CRUD コールバックから最新値を参照するため）
  const accessTokenRef = useRef(accessToken);
  useEffect(() => { accessTokenRef.current = accessToken; }, [accessToken]);

  // ── runFetch ──────────────────────────────────────────────────────────────
  const runFetch = useCallback(async (uid, token) => {
    if (!uid || !token) { setTasks([]); setLoading(false); return; }
    if (fetchInProgress.current) return;

    fetchInProgress.current = true;
    const seq = ++fetchSeq.current;
    setLoading(true);

    try {
      const data = await restFetch('GET', 'tasks?select=*&order=sort_order.asc', token);
      if (seq !== fetchSeq.current) return;
      setTasks(buildTree(data ?? []));
      setError(null);
      console.log('[useTaskData] fetched', data?.length, 'tasks for uid:', uid);
    } catch (err) {
      console.error('[useTaskData] fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      fetchInProgress.current = false;
    }
  }, []);

  // ── 外部公開用 fetchTasks ────────────────────────────────────────────────
  const fetchTasks = useCallback(
    () => runFetch(userId, accessTokenRef.current),
    [runFetch, userId]
  );

  // ── 認証トリガー ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (authLoading) return;
    if (!userId || !accessToken) {
      setTasks([]);
      setLoading(false);
      return;
    }
    runFetch(userId, accessToken);
  }, [authLoading, userId, accessToken, runFetch]);

  // ── mutation 共通ヘルパー（親の期間チェック）──────────────────────────────
  const parentDateCheck = async (inserted) => {
    if (!inserted?.parent_id) return;
    const token = accessTokenRef.current;
    if (!token) return;

    const rows = await restFetch(
      'GET',
      `tasks?id=eq.${inserted.parent_id}&select=*`,
      token
    ).catch(() => null);
    const parentRow = rows?.[0];
    if (!parentRow) return;

    const childStart  = new Date(inserted.start_date + 'T00:00:00');
    const childEnd    = new Date(inserted.end_date   + 'T00:00:00');
    const parentStart = new Date(parentRow.start_date + 'T00:00:00');
    const parentEnd   = new Date(parentRow.end_date   + 'T00:00:00');
    const newParentStart = childStart < parentStart ? childStart : parentStart;
    const newParentEnd   = childEnd   > parentEnd   ? childEnd   : parentEnd;

    if (newParentStart < parentStart || newParentEnd > parentEnd) {
      const { format: fmt } = await import('date-fns');
      const ok = window.confirm(
        `「${parentRow.title}」の期間を超えています。\n親タスクの期間を自動延長しますか？\n\n` +
        `${fmt(parentStart, 'yyyy/M/d')} ～ ${fmt(parentEnd, 'yyyy/M/d')}\n　　↓\n` +
        `${fmt(newParentStart, 'yyyy/M/d')} ～ ${fmt(newParentEnd, 'yyyy/M/d')}`
      );
      if (ok) {
        const updatedParent = {
          ...parentRow,
          start_date: toDateStr(newParentStart),
          end_date:   toDateStr(newParentEnd),
        };
        await restFetch('PATCH', `tasks?id=eq.${parentRow.id}`, token, {
          start_date: updatedParent.start_date,
          end_date:   updatedParent.end_date,
        }).catch(console.error);
        setTasks(prev => applyRows(prev, flat =>
          flat.map(r => r.id === parentRow.id ? updatedParent : r)
        ));
      }
    }
  };

  // ── addTask ───────────────────────────────────────────────────────────────
  const addTask = useCallback(async (taskData) => {
    const token = accessTokenRef.current;
    if (!userId || !token) {
      window.alert('ログインセッションが切れています。ページを再読み込みして再ログインしてください。');
      return false;
    }
    mutationActive.current = true;
    try {
      const body = {
        owner_id:   userId,
        parent_id:  taskData.parentId || null,
        title:      taskData.title || 'New Task',
        type:       taskData.type || 'task',
        status:     taskData.status || 'active',
        progress:   taskData.progress ?? 0,
        start_date: toDateStr(taskData.startDate),
        end_date:   toDateStr(taskData.endDate),
      };
      if (taskData.color !== undefined && taskData.color !== null) body.color = taskData.color;
      const result = await restFetch('POST', 'tasks', token, body);
      const inserted = Array.isArray(result) ? result[0] : result;
      if (!inserted) throw new Error('追加に失敗しました（行が返されませんでした）');

      console.log('[addTask] ✓', inserted);
      setTasks(prev => applyRows(prev, flat => [...flat, inserted]));
      ++fetchSeq.current;

      await parentDateCheck(inserted);
      return true;
    } catch (err) {
      console.error('[addTask] error:', err);
      window.alert(`追加エラー: ${err.message}`);
      return false;
    } finally {
      mutationActive.current = false;
    }
  }, [userId]);

  // ── updateTask ────────────────────────────────────────────────────────────
  const updateTask = useCallback(async (id, fields, { skipParentCheck = false } = {}) => {
    const token = accessTokenRef.current;
    if (!userId || !token) return false;
    mutationActive.current = true;
    try {
      const body = {};
      if (fields.title     !== undefined) body.title      = fields.title;
      if (fields.type      !== undefined) body.type       = fields.type;
      if (fields.status    !== undefined) body.status     = fields.status;
      if (fields.progress  !== undefined) body.progress   = fields.progress;
      if (fields.startDate)               body.start_date = toDateStr(fields.startDate);
      if (fields.endDate)                 body.end_date   = toDateStr(fields.endDate);
      if (fields.parentId  !== undefined) body.parent_id  = fields.parentId;
      if (fields.color     !== undefined) body.color      = fields.color;

      console.log('[updateTask] →', id, body);
      const result = await restFetch('PATCH', `tasks?id=eq.${id}`, token, body);
      const updated = Array.isArray(result) ? result[0] : result;
      if (!updated) throw new Error('更新できませんでした。権限エラーの可能性があります。');

      console.log('[updateTask] ✓', updated);
      setTasks(prev => applyRows(prev, flat =>
        flat.map(r => r.id === id ? updated : r)
      ));
      ++fetchSeq.current;

      if (!skipParentCheck) await parentDateCheck(updated);
      return true;
    } catch (err) {
      console.error('[updateTask] error:', err);
      window.alert(`更新エラー: ${err.message}`);
      return false;
    } finally {
      mutationActive.current = false;
    }
  }, [userId]);

  // ── deleteTask ────────────────────────────────────────────────────────────
  const deleteTask = useCallback(async (id) => {
    const token = accessTokenRef.current;
    if (!userId || !token) return;
    mutationActive.current = true;
    try {
      await restFetch('DELETE', `tasks?id=eq.${id}`, token);
      setTasks(prev => {
        const flat = flattenTree(prev).map(toDbRow);
        const toDelete = collectDescendantIds(flat, id);
        return buildTree(flat.filter(r => !toDelete.has(r.id)));
      });
      ++fetchSeq.current;
    } catch (err) {
      console.error('[deleteTask] error:', err);
      window.alert(`削除エラー: ${err.message}`);
    } finally {
      mutationActive.current = false;
    }
  }, [userId]);

  return { tasks, loading, error, addTask, updateTask, deleteTask, fetchTasks };
};
