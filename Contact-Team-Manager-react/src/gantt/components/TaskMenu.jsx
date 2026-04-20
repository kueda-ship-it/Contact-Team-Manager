import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Edit, Plus, Trash2, Users } from 'lucide-react';

export const TaskMenu = ({ task, onEdit, onDelete, onAddTask, onShare, onClose }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const Item = ({ icon: Icon, label, onClick, color, danger }) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
        onClose();
      }}
      style={{
        width: '100%', padding: '0.6rem 0.8rem', display: 'flex', alignItems: 'center', gap: '0.7rem',
        fontSize: '0.78rem', fontWeight: 500, color: danger ? 'var(--danger)' : 'var(--foreground)',
        borderRadius: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer',
        transition: 'background 0.15s', textAlign: 'left',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = danger
          ? 'color-mix(in oklch, var(--danger) 12%, transparent)'
          : 'var(--surface-2)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <Icon size={15} color={color || (danger ? 'var(--danger)' : 'var(--text-muted)')} strokeWidth={2.25} />
      {label}
    </button>
  );

  return (
    <motion.div
      ref={menuRef}
      initial={{ opacity: 0, scale: 0.96, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -6 }}
      transition={{ duration: 0.15 }}
      style={{
        position: 'absolute', top: '100%', right: 0, zIndex: 1000,
        width: 180,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '0.35rem', marginTop: '0.4rem',
        boxShadow: 'var(--shadow-lg)',
      }}
    >
      <Item icon={Edit} label="詳細を編集" onClick={onEdit} />

      {task.type === 'project' && (
        <Item icon={Plus} label="マイルストーンを追加" color="var(--warning)" onClick={() => onAddTask(task.id, 'milestone')} />
      )}
      {task.type === 'milestone' && (
        <Item icon={Plus} label="タスクを追加" color="var(--primary)" onClick={() => onAddTask(task.id, 'task')} />
      )}

      {onShare && task.id && (
        <Item icon={Users} label="共有設定" color="var(--primary-dark)" onClick={() => onShare(task)} />
      )}

      <div style={{ height: 1, background: 'var(--border)', margin: '0.3rem 0.5rem' }} />
      <Item icon={Trash2} label="削除" danger onClick={onDelete} />
    </motion.div>
  );
};
