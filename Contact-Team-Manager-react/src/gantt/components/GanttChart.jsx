import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  format, eachDayOfInterval, differenceInDays, addDays, subDays, startOfDay, endOfDay,
} from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, ChevronRight, ChevronDown, ChevronsDownUp, ChevronsUpDown, Sparkles, Check } from 'lucide-react';

// 完了タスクのバーに「終わった感」を出すオーバーレイを有効化するか。
// false にすると完全に元の見た目（色のみ）に戻る。
const COMPLETED_OVERLAY_ENABLED = true;
import { TaskMenu } from './TaskMenu';
import { isHoliday } from '../lib/holidays';
import { filterByCompletion } from '../lib/taskTree';
import { CompletionFilterTabs } from './CompletionFilterTabs';

// ── モジュールレベル定数・ヘルパー ─────────────────────────────────────────────
const TASK_LIST_WIDTH = 280;

// タイプ: 役割の違いを静かなパレットで表現。project はブランド強、milestone は warm、task はブランド
const TYPE_COLOR = {
  project:   { color: 'var(--primary-dark)' },
  milestone: { color: 'var(--warning)'      },
  task:      { color: 'var(--primary)'      },
};

// ステータス: セマンティックトークンに直結
const STATUS_COLOR = {
  completed: { color: 'var(--success)'    },
  warning:   { color: 'var(--warning)'    },
  'on-hold': { color: 'var(--text-muted)' },
};

const getTaskColor = (task) =>
  STATUS_COLOR[task.status] ?? TYPE_COLOR[task.type] ?? TYPE_COLOR.task;

// 純粋関数：chartStart と dayWidth を引数で受け取る
const calcPos = (start, end, chartStart, dayWidth) => {
  const s = new Date(start), e = new Date(end);
  const left  = Math.max(0, differenceInDays(s, chartStart)) * dayWidth;
  const width = (differenceInDays(e, s) + 1) * dayWidth;
  return { left, width };
};

// ── TaskRow を GanttChart の外側に定義 ────────────────────────────────────────
// ポイント：GanttChart が再レンダリングしても TaskRow の関数参照が変わらないため
// React はキーで既存インスタンスを再利用し、useRef (barRef) がリセットされない。
// これによりドラッグ中の再レンダリングでバーが元の位置に戻る問題を解消する。
// 階層を「太さ」で表現: project = 大, milestone = 中, task = 小
// ただし単日タスクの丸（spot）は % テキストが収まる大きさを常に確保する
// 行高 52 基準で top は (52 - height) / 2 に揃える
const BAR_METRICS = {
  project:   { barH: 30, spotH: 36, barFont: '0.72rem', spotFont: '0.66rem', radius: '0.55rem', handleH: 14 },
  milestone: { barH: 20, spotH: 34, barFont: '0.64rem', spotFont: '0.64rem', radius: '0.4rem',  handleH: 10 },
  task:      { barH: 12, spotH: 32, barFont: '0.56rem', spotFont: '0.62rem', radius: '0.3rem',  handleH: 8  },
};
const getBarMetrics = (type) => BAR_METRICS[type] ?? BAR_METRICS.task;

