import React from 'react';

const OPTIONS = [
  { value: 'all',       label: 'すべて' },
  { value: 'active',    label: '未完了' },
  { value: 'completed', label: '完了' },
];

export const CompletionFilterTabs = ({ value, onChange, size = 'md' }) => {
  const padY = size === 'sm' ? '0.28rem' : '0.38rem';
  const padX = size === 'sm' ? '0.6rem'  : '0.75rem';
  const font = size === 'sm' ? '0.72rem' : '0.76rem';

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      padding: 3, gap: 2,
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
    }}>
      {OPTIONS.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              padding: `${padY} ${padX}`,
              fontSize: font, fontWeight: 600,
              borderRadius: 'calc(var(--radius-md) - 3px)',
              border: 'none',
              background: active ? 'var(--surface)' : 'transparent',
              color: active ? 'var(--primary-dark)' : 'var(--text-muted)',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
};
