import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Trash2, Sparkles, Calendar, Users, UserPlus, Crown, Edit3, Eye, Loader, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useGanttAuth';
import { useTaskMembers } from '../hooks/useTaskMembers';

// ── helpers ────────────────────────────────────────────────────────────────
const flattenTasks = (list, result = []) => {
  list.forEach(t => { result.push(t); if (t.children?.length) flattenTasks(t.children, result); });
  return result;
};

const TYPE_LABEL = { project: 'Project', milestone: 'Milestone', task: 'Task' };

const inputStyle = {
  background: 'var(--background)', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-md)', padding: '0.5rem 0.85rem',
  fontSize: '0.82rem', color: 'var(--foreground)', outline: 'none', width: '100%',
  transition: 'border-color 0.2s, box-shadow 0.2s',
};

const onFocusStyle = (e) => {
  e.target.style.borderColor = 'var(--primary)';
  e.target.style.boxShadow = '0 0 0 3px var(--primary-glow)';
};
const onBlurStyle = (e) => {
  e.target.style.borderColor = 'var(--border)';
  e.target.style.boxShadow = 'none';
};

// ── DatePicker ─────────────────────────────────────────────────────────────
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const DatePicker = ({ value, onChange, disabled }) => {
  const [open, setOpen]         = useState(false);
  const [viewYear, setViewYear] = useState(() => value ? parseInt(value.slice(0, 4)) : new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => value ? parseInt(value.slice(5, 7)) - 1 : new Date().getMonth());
  const containerRef = useRef(null);

  // 外クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  // 値が外部から変わったらビューを同期
  useEffect(() => {
    if (value) { setViewYear(parseInt(value.slice(0, 4))); setViewMonth(parseInt(value.slice(5, 7)) - 1); }
  }, [value]);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const selectedDate = value ? (() => { const d = new Date(value + 'T00:00:00'); d.setHours(0,0,0,0); return d; })() : null;

  // カレンダーグリッド生成
  const firstDow   = new Date(viewYear, viewMonth, 1).getDay();
  const daysInCur  = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();
  const cells = [];
  for (let i = firstDow - 1; i >= 0; i--)   cells.push({ d: daysInPrev - i, rel: -1 });
  for (let d = 1; d <= daysInCur; d++)        cells.push({ d, rel: 0 });
  while (cells.length < 42)                   cells.push({ d: cells.length - daysInCur - firstDow + 1, rel: 1 });

  const isSel = ({ d, rel }) => {
    if (!selectedDate || rel !== 0) return false;
    return selectedDate.getFullYear() === viewYear && selectedDate.getMonth() === viewMonth && selectedDate.getDate() === d;
  };
  const isTod = ({ d, rel }) => {
    if (rel !== 0) return false;
    return today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;
  };

  const select = (cell) => {
    const m = viewMonth + cell.rel;
    const y = viewYear + (m < 0 ? -1 : m > 11 ? 1 : 0);
    const d = new Date(y, ((m % 12) + 12) % 12, cell.d);
    onChange(format(d, 'yyyy-MM-dd'));
    setOpen(false);
  };

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };

  const navBtn = (onClick, Icon) => (
    <button onClick={onClick} style={{
      width: 30, height: 30, borderRadius: '0.5rem', border: '1px solid var(--border)',
      background: 'var(--surface-2)', color: 'var(--text-muted)', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--primary) 12%, transparent)'; e.currentTarget.style.color = 'var(--primary-dark)'; e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--primary) 30%, transparent)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
    ><Icon size={14} /></button>
  );

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* トリガーボタン */}
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
          border: `1px solid ${open ? 'var(--primary)' : 'var(--border)'}`,
          boxShadow: open ? '0 0 0 3px var(--primary-glow)' : 'none',
          textAlign: 'left', userSelect: 'none', width: '100%',
        }}
      >
        <span style={{ fontSize: '0.82rem', color: value ? 'var(--foreground)' : 'var(--text-muted)' }}>
          {value ? value.replace(/-/g, '/') : '日付を選択'}
        </span>
        <Calendar size={13} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: '0.5rem' }} />
      </button>

      {/* カレンダードロップダウン */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{   opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 9999,
              width: 240, padding: '0.8rem',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '1rem',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {/* ヘッダー：月ナビ */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              {navBtn(prevMonth, ChevronLeft)}
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--foreground)', letterSpacing: '-0.01em' }}>
                {viewYear}年 {viewMonth + 1}月
              </span>
              {navBtn(nextMonth, ChevronRight)}
            </div>

            {/* 曜日ヘッダー */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: '0.3rem' }}>
              {DAY_LABELS.map((d, i) => (
                <div key={d} style={{
                  textAlign: 'center', fontSize: '0.55rem', fontWeight: 700, padding: '0.1rem 0',
                  color: i === 0 ? 'var(--danger)' : i === 6 ? 'var(--primary-dark)' : 'var(--text-muted)',
                }}>{d}</div>
              ))}
            </div>

            {/* 日付セル */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cells.map((cell, idx) => {
                const sel = isSel(cell);
                const tod = isTod(cell);
                const cur = cell.rel === 0;
                return (
                  <button key={idx} onClick={() => select(cell)} style={{
                    height: 30, width: '100%', borderRadius: '0.4rem', border: 'none',
                    cursor: 'pointer', fontSize: '0.72rem', fontWeight: sel ? 700 : cur ? 500 : 400,
                    background: sel
                      ? 'var(--primary)'
                      : tod ? 'color-mix(in oklch, var(--primary) 14%, transparent)' : 'transparent',
                    color: sel ? '#fff' : tod ? 'var(--primary-dark)' : cur ? 'var(--foreground)' : 'var(--text-muted)',
                    opacity: !cur && !sel ? 0.4 : 1,
                    outline: tod && !sel ? '1px solid color-mix(in oklch, var(--primary) 45%, transparent)' : 'none',
                    outlineOffset: -1,
                    transition: 'all 0.12s ease',
                  }}
                    onMouseEnter={e => { if (!sel) { e.currentTarget.style.background = cur ? 'var(--surface-2)' : 'transparent'; } }}
                    onMouseLeave={e => { if (!sel) { e.currentTarget.style.background = tod ? 'color-mix(in oklch, var(--primary) 14%, transparent)' : 'transparent'; } }}
                  >{cell.d}</button>
                );
              })}
            </div>

            {/* 今日ボタン */}
            <div style={{ marginTop: '0.5rem', paddingTop: '0.4rem',
              borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { onChange(format(new Date(), 'yyyy-MM-dd')); setOpen(false); }}
                style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--primary-dark)', background: 'none',
                  border: 'none', cursor: 'pointer', padding: '0.25rem 0.6rem',
                  borderRadius: '0.375rem', transition: 'background 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in oklch, var(--primary) 12%, transparent)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >今日</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── CustomSelect ─────────────────────────────────────────────────────────────
const CustomSelect = ({ value, onChange, options, placeholder = '選択...', style = {}, disabled = false }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  const selectedOption = options.find(o => String(o.value) === String(value));

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      <button
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
        style={{
          ...inputStyle,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          border: `1px solid ${open ? 'var(--primary)' : 'var(--border)'}`,
          boxShadow: open ? '0 0 0 3px var(--primary-glow)' : 'none',
          textAlign: 'left',
          userSelect: 'none',
        }}
      >
        <span style={{ fontSize: '0.82rem', color: selectedOption ? 'var(--foreground)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronRight size={14} style={{
          transform: `rotate(${open ? 90 : 0}deg)`,
          transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          color: 'var(--text-muted)',
          flexShrink: 0,
          marginLeft: '0.5rem'
        }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 9999,
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '0.75rem',
              boxShadow: 'var(--shadow-lg)',
              padding: '0.35rem',
              overflow: 'hidden',
            }}
          >
            <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }} className="custom-scrollbar">
              {options.map(opt => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <button
                    key={opt.value}
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    style={{
                      padding: '0.55rem 0.75rem',
                      textAlign: 'left',
                      background: isSelected ? 'color-mix(in oklch, var(--primary) 14%, transparent)' : 'transparent',
                      border: 'none',
                      borderRadius: '0.5rem',
                      color: isSelected ? 'var(--primary-dark)' : 'var(--foreground)',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      transition: 'all 0.12s ease',
                      fontWeight: isSelected ? 700 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── MembersTab ─────────────────────────────────────────────────────────────
const ROLE_META = {
  editor: { Icon: Edit3, label: 'Editor', color: 'var(--primary-dark)' },
  viewer: { Icon: Eye,   label: 'Viewer', color: 'var(--text-muted)' },
};

const MembersTab = ({ taskId, ownerId }) => {
  const { user, profile } = useAuth();
  const { members, loading, addMember, removeMember, changeRole } = useTaskMembers(taskId);
  const [email,   setEmail]   = useState('');
  const [role,    setRole]    = useState('viewer');
  const [adding,  setAdding]  = useState(false);
  const [errMsg,  setErrMsg]  = useState('');

  const isOwner = user?.id === ownerId;

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    setErrMsg('');
    try {
      await addMember(email.trim(), role);
      setEmail('');
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setAdding(false);
    }
  };

  const getInitials = (p) => {
    const n = p?.display_name ?? p?.email ?? '';
    const parts = n.replace(/_/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return n.slice(0, 2).toUpperCase() || '?';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Owner row */}
      <div>
        <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>オーナー</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.6rem 0.875rem', background: 'color-mix(in oklch, var(--warning) 8%, transparent)',
          border: '1px solid color-mix(in oklch, var(--warning) 22%, transparent)', borderRadius: 'var(--radius-md)' }}>
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: 'var(--warning)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.65rem', fontWeight: 800, color: '#fff' }}>
              {getInitials(profile ?? user?.user_metadata)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>
              {user?.user_metadata?.full_name ?? 'You'} <span style={{ fontSize: '0.68rem', color: 'var(--warning)' }}>(あなた)</span>
            </p>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{user?.email}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.7rem', color: 'var(--warning)', fontWeight: 700 }}>
            <Crown size={12} /> Owner
          </div>
        </div>
      </div>

      {/* Member list */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
          <Loader size={16} style={{ color: 'var(--text-muted)', animation: 'spin 1s linear infinite' }} />
        </div>
      ) : members.length > 0 && (
        <div>
          <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            メンバー ({members.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {members.map((m) => {
              const p = m.profile ?? {};
              const meta = ROLE_META[m.role] ?? ROLE_META.viewer;
              return (
                <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.55rem 0.875rem', background: 'var(--surface-2)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--primary-dark)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.65rem', fontWeight: 800, color: '#fff' }}>
                    {getInitials(p)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--foreground)' }}>
                      {p.display_name ?? p.email}
                    </p>
                    {p.display_name && <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.email}</p>}
                  </div>
                  {isOwner ? (
                    <CustomSelect
                      value={m.role}
                      onChange={val => changeRole(m.user_id, val)}
                      options={[
                        { value: 'editor', label: 'Editor' },
                        { value: 'viewer', label: 'Viewer' }
                      ]}
                      style={{ width: '100px' }}
                    />
                  ) : (
                    <span style={{ fontSize: '0.72rem', color: meta.color, fontWeight: 600 }}>
                      {meta.label}
                    </span>
                  )}
                  {isOwner && (
                    <button onClick={() => removeMember(m.user_id)}
                      style={{ width: 22, height: 22, borderRadius: '0.375rem', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: 'none',
                        color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--danger) 14%, transparent)'; e.currentTarget.style.color = 'var(--danger)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                    ><X size={12} /></button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite form — オーナーのみ */}
      {isOwner && (
        <div>
          <p style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>メンバーを招待</p>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="email@example.com"
                style={{ ...inputStyle, flex: 1 }}
                onFocus={onFocusStyle} onBlur={onBlurStyle}
                disabled={adding}
              />
              <CustomSelect
                value={role}
                onChange={val => setRole(val)}
                options={[
                  { value: 'viewer', label: 'Viewer' },
                  { value: 'editor', label: 'Editor' }
                ]}
                style={{ width: '110px' }}
              />
            </div>
            {errMsg && <p style={{ fontSize: '0.72rem', color: 'var(--danger)', marginTop: '0.1rem' }}>{errMsg}</p>}
            <button type="submit" disabled={adding || !email.trim()}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                padding: '0.55rem 1rem', borderRadius: 'var(--radius-md)',
                background: 'color-mix(in oklch, var(--primary) 14%, transparent)', border: '1px solid color-mix(in oklch, var(--primary) 32%, transparent)',
                color: 'var(--primary-dark)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer',
                opacity: adding || !email.trim() ? 0.5 : 1, transition: 'all 0.2s' }}>
              {adding ? <Loader size={13} /> : <UserPlus size={13} />}
              {adding ? '招待中...' : '招待する'}
            </button>
          </form>
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Editor: 編集可能 / Viewer: 閲覧のみ
          </p>
        </div>
      )}
    </div>
  );
};

// ── TaskEditor ─────────────────────────────────────────────────────────────
export const TaskEditor = ({ task, tasks = [], isOpen, onClose, onSave, onDelete, initialTab = 'detail' }) => {
  const [activeTab,  setActiveTab]  = useState('detail');
  const [editedTask, setEditedTask] = useState(null);
  const [isSameDay,  setIsSameDay]  = useState(false);
  const [saving,     setSaving]     = useState(false);

  const flatTasks = flattenTasks(tasks);
  const potentialParents = flatTasks.filter(t => t.id !== task?.id);

  // タブを初期化（呼び出し側から指定可）
  useEffect(() => { if (isOpen) setActiveTab(initialTab); }, [isOpen, initialTab]);

  useEffect(() => {
    if (task) {
      const s = format(new Date(task.startDate), 'yyyy-MM-dd');
      const e = format(new Date(task.endDate),   'yyyy-MM-dd');
      setEditedTask({ ...task, startDate: s, endDate: e });
      setIsSameDay(s === e);
    } else if (isOpen) {
      const s = format(new Date(), 'yyyy-MM-dd');
      const e = format(addDays(new Date(), 7), 'yyyy-MM-dd');
      setEditedTask({ title: '', type: 'project', progress: 0, status: 'active', parentId: null, startDate: s, endDate: e, color: null });
      setIsSameDay(false);
    }
  }, [task, isOpen]);

  if (!isOpen || !editedTask) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditedTask(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'startDate' && isSameDay) next.endDate = value;
      // completed → progress 自動 100
      if (name === 'status' && value === 'completed') next.progress = 100;
      return next;
    });
  };

  const handleToggleSameDay = (e) => {
    const checked = e.target.checked;
    setIsSameDay(checked);
    setEditedTask(prev => ({
      ...prev,
      endDate: checked ? prev.startDate : format(addDays(new Date(prev.startDate), 7), 'yyyy-MM-dd'),
    }));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(task?.id, {
        ...editedTask,
        progress:  parseInt(editedTask.progress),
        startDate: new Date(editedTask.startDate),
        endDate:   new Date(editedTask.endDate),
      });
    } finally {
      setSaving(false);
    }
  };

  const Label = ({ children, right }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
      <label style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: 'var(--text-muted)' }}>{children}</label>
      {right && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)' }}>{right}</span>}
    </div>
  );

  // Members タブは保存済みタスクで常に表示（type 問わず共有可能）
  const showMembers = !!task?.id;
  const tabs = [
    { id: 'detail',  label: '詳細' },
    ...(showMembers ? [{ id: 'members', label: <><Users size={12} style={{ display: 'inline', marginRight: 4 }} />共有</>}] : []),
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="modal-overlay"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }} onClick={onClose}
        >
          <motion.div className="modal-content"
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 20 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: '0.75rem',
                  background: 'color-mix(in oklch, var(--primary) 14%, transparent)',
                  border: '1px solid color-mix(in oklch, var(--primary) 28%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={16} color="var(--primary-dark)" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '-0.02em' }}>
                    {task ? `Edit ${TYPE_LABEL[task.type] ?? 'Task'}` : `New ${TYPE_LABEL[editedTask?.type] ?? 'Project'}`}
                  </h3>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                    {task ? 'Update details' : 'Fill in the details below'}
                  </p>
                </div>
              </div>
              <button onClick={onClose}
                style={{ width: 32, height: 32, borderRadius: '0.625rem',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--danger) 12%, transparent)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--danger) 28%, transparent)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              ><X size={15} /></button>
            </div>

            {/* Tabs */}
            {tabs.length > 1 && (
              <div style={{ display: 'flex', gap: 0, marginBottom: '1rem',
                borderBottom: '1px solid var(--border)' }}>
                {tabs.map(t => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)}
                    style={{ padding: '0.5rem 1rem', background: 'none', border: 'none',
                      color: activeTab === t.id ? 'var(--primary-dark)' : 'var(--text-muted)',
                      fontWeight: activeTab === t.id ? 700 : 500, fontSize: '0.8rem',
                      cursor: 'pointer', borderBottom: `2px solid ${activeTab === t.id ? 'var(--primary)' : 'transparent'}`,
                      transition: 'all 0.2s', display: 'flex', alignItems: 'center' }}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ height: 1, background: 'var(--border)',
              marginBottom: '1.25rem' }} />

            {/* Detail Tab */}
            {activeTab === 'detail' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Title */}
                <div>
                  <Label>Title</Label>
                  <input type="text" name="title" value={editedTask.title} onChange={handleChange}
                    className="input-field" placeholder="Enter task title..." />
                </div>

                {/* Dates */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <Label>Start Date</Label>
                      <DatePicker
                        value={editedTask.startDate}
                        onChange={val => setEditedTask(prev => {
                          const next = { ...prev, startDate: val };
                          if (isSameDay) next.endDate = val;
                          return next;
                        })}
                      />
                    </div>
                    <div>
                      <Label>End Date</Label>
                      <DatePicker
                        value={editedTask.endDate}
                        onChange={val => setEditedTask(prev => ({ ...prev, endDate: val }))}
                        disabled={isSameDay}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '0.25rem' }}>
                    <input type="checkbox" id="isSameDay" checked={isSameDay} onChange={handleToggleSameDay}
                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--primary)' }} />
                    <label htmlFor="isSameDay" style={{ fontSize: '0.75rem', color: 'var(--text-subtle)',
                      cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Calendar size={12} strokeWidth={2.5} />同日（1日のみ）
                    </label>
                  </div>
                </div>

                {/* Type + Status */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div>
                    <Label>Type</Label>
                    <CustomSelect
                      value={editedTask.type}
                      onChange={val => setEditedTask(prev => ({ ...prev, type: val, parentId: null }))}
                      options={[
                        { value: 'project', label: 'Project' },
                        { value: 'milestone', label: 'Milestone' },
                        { value: 'task', label: 'Task' }
                      ]}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <CustomSelect
                      value={editedTask.status}
                      onChange={val => setEditedTask(prev => {
                        const next = { ...prev, status: val };
                        if (val === 'completed') next.progress = 100;
                        return next;
                      })}
                      options={[
                        { value: 'active', label: 'Active' },
                        { value: 'completed', label: 'Completed' },
                        { value: 'warning', label: 'Warning' },
                        { value: 'on-hold', label: 'On Hold' }
                      ]}
                    />
                  </div>
                </div>

                {/* Parent */}
                <div>
                  <Label>Parent (Project or Milestone)</Label>
                  <CustomSelect
                    value={editedTask.parentId ?? ''}
                    onChange={val => setEditedTask(prev => ({ ...prev, parentId: val || null }))}
                    placeholder="— なし（トップレベル） —"
                    options={[
                      { value: '', label: '— なし（トップレベル） —' },
                      ...potentialParents.map(p => ({
                        value: p.id,
                        label: <>{p.type === 'project' ? '📁' : p.type === 'milestone' ? '🚩' : '•'} {p.title}</>
                      }))
                    ]}
                  />
                </div>

                {/* Color */}
                <div>
                  <Label>バー色</Label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    {[
                      { value: null,                        label: 'デフォルト' },
                      { value: 'oklch(0.65 0.19 270)',      label: 'violet' },
                      { value: 'oklch(0.68 0.17 230)',      label: 'blue' },
                      { value: 'oklch(0.72 0.13 190)',      label: 'teal' },
                      { value: 'oklch(0.72 0.16 150)',      label: 'green' },
                      { value: 'oklch(0.78 0.15 90)',       label: 'yellow' },
                      { value: 'oklch(0.72 0.18 50)',       label: 'orange' },
                      { value: 'oklch(0.65 0.22 25)',       label: 'red' },
                      { value: 'oklch(0.7 0.2 350)',        label: 'pink' },
                    ].map((opt) => {
                      const selected = (editedTask.color ?? null) === opt.value;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          title={opt.label}
                          onClick={() => setEditedTask((prev) => ({ ...prev, color: opt.value }))}
                          style={{
                            width: 28, height: 28,
                            borderRadius: 'var(--radius-round)',
                            background: opt.value
                              ? opt.value
                              : 'repeating-linear-gradient(45deg, var(--surface-2) 0 4px, var(--border) 4px 8px)',
                            border: selected ? '2px solid var(--primary)' : '2px solid transparent',
                            boxShadow: selected
                              ? `0 0 0 2px color-mix(in oklab, var(--primary) 35%, transparent)`
                              : 'none',
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'transform var(--duration-fast) var(--ease-out)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.1)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                        />
                      );
                    })}
                  </div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 6 }}>
                    デフォルト: ステータス色 (進行中/保留/完了) を使用
                  </div>
                </div>

                {/* Progress */}
                <div>
                  <Label right={`${editedTask.progress}%`}>Progress</Label>
                  <div style={{ position: 'relative', marginTop: '0.75rem' }}>
                    <div className="progress-track" style={{ height: 8 }}>
                      <div className="progress-fill" style={{
                        width: `${editedTask.progress}%`,
                        background: 'var(--primary)',
                        transition: 'width 0.2s ease',
                      }} />
                    </div>
                    <input type="range" name="progress" min="0" max="100" value={editedTask.progress}
                      onChange={handleChange}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                        opacity: 0, cursor: 'pointer', margin: 0 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem' }}>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>0%</span>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>100%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Members Tab */}
            {activeTab === 'members' && task?.id && (
              <MembersTab taskId={task.id} ownerId={task.ownerId ?? task.owner_id} />
            )}

            <div style={{ height: 1, background: 'var(--border)',
              margin: '1.75rem 0 1.25rem' }} />

            {/* Actions (detail tab のみ) */}
            {activeTab === 'detail' && (
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={handleSave} disabled={saving} className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center', padding: '0.75rem', opacity: saving ? 0.65 : 1 }}>
                  {saving ? <Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button title="Delete Task" onClick={() => task?.id && onDelete?.(task.id)}
                  style={{ padding: '0.75rem 1rem', background: 'color-mix(in oklch, var(--danger) 8%, transparent)',
                    border: '1px solid color-mix(in oklch, var(--danger) 22%, transparent)', borderRadius: 'var(--radius-md)',
                    color: 'var(--danger)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--danger) 16%, transparent)'; e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--danger) 36%, transparent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--danger) 8%, transparent)'; e.currentTarget.style.borderColor = 'color-mix(in oklch, var(--danger) 22%, transparent)'; }}
                ><Trash2 size={17} /></button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
