import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronRight, ChevronDown, MoreVertical,
  Calendar as CalendarIcon, Flag, Circle, Layers, Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { TaskMenu } from './TaskMenu';

const TYPE_CONFIG = {
  project:   { label: 'Project',   color: 'var(--primary-dark)' },
  milestone: { label: 'Milestone', color: 'var(--warning)'      },
  task:      { label: 'Task',      color: 'var(--primary)'      },
};

const STATUS_COLOR = {
  completed: { color: 'var(--success)',    label: 'Completed' },
  warning:   { color: 'var(--warning)',    label: 'Warning'   },
  'on-hold': { color: 'var(--text-muted)', label: 'On Hold'   },
  active:    { color: null,                label: 'Active'    },
};

const TaskItem = ({ task, depth = 0, onTaskClick, onDelete, onAddTask, onShare }) => {
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const prevChildrenCount = useRef(task.children?.length || 0);

  // 子要素が追加されたら自動で展開する
  useEffect(() => {
    const currentCount = task.children?.length || 0;
    if (currentCount > prevChildrenCount.current) {
      setIsExpanded(true);
    }
    prevChildrenCount.current = currentCount;
  }, [task.children?.length]);
  const hasChildren = task.children && task.children.length > 0;
  const typeConf  = TYPE_CONFIG[task.type] ?? TYPE_CONFIG.task;
  const statusConf = STATUS_COLOR[task.status] ?? STATUS_COLOR.active;
  // active のときはタイプカラー、それ以外はステータスカラー
  const accentColor = statusConf.color ?? typeConf.color;

  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <motion.div
        layout
        whileTap={{ scale: 0.995 }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onClick={() => onTaskClick(task)}
        style={{
          zIndex: menuOpen ? 100 : 1,
          display: 'flex', alignItems: 'center',
          padding: '0.875rem 1.25rem',
          background: hovered ? 'var(--surface-2)' : 'var(--surface)',
          border: `1px solid ${hovered ? `color-mix(in oklch, ${accentColor} 30%, var(--border))` : 'var(--border)'}`,
          borderRadius: '0.875rem',
          cursor: 'pointer',
          transition: 'background 0.2s ease, border-color 0.2s ease',
          boxShadow: hovered ? 'var(--shadow-sm)' : 'none',
          marginLeft: `${depth * 20}px`,
          position: 'relative',
        }}
      >
        {/* Expand / leaf icon */}
        <div style={{ marginLeft: '0.25rem', marginRight: '0.75rem', flexShrink: 0 }}>
          {hasChildren ? (
            <button
              onClick={e => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
              style={{
                width: 24, height: 24, borderRadius: '0.375rem',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-subtle)', cursor: 'pointer', transition: 'all 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'color-mix(in oklch, var(--primary) 12%, transparent)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--surface-2)'}
            >
              {isExpanded
                ? <ChevronDown size={13} />
                : <ChevronRight size={13} />}
            </button>
          ) : (
            <Circle size={7} fill={accentColor} color="transparent" style={{ margin: '0 0.5rem' }} />
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.4rem' }}>
            {/* タイプバッジ */}
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
              padding: '0.15rem 0.5rem', borderRadius: '999px',
              background: `color-mix(in oklch, ${accentColor} 12%, transparent)`,
              color:      accentColor,
              border:     `1px solid color-mix(in oklch, ${accentColor} 28%, transparent)`,
            }}>
              {task.type}
            </span>
            {/* ステータスバッジ（active 以外）*/}
            {task.status !== 'active' && (
              <span style={{
                fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                padding: '0.12rem 0.45rem', borderRadius: '999px',
                background: `color-mix(in oklch, ${accentColor} 14%, transparent)`, color: accentColor,
                border: `1px solid color-mix(in oklch, ${accentColor} 32%, transparent)`,
              }}>
                {statusConf.label}
              </span>
            )}
            <h4 style={{
              fontSize: '0.875rem', fontWeight: 600,
              color: task.status === 'active' ? 'var(--foreground)' : accentColor,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {task.title}
            </h4>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <CalendarIcon size={11} />
              {format(new Date(task.startDate), 'MMM d')} – {format(new Date(task.endDate), 'MMM d')}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: accentColor, fontWeight: 500 }}>
              <Flag size={11} />
              {task.status}
            </span>
            {hasChildren && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                <Layers size={11} />
                {task.children.length} subtasks
              </span>
            )}
          </div>
        </div>

        {/* Progress */}
        {(() => {
          const displayProgress = task.computedProgress ?? task.progress;
          const isAI = hasChildren && displayProgress !== task.progress;
          return (
            <div style={{ width: 120, marginLeft: '1.5rem', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Progress
                  </span>
                  {hasChildren && (
                    <Sparkles size={10} strokeWidth={2.2} style={{ color: 'var(--text-muted)' }}>
                      <title>子タスクの平均から自動計算</title>
                    </Sparkles>
                  )}
                </div>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: accentColor }}>
                  {displayProgress}%
                </span>
              </div>
              <div className="progress-track">
                <motion.div
                  className="progress-fill"
                  initial={{ width: 0 }}
                  animate={{ width: `${displayProgress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                  style={{ background: accentColor }}
                />
              </div>
            </div>
          );
        })()}

        {/* Menu btn */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            style={{
              width: 30, height: 30, borderRadius: '0.5rem', marginLeft: '0.75rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: menuOpen ? 'var(--foreground)' : 'var(--text-muted)', cursor: 'pointer', flexShrink: 0,
              transition: 'all 0.2s',
              background: (hovered || menuOpen) ? 'var(--surface-2)' : 'transparent',
              border: menuOpen ? '1px solid var(--border)' : '1px solid transparent',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklch, var(--primary) 12%, transparent)'; e.currentTarget.style.color = 'var(--primary-dark)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = (hovered || menuOpen) ? 'var(--surface-2)' : 'transparent'; e.currentTarget.style.color = menuOpen ? 'var(--foreground)' : 'var(--text-muted)'; }}
          >
            <MoreVertical size={15} />
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
      </motion.div>

      <AnimatePresence initial={false}>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.98 }}
            animate={{ opacity: 1, height: 'auto', scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: 'hidden', marginTop: '0.25rem' }}
          >
            {task.children.map(child => (
              <TaskItem key={child.id} task={child} depth={depth + 1} onTaskClick={onTaskClick} onDelete={onDelete} onAddTask={onAddTask} onShare={onShare} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FILTERS = ['All', 'Project', 'Milestone', 'Task'];

// ヘルパー: 指定したタイプを含むタスクを抽出（再帰）
const filterRecursive = (items, type) => {
  if (type === 'all') return items;
  
  return items.reduce((acc, item) => {
    // 自身が一致するか、または子要素に一致するものがあるか確認
    const filteredChildren = item.children ? filterRecursive(item.children, type) : [];
    const matches = item.type === type;
    
    if (matches || filteredChildren.length > 0) {
      acc.push({ ...item, children: filteredChildren });
    }
    return acc;
  }, []);
};

export const TaskTree = ({ tasks, onTaskClick, onDelete, onAddTask, onShare }) => {
  const [activeFilter, setActiveFilter] = useState('All');

  const filtered = useMemo(() => {
    return filterRecursive(tasks, activeFilter.toLowerCase());
  }, [tasks, activeFilter]);

  return (
    <div style={{ position: 'relative' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, letterSpacing: '-0.02em' }}>Active Projects</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            {tasks.length} projects total
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {FILTERS.map(f => (
            <motion.button
              key={f}
              onClick={() => setActiveFilter(f)}
              whileHover={{ scale: 1.05, y: -1 }}
              whileTap={{ scale: 0.92, y: 1 }}
              transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
              style={{
                padding: '0.4rem 0.875rem',
                fontSize: '0.78rem', fontWeight: 600,
                borderRadius: '999px',
                background: activeFilter === f
                  ? 'color-mix(in oklch, var(--primary) 14%, transparent)'
                  : 'var(--surface-2)',
                border: activeFilter === f
                  ? '1px solid color-mix(in oklch, var(--primary) 36%, transparent)'
                  : '1px solid var(--border)',
                color: activeFilter === f ? 'var(--primary-dark)' : 'var(--text-subtle)',
                cursor: 'pointer',
                transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease',
              }}
            >
              {f}
            </motion.button>
          ))}
        </div>
      </div>

      {/* List */}
      <motion.div
        key={activeFilter}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        {filtered.map((task, i) => (
          <motion.div
            key={task.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: i * 0.06 }}
          >
            <TaskItem task={task} onTaskClick={onTaskClick} onDelete={onDelete} onAddTask={onAddTask} onShare={onShare} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};
