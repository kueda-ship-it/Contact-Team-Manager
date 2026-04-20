import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, format, isSameMonth, isSameDay,
  differenceInCalendarDays,
} from 'date-fns';
import { ja } from 'date-fns/locale';
import { isHoliday } from '../lib/holidays';

const STATUS_COLOR = {
  completed: 'var(--success)',
  active:    'var(--primary)',
  pending:   'var(--warning)',
};

const LANE_HEIGHT = 22;
const LANE_GAP    = 3;
const DATE_ROW_H  = 34;

const flattenAll = (list, acc = []) => {
  list.forEach((t) => { acc.push(t); if (t.children?.length) flattenAll(t.children, acc); });
  return acc;
};

// Within a single week (7 days), lay out tasks as non-overlapping lanes.
const layoutWeek = (tasks, weekStart, weekEnd) => {
  const bars = tasks
    .filter((t) => t.endDate >= weekStart && t.startDate <= weekEnd)
    .map((t) => {
      const s = t.startDate > weekStart ? t.startDate : weekStart;
      const e = t.endDate   < weekEnd   ? t.endDate   : weekEnd;
      return {
        task: t,
        startCol: differenceInCalendarDays(s, weekStart),
        span:     differenceInCalendarDays(e, s) + 1,
        startsHere: isSameDay(s, t.startDate),
        endsHere:   isSameDay(e, t.endDate),
      };
    })
    .sort((a, b) => a.startCol - b.startCol || b.span - a.span);

  const laneEnd = [];
  for (const b of bars) {
    let lane = 0;
    while (laneEnd[lane] !== undefined && laneEnd[lane] >= b.startCol) lane++;
    b.lane = lane;
    laneEnd[lane] = b.startCol + b.span - 1;
  }
  return bars;
};

