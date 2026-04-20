import React, { useState, useMemo } from 'react';
import { Search, ChevronRight, Plus, MoreVertical, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { TaskMenu } from './TaskMenu';

// ネストツリー → フラット配列
const flattenTasks = (tasks, depth = 0, parentTitle = null) => {
  const result = [];
  (tasks ?? []).forEach(task => {
    result.push({ ...task, depth, parentTitle });
    if (task.children?.length) {
      result.push(...flattenTasks(task.children, depth + 1, task.title));
    }
  });
  return result;
};

const STATUS_COLORS = {
  active:    { bg: 'color-mix(in oklch, var(--primary) 14%, transparent)',  text: 'var(--primary-dark)', label: 'Active'    },
  completed: { bg: 'color-mix(in oklch, var(--success) 14%, transparent)',  text: 'var(--success)',      label: 'Completed' },
  warning:   { bg: 'color-mix(in oklch, var(--warning) 16%, transparent)',  text: 'var(--warning)',      label: 'Warning'   },
  'on-hold': { bg: 'var(--surface-2)',                                      text: 'var(--text-muted)',   label: 'On Hold'   },
};
const TYPE_COLORS = {
  project:   'var(--primary-dark)',
  milestone: 'var(--warning)',
  task:      'var(--primary)',
};

export const ListView = ({ tasks, onTaskClick, onNewTask, onDelete, onAddTask }) => {
  const [typeFilter,   setTypeFilter]   = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search,       setSearch]       = useState('');
  const [searchFocus,  setSearchFocus]  = useState(false);

  const flatTasks = useMemo(() => flattenTasks(tasks), [tasks]);

  const filtered = useMemo(() => flatTasks.filter(t => {
    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [flatTasks, typeFilter, statusFilter, search]);

  const TypeBtn = ({ value, label, color }) => {
    const c = color ?? 'var(--primary)';
    const active = typeFilter === value;
    return (
      <button
        onClick={() => setTypeFilter(value)}
        style={{
          padding: '0.35rem 0.9rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
          border: `1px solid ${active ? `color-mix(in oklch, ${c} 40%, transparent)` : 'var(--border)'}`,
          background: active ? `color-mix(in oklch, ${c} 14%, transparent)` : 'var(--surface-2)',
          color: active ? c : 'var(--text-muted)',
          cursor: 'pointer', transition: 'all 0.18s ease',
        }}
      >{label}</button>
    );
  };

  const StatusBtn = ({ value, label }) => {
    const s = STATUS_COLORS[value] ?? { bg: 'var(--surface-2)', text: 'var(--text-muted)' };
    const active = statusFilter === value;
    return (
      <button
        onClick={() => setStatusFilter(value)}
        style={{
          padding: '0.35rem 0.9rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600,
          border: `1px solid ${active ? `color-mix(in oklch, ${s.text} 40%, transparent)` : 'var(--border)'}`,
          background: active ? s.bg : 'var(--surface-2)',
          color: active ? s.text : 'var(--text-muted)',
          cursor: 'pointer', transition: 'all 0.18s ease',
        }}
      >{label}</button>
    );
  };

  return (
    <div style={{ maxWidth: '82rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '0.25rem' }}>
            Task List
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {filtered.length} 件 / 全 {flatTasks.length} タスク
          </p>
        </div>
        <button className="btn-primary" onClick={onNewTask}>
          <Plus size={15} />
          新規プロジェクト
        </button>
      </div>

      {/* Filter bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '1rem', padding: '0.875rem 1.25rem',
      }}>
        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: searchFocus ? 'var(--surface-2)' : 'var(--surface-2)',
          border: `1px solid ${searchFocus ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius: '0.625rem', padding: '0.4rem 0.75rem', width: 200,
          transition: 'all 0.2s ease', boxShadow: searchFocus ? '0 0 0 3px var(--primary-glow)' : 'none',
        }}>
          <Search size={13} style={{ color: searchFocus ? 'var(--primary-dark)' : 'var(--text-muted)', flexShrink: 0, transition: 'color 0.2s' }} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocus(true)} onBlur={() => setSearchFocus(false)}
            placeholder="タスクを検索..."
            style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: '0.78rem', color: 'var(--foreground)', width: '100%' }}
          />
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Type filters */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <TypeBtn value="all"       label="All"       />
          <TypeBtn value="project"   label="Project"   color={TYPE_COLORS.project} />
          <TypeBtn value="milestone" label="Milestone" color={TYPE_COLORS.milestone} />
          <TypeBtn value="task"      label="Task"      color={TYPE_COLORS.task} />
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

        {/* Status filters */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <StatusBtn value="all"       label="すべて" />
          <StatusBtn value="active"    label="Active" />
          <StatusBtn value="completed" label="Completed" />
          <StatusBtn value="warning"   label="Warning" />
          <StatusBtn value="on-hold"   label="On Hold" />
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: '1rem',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '2fr 80px 110px 160px 100px 100px 48px',
          padding: '0.75rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          {['タスク名', 'タイプ', 'ステータス', '進捗', '開始日', '終了日', ''].map((col, i) => (
            <span key={i} style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>
              {col}
            </span>
          ))}
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            タスクが見つかりません
          </div>
        ) : (
          filtered.map((task, i) => <ListRow key={task.id} task={task} index={i} total={filtered.length} onTaskClick={onTaskClick} onDelete={onDelete} onAddTask={onAddTask} />)
        )}
      </div>
    </div>
  );
};

const ListRow = ({ task, index, total, onTaskClick, onDelete, onAddTask }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const st = STATUS_COLORS[task.status] ?? STATUS_COLORS.active;
  const tc = TYPE_COLORS[task.type] ?? 'var(--primary)';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      style={{
        display: 'grid', gridTemplateColumns: '2fr 80px 110px 160px 100px 100px 48px',
        padding: '0.875rem 1.25rem', alignItems: 'center',
        borderBottom: index < total - 1 ? '1px solid var(--border)' : 'none',
        transition: 'background 0.18s ease', cursor: 'pointer',
        position: 'relative',
        zIndex: menuOpen ? 100 : 1,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      onClick={() => onTaskClick(task)}
    >
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
        {task.depth > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', paddingLeft: task.depth * 16 }}>
            <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </div>
        )}
        <span style={{
          fontSize: '0.825rem', fontWeight: task.depth === 0 ? 600 : 400,
          color: task.depth === 0 ? 'var(--foreground)' : 'var(--text-subtle)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{task.title}</span>
      </div>

      {/* Type */}
      <span style={{
        fontSize: '0.68rem', fontWeight: 700, textTransform: 'capitalize',
        color: tc,
        background: `color-mix(in oklch, ${tc} 12%, transparent)`,
        border: `1px solid color-mix(in oklch, ${tc} 28%, transparent)`,
        padding: '0.2rem 0.55rem', borderRadius: '999px', width: 'fit-content',
      }}>{task.type}</span>

      {/* Status */}
      <span style={{
        fontSize: '0.68rem', fontWeight: 600,
        color: st.text, background: st.bg,
        border: `1px solid color-mix(in oklch, ${st.text} 28%, transparent)`,
        padding: '0.2rem 0.6rem', borderRadius: '999px', width: 'fit-content',
      }}>{st.label}</span>

      {/* Progress */}
      {(() => {
        const displayProgress = task.computedProgress ?? task.progress;
        const hasChildren = task.children?.length > 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <div style={{
                height: 5, borderRadius: '999px',
                background: 'var(--border)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: '999px',
                  width: `${displayProgress}%`,
                  background: displayProgress >= 100 ? 'var(--success)' : 'var(--primary)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, width: 32, textAlign: 'right' }}>
                {displayProgress}%
              </span>
              {hasChildren && (
                <span title="子タスクの平均から自動計算" style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '0.1rem 0.3rem', borderRadius: '999px',
                  background: 'color-mix(in oklch, var(--primary) 14%, transparent)',
                  color: 'var(--primary-dark)',
                  border: '1px solid color-mix(in oklch, var(--primary) 28%, transparent)',
                }}>
                  <Sparkles size={9} strokeWidth={2.4} />
                </span>
              )}
            </div>
          </div>
        );
      })()}

      {/* Start date */}
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        {task.startDate ? format(new Date(task.startDate), 'M/d') : '-'}
      </span>

      {/* End date */}
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        {task.endDate ? format(new Date(task.endDate), 'M/d') : '-'}
      </span>

      {/* Menu button */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          style={{
            width: 28, height: 28, borderRadius: '0.5rem', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: menuOpen ? 'var(--surface-2)' : 'transparent',
            border: menuOpen ? '1px solid var(--border)' : '1px solid transparent',
            color: menuOpen ? 'var(--foreground)' : 'var(--text-muted)', cursor: 'pointer', transition: 'all 0.18s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--primary) 12%, transparent)'; e.currentTarget.style.color = 'var(--primary-dark)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = menuOpen ? 'var(--surface-2)' : 'transparent'; e.currentTarget.style.color = menuOpen ? 'var(--foreground)' : 'var(--text-muted)'; }}
        >
          <MoreVertical size={12} />
        </button>
        <AnimatePresence>
          {menuOpen && (
            <TaskMenu
              task={task}
              onEdit={() => onTaskClick(task)}
              onDelete={() => onDelete?.(task.id)}
              onAddTask={onAddTask}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
