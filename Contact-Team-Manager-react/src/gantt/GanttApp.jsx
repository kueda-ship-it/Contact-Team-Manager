import React, { useState } from 'react';
import { Plus, BarChart3, CalendarDays } from 'lucide-react';
import { addDays } from 'date-fns';
import { GanttChart } from './components/GanttChart';
import { ListView } from './components/ListView';
import { TaskTree } from './components/TaskTree';
import { TaskEditor } from './components/TaskEditor';
import { CalendarView } from './components/CalendarView';
import { CompletionFilterTabs } from './components/CompletionFilterTabs';
import { useTaskData } from './hooks/useTaskData';
import { filterByCompletion } from './lib/taskTree';

// Contact の Sidebar から切り替えられる Gantt モジュールのエントリ。
// view: 'gantt' | 'list' | 'tree' (outer Sidebar-driven)
// ganttMode: 'timeline' | 'calendar' (inner tab for view==='gantt')
export const GanttApp = ({ view = 'gantt' }) => {
  const { tasks, updateTask, addTask, deleteTask } = useTaskData();
  const [selectedTask, setSelectedTask] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorInitialTab, setEditorInitialTab] = useState('detail');
  const [ganttMode, setGanttMode] = useState(() => {
    try {
      const saved = localStorage.getItem('tc_gantt_mode');
      if (saved === 'timeline' || saved === 'calendar') return saved;
    } catch {}
    return 'timeline';
  });
  const [completionFilter, setCompletionFilter] = useState(() => {
    try {
      const saved = localStorage.getItem('tc_dashboard_completion_filter');
      if (saved === 'all' || saved === 'active' || saved === 'completed') return saved;
    } catch {}
    return 'all';
  });

  const updateGanttMode = (mode) => {
    setGanttMode(mode);
    try { localStorage.setItem('tc_gantt_mode', mode); } catch {}
  };
  const updateCompletionFilter = (mode) => {
    setCompletionFilter(mode);
    try { localStorage.setItem('tc_dashboard_completion_filter', mode); } catch {}
  };
  const displayedTasks = filterByCompletion(tasks, completionFilter);

  const handleTaskClick = (t) => { setSelectedTask(t); setEditorInitialTab('detail'); setIsEditorOpen(true); };
  const handleNewTask   = () => { setSelectedTask(null); setEditorInitialTab('detail'); setIsEditorOpen(true); };
  const handleAddTask   = (pId, type, startDate) => {
    const s = startDate ?? new Date();
    setSelectedTask({
      parentId: pId, type, title: '', progress: 0, status: 'active',
      startDate: s, endDate: addDays(s, 7),
    });
    setEditorInitialTab('detail');
    setIsEditorOpen(true);
  };
  const handleShareTask = (t) => { setSelectedTask(t); setEditorInitialTab('members'); setIsEditorOpen(true); };

  const ModeTabs = () => (
    <div style={{
      display: 'inline-flex', gap: 2, padding: 3,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
    }}>
      {[
        { id: 'timeline', label: 'タイムライン', Icon: BarChart3 },
        { id: 'calendar', label: 'カレンダー',  Icon: CalendarDays },
      ].map(({ id, label, Icon }) => {
        const active = ganttMode === id;
        return (
          <button
            key={id}
            onClick={() => updateGanttMode(id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0.4rem 0.75rem',
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? 'var(--primary-fg)' : 'var(--text-muted)',
              border: 'none', borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font-sans)', fontSize: '0.76rem', fontWeight: 600,
              cursor: 'pointer', transition: 'background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)',
            }}
          >
            <Icon size={13} strokeWidth={2.4} />
            {label}
          </button>
        );
      })}
    </div>
  );

  const Header = ({ title, subtitle, showModeTabs }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '0.25rem', color: 'var(--foreground)' }}>{title}</h2>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{subtitle}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {showModeTabs && <ModeTabs />}
        {view !== 'gantt' && <CompletionFilterTabs value={completionFilter} onChange={updateCompletionFilter} />}
        <button className="gantt-btn-primary" onClick={handleNewTask}>
          <Plus size={15} />
          <span>Add Project</span>
        </button>
      </div>
    </div>
  );

  const ganttSubtitle = ganttMode === 'timeline' ? 'タイムラインビュー' : 'カレンダービュー';

  const containerMaxWidth = (view === 'gantt' && ganttMode === 'calendar') ? '100%' : '82rem';

  return (
    <div style={{ maxWidth: containerMaxWidth, margin: '0 auto', padding: 'var(--space-5)', fontFamily: 'var(--font-sans)', isolation: 'isolate', position: 'relative', zIndex: 0 }}>
      {view === 'gantt' && (
        <>
          <Header title="Gantt Chart" subtitle={ganttSubtitle} showModeTabs />
          {ganttMode === 'timeline' ? (
            <GanttChart
              tasks={tasks}
              onTaskClick={handleTaskClick}
              onDelete={deleteTask}
              onAddTask={handleAddTask}
              onUpdate={updateTask}
              onShare={handleShareTask}
            />
          ) : (
            <CalendarView
              tasks={displayedTasks}
              onTaskClick={handleTaskClick}
              onNewTask={handleAddTask}
              onUpdate={updateTask}
            />
          )}
        </>
      )}

      {view === 'list' && (
        <>
          <Header title="List View" subtitle="タスク一覧" />
          <ListView
            tasks={displayedTasks}
            onTaskClick={handleTaskClick}
            onDelete={deleteTask}
            onAddTask={handleAddTask}
            onShare={handleShareTask}
          />
        </>
      )}

      {view === 'tree' && (
        <>
          <Header title="Task Tree" subtitle="階層ビュー" />
          <TaskTree
            tasks={displayedTasks}
            onTaskClick={handleTaskClick}
            onDelete={deleteTask}
            onAddTask={handleAddTask}
            onShare={handleShareTask}
          />
        </>
      )}

      <TaskEditor
        task={selectedTask}
        tasks={tasks}
        isOpen={isEditorOpen}
        initialTab={editorInitialTab}
        onClose={() => setIsEditorOpen(false)}
        onSave={async (id, data) => {
          const ok = id ? await updateTask(id, data) : await addTask(data);
          if (ok !== false) setIsEditorOpen(false);
        }}
        onDelete={(id) => { deleteTask(id); setIsEditorOpen(false); }}
      />
    </div>
  );
};