export const CalendarView = ({ tasks, onTaskClick, onNewTask, onUpdate }) => {
  const [cursor, setCursor] = useState(() => new Date());
  const [dragState, setDragState] = useState(null);
  // dragState: { taskId, startX, cellWidth, startEnd: Date, startStart: Date, newEnd: Date } | null
  const clickSuppressRef = useRef(false);

  const rawFlat = useMemo(
    () => flattenAll(tasks).filter((t) => t.startDate && t.endDate),
    [tasks]
  );
  // Patch the task being drag-resized with live newEnd for instant visual feedback.
  const flat = useMemo(() => {
    if (!dragState) return rawFlat;
    return rawFlat.map((t) =>
      t.id === dragState.taskId ? { ...t, endDate: dragState.newEnd } : t
    );
  }, [rawFlat, dragState]);

  useEffect(() => {
    if (!dragState) return;
    const onMove = (e) => {
      const deltaDays = Math.round((e.clientX - dragState.startX) / dragState.cellWidth);
      let newEnd = addDays(dragState.startEnd, deltaDays);
      if (newEnd < dragState.startStart) newEnd = dragState.startStart;
      setDragState((s) => (s ? { ...s, newEnd } : null));
    };
    const onUp = async () => {
      const snapshot = dragState;
      setDragState(null);
      clickSuppressRef.current = true;
      setTimeout(() => { clickSuppressRef.current = false; }, 50);
      if (snapshot && !isSameDay(snapshot.newEnd, snapshot.startEnd) && onUpdate) {
        await onUpdate(snapshot.taskId, { endDate: snapshot.newEnd });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup',   onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup',   onUp);
    };
  }, [dragState, onUpdate]);

  const monthStart = startOfMonth(cursor);
  const monthEnd   = endOfMonth(cursor);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd    = endOfWeek(monthEnd,     { weekStartsOn: 0 });

  const weeks = useMemo(() => {
    const arr = [];
    for (let wStart = gridStart; wStart <= gridEnd; wStart = addDays(wStart, 7)) {
      arr.push({ start: wStart, end: addDays(wStart, 6) });
    }
    return arr;
  }, [cursor]);

  const dayColor = (d) => {
    const dow = d.getDay();
    if (dow === 0 || isHoliday(d)) return 'var(--danger)';
    if (dow === 6) return 'var(--saturday)';
    return null;
  };

  return (
    <div style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Month header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1rem', padding: '0.5rem 0.75rem',
        background: 'var(--gantt-header-bg)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setCursor((c) => addMonths(c, -1))} style={iconBtn} title="前月">
            <ChevronLeft size={16} />
          </button>
          <div style={{
            fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em',
            color: 'var(--foreground)', minWidth: 160, textAlign: 'center',
          }}>
            {format(cursor, 'yyyy年 M月', { locale: ja })}
          </div>
          <button onClick={() => setCursor((c) => addMonths(c, 1))} style={iconBtn} title="翌月">
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setCursor(new Date())}
            style={{ ...iconBtn, width: 'auto', padding: '0 12px', fontSize: '0.78rem' }}
            title="今月"
          >
            今日
          </button>
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          タスク数: {flat.length}
        </div>
      </div>

      {/* Weekday header */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
        border: '1px solid var(--border)', borderBottom: 'none',
        borderTopLeftRadius: 'var(--radius-md)', borderTopRightRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {['日','月','火','水','木','金','土'].map((w, i) => (
          <div key={i} style={{
            background: 'var(--gantt-header-bg)',
            padding: '0.55rem 0.5rem',
            fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em',
            color: i === 0 ? 'var(--danger)' : i === 6 ? 'var(--saturday)' : 'var(--text-muted)',
            textAlign: 'center',
            borderRight: i < 6 ? '1px solid var(--border)' : 'none',
          }}>{w}</div>
        ))}
      </div>

      {/* Week rows */}
      <div style={{
        border: '1px solid var(--border)',
        borderBottomLeftRadius: 'var(--radius-md)',
        borderBottomRightRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: 'var(--gantt-cell-bg)',
      }}>
        {weeks.map((wk, wi) => {
          const bars = layoutWeek(flat, wk.start, wk.end);
          const maxLane = bars.reduce((m, b) => Math.max(m, b.lane), -1);
          const laneCount = maxLane + 1;
          const rowHeight = DATE_ROW_H + laneCount * (LANE_HEIGHT + LANE_GAP) + 8;

          return (
            <div key={wi} data-week-row="" style={{
              position: 'relative',
              display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
              borderTop: wi === 0 ? 'none' : '1px solid var(--border)',
              minHeight: Math.max(rowHeight, 96),
            }}>
              {/* Day cells (background layer) */}
              {Array.from({ length: 7 }).map((_, di) => {
                const d = addDays(wk.start, di);
                const inMonth = isSameMonth(d, cursor);
                const today   = isSameDay(d, new Date());
                const color   = dayColor(d);
                return (
                  <div key={di} style={{
                    borderRight: di < 6 ? '1px solid var(--border)' : 'none',
                    background: inMonth ? 'var(--gantt-cell-bg)'
                                        : 'color-mix(in oklab, var(--gantt-cell-bg) 55%, var(--gantt-header-bg))',
                    padding: '6px 8px',
                    cursor: onNewTask ? 'pointer' : 'default',
                    position: 'relative',
                    transition: 'background var(--duration-fast) var(--ease-out)',
                  }}
                  onClick={(e) => { if (onNewTask && e.target === e.currentTarget) onNewTask(null, 'task', d); }}
                  onMouseEnter={(e) => {
                    if (inMonth) e.currentTarget.style.background = 'var(--gantt-cell-hover)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = inMonth
                      ? 'var(--gantt-cell-bg)'
                      : 'color-mix(in oklab, var(--gantt-cell-bg) 55%, var(--gantt-header-bg))';
                  }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      pointerEvents: 'none',
                    }}>
                      <span style={{
                        fontSize: '0.82rem',
                        fontWeight: today ? 800 : 600,
                        color: today ? 'var(--primary-fg)' : (color ?? 'var(--foreground)'),
                        opacity: inMonth ? 1 : 0.55,
                        background: today ? 'var(--primary)' : 'transparent',
                        borderRadius: 'var(--radius-round)',
                        minWidth: 24, height: 24, padding: '0 7px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1,
                      }}>
                        {format(d, 'd')}
                      </span>
                      {isHoliday(d) && inMonth && (
                        <span style={{ fontSize: '0.64rem', color: 'var(--danger)', fontWeight: 700 }}>祝</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Task bars (overlay layer) */}
              <div style={{
                position: 'absolute', top: DATE_ROW_H, left: 0, right: 0,
                pointerEvents: 'none',
              }}>
                {bars.map((b, bi) => {
                  const color    = b.task.color ?? STATUS_COLOR[b.task.status] ?? STATUS_COLOR.active;
                  const top      = b.lane * (LANE_HEIGHT + LANE_GAP);
                  const leftPct  = (b.startCol / 7) * 100;
                  const widthPct = (b.span / 7) * 100;
                  const isDragging = dragState?.taskId === b.task.id;
                  return (
                    <motion.button
                      key={`${b.task.id}-${wi}-${bi}`}
                      initial={{ opacity: 0, y: -2 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: bi * 0.01 }}
                      onClick={(e) => {
                        if (clickSuppressRef.current) { e.preventDefault(); e.stopPropagation(); return; }
                        e.stopPropagation();
                        onTaskClick?.(b.task);
                      }}
                      title={`${b.task.title} (${format(b.task.startDate, 'M/d')} – ${format(b.task.endDate, 'M/d')})`}
                      style={{
                        position: 'absolute',
                        left:  `calc(${leftPct}% + ${b.startsHere ? 4 : 0}px)`,
                        width: `calc(${widthPct}% - ${ (b.startsHere ? 4 : 0) + (b.endsHere ? 4 : 0) }px)`,
                        top,
                        height: LANE_HEIGHT,
                        background: `color-mix(in oklab, ${color} 78%, transparent)`,
                        color: '#fff',
                        border: 'none',
                        borderLeft:  b.startsHere ? `3px solid ${color}` : 'none',
                        borderRadius: b.startsHere && b.endsHere ? 'var(--radius-sm)'
                                    : b.startsHere ? 'var(--radius-sm) 2px 2px var(--radius-sm)'
                                    : b.endsHere   ? '2px var(--radius-sm) var(--radius-sm) 2px'
                                    : '2px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        padding: '0 9px',
                        paddingRight: b.endsHere && onUpdate ? 16 : 9,
                        textAlign: 'left',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                        textOverflow: 'ellipsis',
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        boxShadow: isDragging
                          ? `0 0 0 2px ${color}, 0 4px 12px rgba(0,0,0,0.35)`
                          : '0 1px 2px rgba(0,0,0,0.22)',
                        zIndex: isDragging ? 2 : 1,
                      }}
                    >
                      {b.startsHere ? b.task.title : `▸ ${b.task.title}`}
                      {b.endsHere && onUpdate && (
                        <span
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const weekEl = e.currentTarget.closest('[data-week-row]');
                            if (!weekEl) return;
                            const cellWidth = weekEl.getBoundingClientRect().width / 7;
                            setDragState({
                              taskId: b.task.id,
                              startX: e.clientX,
                              cellWidth,
                              startEnd:   b.task.endDate,
                              startStart: b.task.startDate,
                              newEnd:     b.task.endDate,
                            });
                          }}
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          title="ドラッグで期限を変更"
                          style={{
                            position: 'absolute',
                            right: 0, top: 0, bottom: 0, width: 12,
                            cursor: 'ew-resize',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            opacity: 0.55,
                            pointerEvents: 'auto',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.55; }}
                        >
                          <GripVertical size={10} />
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex', gap: 14, marginTop: 10,
        fontSize: '0.7rem', color: 'var(--text-muted)',
      }}>
        {[
          { key: 'active',    label: '進行中' },
          { key: 'pending',   label: '保留' },
          { key: 'completed', label: '完了' },
        ].map(({ key, label }) => (
          <div key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 2,
              background: `color-mix(in oklab, ${STATUS_COLOR[key]} 78%, transparent)`,
              borderLeft: `3px solid ${STATUS_COLOR[key]}`,
            }} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};

const iconBtn = {
  width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--btn-icon-bg)', border: '1px solid var(--btn-icon-border)',
  borderRadius: 'var(--radius-md)', color: 'var(--btn-icon-color)',
  cursor: 'pointer', transition: 'background var(--duration-fast) var(--ease-out)',
};