const TaskRow = ({ task, dayWidth, chartStart, numDays, onTaskClick, onDelete, onAddTask, onUpdate, onShare, collapsed, onToggleCollapse }) => {
  const [menuOpen,   setMenuOpen]   = useState(false);
  const [rowHovered, setRowHovered] = useState(false);
  const barRef     = useRef(null);
  const wasDragged = useRef(false);

  const tc  = getTaskColor(task);
  const pos = calcPos(task.startDate, task.endDate, chartStart, dayWidth);
  const isSingleDay    = differenceInDays(new Date(task.endDate), new Date(task.startDate)) === 0;
  const autoProgress   = task.computedProgress ?? task.progress;
  const manualProgress = task.progress;
  const hasChildren    = task.children?.length > 0;
  const showBoth       = hasChildren && autoProgress !== manualProgress;

  const bm       = getBarMetrics(task.type);
  const BAR_TOP  = Math.round((52 - bm.barH) / 2);
  const SPOT_TOP = Math.round((52 - bm.spotH) / 2);
  const spotHalf = bm.spotH / 2;

  const startDrag = (e, mode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const isSpot    = isSingleDay;
    const startX    = e.clientX;
    const origStart = new Date(task.startDate);
    const origEnd   = new Date(task.endDate);
    let latestStart = origStart;
    let latestEnd   = origEnd;
    let moved = false;

    document.body.style.cursor     = mode === 'resize' ? 'ew-resize' : 'grabbing';
    document.body.style.userSelect = 'none';

    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      if (!moved && Math.abs(dx) < 4) return;
      moved = true;
      wasDragged.current = true;
      const deltaDays = Math.round(dx / dayWidth);
      if (mode === 'resize') {
        latestEnd   = addDays(origEnd, deltaDays);
        if (latestEnd < origStart) latestEnd = new Date(origStart);
        latestStart = origStart;
      } else {
        latestStart = addDays(origStart, deltaDays);
        latestEnd   = addDays(origEnd,   deltaDays);
      }
      if (barRef.current) {
        const p = calcPos(latestStart, latestEnd, chartStart, dayWidth);
        if (isSpot) {
          barRef.current.style.left = (p.left + dayWidth / 2 - spotHalf) + 'px';
        } else {
          barRef.current.style.left  = p.left  + 'px';
          barRef.current.style.width = p.width + 'px';
        }
      }
    };

    const onUp = () => {
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup',   onUp);
      if (moved) {
        onUpdate?.(task.id, { startDate: latestStart, endDate: latestEnd });
        setTimeout(() => { wasDragged.current = false; }, 50);
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup',   onUp);
  };

  return (
    <div
      onMouseEnter={() => setRowHovered(true)}
      onMouseLeave={() => setRowHovered(false)}
      style={{ display: 'flex', height: 52, position: 'relative', zIndex: menuOpen ? 100 : 1 }}
    >
      {/* Sticky Task Name Cell */}
      <div
        onClick={() => onTaskClick(task)}
        style={{
          width: TASK_LIST_WIDTH, flexShrink: 0, position: 'sticky', left: 0,
          zIndex: menuOpen ? 200 : 20,
          background: rowHovered ? 'var(--gantt-cell-hover)' : 'var(--gantt-cell-bg)',
          backdropFilter: 'blur(10px)',
          borderRight: '1px solid var(--gantt-border)',
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          paddingLeft: `${task.depth * 18 + 16}px`, cursor: 'pointer',
          transition: 'background 0.2s', paddingRight: '0.5rem',
        }}
      >
        {hasChildren ? (
          <button
            onClick={e => { e.stopPropagation(); onToggleCollapse?.(task.id); }}
            title={collapsed ? '展開' : '折りたたみ'}
            style={{
              width: 18, height: 18, borderRadius: '0.3rem', border: 'none',
              background: 'transparent', color: tc.color, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--foreground) 8%, transparent)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            {collapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
          </button>
        ) : (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: tc.color, flexShrink: 0, marginLeft: 5, marginRight: 5 }} />
        )}
        <span style={{
          fontSize: '0.825rem', fontWeight: 600,
          color: task.status === 'active' ? 'var(--foreground)' : tc.color,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {task.title}
        </span>
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
            style={{
              width: 26, height: 26, borderRadius: '0.4rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: menuOpen ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: 'none', color: (rowHovered || menuOpen) ? '#fff' : 'transparent',
              cursor: 'pointer', transition: 'all 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = menuOpen ? 'rgba(255,255,255,0.1)' : 'transparent'}
          >
            <MoreVertical size={14} />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <TaskMenu
                task={task}
                onEdit={() => onTaskClick(task)}
                onDelete={() => onDelete?.(task.id)}
                onAddTask={onAddTask}
                onShare={onShare}
                onClose={() => setMenuOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Timeline Cell */}
      <div style={{
        flex: 1, position: 'relative', minWidth: numDays * dayWidth,
        backgroundImage: `
          repeating-linear-gradient(
            to right,
            transparent 0,
            transparent ${dayWidth * 7 - 1}px,
            var(--gantt-border-week) ${dayWidth * 7 - 1}px,
            var(--gantt-border-week) ${dayWidth * 7}px
          ),
          repeating-linear-gradient(
            to right,
            transparent 0,
            transparent ${dayWidth - 1}px,
            var(--gantt-border-day) ${dayWidth - 1}px,
            var(--gantt-border-day) ${dayWidth}px
          )
        `,
      }}>
        {isSingleDay ? (
          /* ── 1日スポット ── */
          <div
            ref={barRef}
            onPointerDown={e => startDrag(e, 'move')}
            onClick={() => { if (!wasDragged.current) onTaskClick(task); }}
            title={`${task.title} — ドラッグで移動`}
            style={{
              position: 'absolute',
              top: SPOT_TOP,
              left: pos.left + dayWidth / 2 - spotHalf,
              width: bm.spotH, height: bm.spotH, borderRadius: '50%',
              background: tc.color,
              cursor: 'grab', zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              userSelect: 'none',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            {COMPLETED_OVERLAY_ENABLED && task.status === 'completed' ? (
              <Check size={Math.max(10, bm.spotH - 8)} strokeWidth={3} style={{ color: '#fff', pointerEvents: 'none' }} />
            ) : (
              <span style={{ fontSize: bm.spotFont, fontWeight: 700, color: '#fff', lineHeight: 1, pointerEvents: 'none' }}>
                {autoProgress}%
              </span>
            )}
          </div>
        ) : (
          /* ── 複数日バー ── */
          <div
            ref={barRef}
            onPointerDown={e => startDrag(e, 'move')}
            onClick={() => { if (!wasDragged.current) onTaskClick(task); }}
            title={`${task.title} — ドラッグで移動 / 右端で期間変更`}
            style={{
              position: 'absolute',
              top: BAR_TOP,
              left: pos.left, width: pos.width, height: bm.barH,
              background: tc.color, borderRadius: bm.radius,
              cursor: 'grab', overflow: 'hidden', zIndex: 10,
              display: 'flex', alignItems: 'center', padding: `0 ${bm.barH < 16 ? '0.4rem' : '0.75rem'}`,
              userSelect: 'none',
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            {/* 自動計算進捗バー */}
            <div style={{ position: 'absolute', inset: 0, width: `${autoProgress}%`, background: 'rgba(255,255,255,0.22)', transition: 'width 0.4s', pointerEvents: 'none' }} />
            {/* 手動進捗ライン（子あり・差異あり時のみ） */}
            {showBoth && (
              <div style={{ position: 'absolute', top: 4, bottom: 4, left: 0, width: `${manualProgress}%`, borderRight: '2px dashed rgba(255,255,255,0.7)', pointerEvents: 'none', transition: 'width 0.4s' }} />
            )}
            {/* 完了タスクのストライプオーバーレイ */}
            {COMPLETED_OVERLAY_ENABLED && task.status === 'completed' && (
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.18) 0 6px, transparent 6px 12px)',
                mixBlendMode: 'overlay',
                borderRadius: bm.radius,
              }} />
            )}
            <span style={{ position: 'relative', zIndex: 1, fontSize: bm.barFont, fontWeight: 700, color: '#fff', pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 'calc(100% - 20px)', lineHeight: 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {COMPLETED_OVERLAY_ENABLED && task.status === 'completed' && (
                <Check size={Math.max(10, bm.barH - 8)} strokeWidth={3} style={{ opacity: 0.95 }} />
              )}
              {hasChildren && <Sparkles size={10} strokeWidth={2.4} style={{ opacity: 0.85 }} />}
              {autoProgress}%
              {showBoth && pos.width > 110 && (
                <span style={{ opacity: 0.75, fontWeight: 500, fontSize: '0.62rem', marginLeft: 5 }}>
                  手動:{manualProgress}%
                </span>
              )}
              {pos.width > 130 && (
                <span style={{ opacity: 0.75, fontWeight: 500, fontSize: '0.62rem', marginLeft: 5, fontFamily: 'Roboto Mono, ui-monospace, monospace' }}>
                  {format(new Date(task.startDate), 'M/d')}–{format(new Date(task.endDate), 'M/d')}
                </span>
              )}
            </span>
            {/* 右端リサイズハンドル */}
            <div
              onPointerDown={e => { e.stopPropagation(); startDrag(e, 'resize'); }}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0, width: 12,
                cursor: 'ew-resize', zIndex: 2, flexShrink: 0,
                opacity: rowHovered ? 1 : 0, transition: 'opacity 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <div style={{ width: 2, height: bm.handleH, background: 'rgba(255,255,255,0.75)', borderRadius: 1 }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ── GanttChart ────────────────────────────────────────────────────────────────
const COMPLETION_FILTER_KEY = 'tc_gantt_completion_filter';
const COLLAPSED_IDS_KEY     = 'tc_gantt_collapsed_ids';

// 親タスク(子を持つ)の id を全て収集
const collectParentIds = (items, acc = []) => {
  items.forEach(item => {
    if (item.children?.length > 0) {
      acc.push(item.id);
      collectParentIds(item.children, acc);
    }
  });
  return acc;
};

export const GanttChart = ({ tasks, onTaskClick, onDelete, onAddTask, onUpdate, onShare }) => {
  const [completionFilter, setCompletionFilter] = useState(() => {
    try {
      const saved = localStorage.getItem(COMPLETION_FILTER_KEY);
      if (saved === 'all' || saved === 'active' || saved === 'completed') return saved;
      // 旧キー（bool）からの移行
      if (localStorage.getItem('tc_gantt_hide_completed') === '1') return 'active';
    } catch {}
    return 'all';
  });
  const updateCompletionFilter = (mode) => {
    setCompletionFilter(mode);
    try { localStorage.setItem(COMPLETION_FILTER_KEY, mode); } catch {}
  };

  // 折りたたみ状態(id の Set)
  const [collapsedIds, setCollapsedIds] = useState(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_IDS_KEY);
      if (raw) return new Set(JSON.parse(raw));
    } catch {}
    return new Set();
  });
  const persistCollapsed = (next) => {
    try { localStorage.setItem(COLLAPSED_IDS_KEY, JSON.stringify([...next])); } catch {}
  };
  const toggleCollapse = (id) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      persistCollapsed(next);
      return next;
    });
  };
  const collapseAll = () => {
    const next = new Set(collectParentIds(tasks));
    setCollapsedIds(next);
    persistCollapsed(next);
  };
  const expandAll = () => {
    const next = new Set();
    setCollapsedIds(next);
    persistCollapsed(next);
  };

  const flattenedTasks = useMemo(() => {
    const flatten = (items, depth = 0) => {
      let res = [];
      items.forEach(item => {
        res.push({ ...item, depth });
        if (item.children?.length > 0 && !collapsedIds.has(item.id)) {
          res = [...res, ...flatten(item.children, depth + 1)];
        }
      });
      return res;
    };
    return flatten(filterByCompletion(tasks, completionFilter));
  }, [tasks, completionFilter, collapsedIds]);

  const { chartStart, chartEnd, days, monthGroups } = useMemo(() => {
    let s, e;
    if (flattenedTasks.length === 0) {
      s = startOfDay(new Date());
      e = endOfDay(addDays(s, 30));
    } else {
      const allDates = flattenedTasks.flatMap(t => [new Date(t.startDate), new Date(t.endDate)]);
      const minDate  = new Date(Math.min(...allDates));
      const maxDate  = new Date(Math.max(...allDates));
      s = startOfDay(subDays(minDate, 7));
      e = endOfDay(addDays(maxDate, 14));
    }

    const dayInterval = eachDayOfInterval({ start: s, end: e });

    const groups = [];
    dayInterval.forEach(day => {
      const mKey = format(day, 'yyyy-MM');
      if (groups.length === 0 || groups[groups.length - 1].key !== mKey) {
        groups.push({ key: mKey, label: format(day, 'MMMM yyyy'), days: 1 });
      } else {
        groups[groups.length - 1].days++;
      }
    });

    return { chartStart: s, chartEnd: e, days: dayInterval, monthGroups: groups };
  }, [flattenedTasks]);

  const [dayWidth, setDayWidth] = useState(20);
  const totalWidth = TASK_LIST_WIDTH + days.length * dayWidth;
  const today      = new Date();
  const todayOffset = differenceInDays(today, chartStart) * dayWidth;

  const scrollRef       = useRef(null);
  const hasAutoScrolled = useRef(false);

  useEffect(() => {
    if (!hasAutoScrolled.current && scrollRef.current && todayOffset > 0) {
      scrollRef.current.scrollLeft = Math.max(0, todayOffset - 300);
      hasAutoScrolled.current = true;
    }
  }, [todayOffset]);

  // 今月起点で N ヶ月分をコンテナ幅にぴったり収める
  const fitMonths = (n) => {
    if (!scrollRef.current) return;
    const containerW = scrollRef.current.clientWidth - TASK_LIST_WIDTH;
    const firstDay   = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay    = new Date(today.getFullYear(), today.getMonth() + n, 0);
    const spanDays   = differenceInDays(lastDay, firstDay) + 1;
    const dw = Math.max(8, Math.floor(containerW / spanDays));
    setDayWidth(dw);
    setTimeout(() => {
      if (!scrollRef.current) return;
      const left = Math.max(0, differenceInDays(firstDay, chartStart) * dw);
      scrollRef.current.scrollLeft = left;
    }, 0);
  };

  const zoomControls = [
    { label: '–',    fn: () => setDayWidth(w => Math.max(10, w - 8)), title: '縮小' },
    { label: '2ヶ月', fn: () => fitMonths(2),                          title: '2ヶ月全体表示' },
    { label: '1ヶ月', fn: () => fitMonths(1),                          title: '1ヶ月全体表示' },
    { label: '+',    fn: () => setDayWidth(w => Math.min(80, w + 8)), title: '拡大' },
    { label: '今日',  fn: () => { if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, differenceInDays(new Date(), chartStart) * dayWidth - 300); }, title: '今日にスクロール' },
  ];

  return (
    <div style={{ borderRadius: 'var(--radius-lg)', border: '1px solid var(--gantt-border)', background: 'var(--gantt-bg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>

      {/* ── ズームツールバー ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.65rem 1rem', borderBottom: '1px solid var(--gantt-border)', background: 'var(--gantt-header-bg)' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: '0.25rem' }}>
          表示範囲
        </span>
        {zoomControls.map(({ label, fn, title }) => (
          <button
            key={label}
            onClick={fn}
            title={title}
            style={{
              fontSize: '0.8rem', fontWeight: 700,
              padding: '0.3rem 0.75rem', borderRadius: '0.5rem',
              border: '1px solid var(--gantt-border)',
              background: 'var(--glass-bg)',
              color: 'var(--foreground)', cursor: 'pointer',
              letterSpacing: label.length > 2 ? '-0.01em' : 0,
              transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--primary) 10%, transparent)'; e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--primary) 35%, transparent)'; e.currentTarget.style.color = 'var(--primary-dark)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--glass-bg)'; e.currentTarget.style.borderColor = 'var(--gantt-border)'; e.currentTarget.style.color = 'var(--foreground)'; }}
          >
            {label}
          </button>
        ))}
        <div style={{ width: 1, height: 22, background: 'var(--gantt-border)', margin: '0 0.25rem' }} />
        <button
          onClick={collapseAll}
          title="すべて折りたたむ"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontSize: '0.72rem', fontWeight: 700,
            padding: '0.3rem 0.6rem', borderRadius: '0.5rem',
            border: '1px solid var(--gantt-border)', background: 'var(--glass-bg)',
            color: 'var(--foreground)', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--primary) 10%, transparent)'; e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--primary) 35%, transparent)'; e.currentTarget.style.color = 'var(--primary-dark)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--glass-bg)'; e.currentTarget.style.borderColor = 'var(--gantt-border)'; e.currentTarget.style.color = 'var(--foreground)'; }}
        >
          <ChevronsDownUp size={13} />閉じる
        </button>
        <button
          onClick={expandAll}
          title="すべて展開"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontSize: '0.72rem', fontWeight: 700,
            padding: '0.3rem 0.6rem', borderRadius: '0.5rem',
            border: '1px solid var(--gantt-border)', background: 'var(--glass-bg)',
            color: 'var(--foreground)', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--primary) 10%, transparent)'; e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--primary) 35%, transparent)'; e.currentTarget.style.color = 'var(--primary-dark)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--glass-bg)'; e.currentTarget.style.borderColor = 'var(--gantt-border)'; e.currentTarget.style.color = 'var(--foreground)'; }}
        >
          <ChevronsUpDown size={13} />開く
        </button>
        <div style={{ flex: 1 }} />
        <CompletionFilterTabs value={completionFilter} onChange={updateCompletionFilter} size="sm" />
        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: '0.5rem' }}>
          {dayWidth}px/日
        </span>
      </div>

      {/* ── スクロールエリア ── */}
      <div ref={scrollRef} style={{ overflow: 'auto', height: 'calc(100vh - 240px)', minHeight: 480, position: 'relative' }}>
        <div style={{ minWidth: totalWidth, display: 'flex', flexDirection: 'column' }}>

          {/* Sticky Header */}
          <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--gantt-header-bg)' }}>

            {/* Month Row */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--gantt-border)' }}>
              <div style={{
                width: TASK_LIST_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 120,
                background: 'var(--gantt-header-bg)', borderRight: '1px solid var(--gantt-border)', height: 40,
              }} />
              {monthGroups.map((mg, i) => (
                <div key={i} style={{
                  width: mg.days * dayWidth, flexShrink: 0,
                  height: 40, borderRight: '1.5px solid var(--gantt-month-end)',
                  display: 'flex', alignItems: 'center',
                }}>
                  <span style={{
                    fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)',
                    fontFamily: 'var(--font-sans)',
                    letterSpacing: '0.02em',
                    position: 'sticky', left: TASK_LIST_WIDTH + 12, whiteSpace: 'nowrap',
                  }}>
                    {mg.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Day Row */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--gantt-border)' }}>
              <div style={{
                width: TASK_LIST_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 120,
                background: 'var(--gantt-header-bg)', borderRight: '1px solid var(--gantt-border)',
                padding: '0 1rem', fontSize: '0.75rem', fontWeight: 900,
                textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)',
                height: 56, display: 'flex', alignItems: 'center',
              }}>
                <span>Task Name</span>
              </div>
              {days.map((day, i) => {
                const isToday = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                const dayNum  = day.getDay();
                const isSat   = dayNum === 6;
                const isSun   = dayNum === 0;
                const isHol   = isHoliday(day);
                const isRed   = isSun || isHol;
                const dateColor = isRed ? 'var(--danger)'
                  : isSat ? 'var(--saturday)'
                  : isToday ? 'var(--primary-dark)' : 'var(--text-subtle)';
                const labelColor = isRed ? 'var(--danger)'
                  : isSat ? 'var(--saturday)' : 'var(--text-muted)';
                return (
                  <div key={i} style={{
                    width: dayWidth, flexShrink: 0, height: 56,
                    borderRight: '1px solid var(--gantt-border-day)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: isToday
                      ? 'color-mix(in oklch, var(--primary) 12%, transparent)'
                      : isRed ? 'color-mix(in oklch, var(--danger) 6%, transparent)'
                      : isSat ? 'color-mix(in oklch, var(--saturday) 6%, transparent)'
                      : 'transparent',
                    boxShadow: isToday ? 'inset 0 -2px 0 var(--primary-dark)' : 'none',
                  }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: isToday ? 700 : 500, fontFamily: 'Roboto Mono, ui-monospace, monospace', color: dateColor }}>
                      {format(day, 'd')}
                    </span>
                    <span style={{ fontSize: '0.6rem', color: labelColor, opacity: isToday ? 1 : 0.65, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {format(day, 'EEEEE')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content Area */}
          <div style={{ position: 'relative' }}>
            {/* Vertical Grid Lines */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', paddingLeft: TASK_LIST_WIDTH, pointerEvents: 'none' }}>
              {days.map((day, i) => {
                const isToday    = format(day, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
                const isMonthEnd = i < days.length - 1 && format(day, 'MM') !== format(days[i + 1], 'MM');
                return (
                  <div key={i} style={{
                    width: dayWidth, flexShrink: 0, height: '100%',
                    borderRight: isMonthEnd ? '1.5px solid var(--gantt-month-end)' : '1px solid var(--gantt-border-day)',
                    background: isToday ? 'color-mix(in oklch, var(--primary) 6%, transparent)' : 'transparent',
                  }} />
                );
              })}
            </div>

            {/* Today Band */}
            {todayOffset >= 0 && (
              <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: TASK_LIST_WIDTH + todayOffset, width: dayWidth,
                background: 'color-mix(in oklch, var(--primary) 8%, transparent)',
                borderLeft: '1px solid color-mix(in oklch, var(--primary) 35%, transparent)',
                borderRight: '1px solid color-mix(in oklch, var(--primary) 35%, transparent)',
                zIndex: 1, pointerEvents: 'none',
              }} />
            )}

            {/* Task Rows */}
            {flattenedTasks.map((task, i) => (
              <TaskRow
                key={task.id}
                task={task}
                dayWidth={dayWidth}
                chartStart={chartStart}
                numDays={days.length}
                onTaskClick={onTaskClick}
                onDelete={onDelete}
                onAddTask={onAddTask}
                onUpdate={onUpdate}
                onShare={onShare}
                collapsed={collapsedIds.has(task.id)}
                onToggleCollapse={toggleCollapse}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
