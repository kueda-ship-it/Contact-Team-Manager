import React, { useEffect, useRef } from 'react';
import { usePresence, type PresenceChoice, type PresenceStatus } from '../../context/PresenceContext';
import { PresenceDot, presenceLabelJa } from './PresenceDot';

interface PresencePopoverProps {
    anchor: HTMLElement | null;
    onClose: () => void;
}

const CHOICES: PresenceStatus[] = ['online', 'away', 'busy', 'offline'];

export const PresencePopover: React.FC<PresencePopoverProps> = ({ anchor, onClose }) => {
    const { myPresence, setMyPresence } = usePresence();
    const ref = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!ref.current) return;
            if (ref.current.contains(e.target as Node)) return;
            if (anchor && anchor.contains(e.target as Node)) return;
            onClose();
        };
        const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [anchor, onClose]);

    if (!anchor) return null;
    const rect = anchor.getBoundingClientRect();

    const handleChoose = async (choice: PresenceChoice) => {
        await setMyPresence(choice);
        onClose();
    };

    const style: React.CSSProperties = {
        position: 'fixed',
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
        minWidth: 220,
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        padding: 'var(--space-1)',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
    };

    const rowBase: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 'var(--radius-sm)',
        cursor: 'pointer',
        background: 'transparent',
        color: 'var(--text-primary)',
        fontSize: 'var(--text-sm)',
        border: 'none',
        textAlign: 'left',
        width: '100%',
    };

    const active = myPresence.manual ? myPresence.status : null;

    return (
        <div ref={ref} style={style} role="menu">
            <div style={{
                padding: '6px 10px 8px',
                fontSize: 'var(--text-2xs)',
                color: 'var(--text-muted)',
                letterSpacing: 'var(--tracking-label)',
                textTransform: 'uppercase',
            }}>
                ステータス
            </div>
            {CHOICES.map(choice => {
                const isActive = active === choice;
                return (
                    <button
                        key={choice}
                        onClick={() => handleChoose(choice)}
                        style={{
                            ...rowBase,
                            background: isActive ? 'var(--surface-selected)' : 'transparent',
                            fontWeight: isActive ? 600 : 500,
                        }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget.style.background = 'var(--surface-hover)'); }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget.style.background = 'transparent'); }}
                    >
                        <span style={{ position: 'relative', width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                            <PresenceDot status={choice} size="md" overlay={false} />
                        </span>
                        <span>{presenceLabelJa(choice)}</span>
                        {isActive && (
                            <span style={{ marginLeft: 'auto', fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>手動</span>
                        )}
                    </button>
                );
            })}
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 6px' }} />
            <button
                onClick={() => handleChoose('auto')}
                style={{
                    ...rowBase,
                    color: myPresence.manual ? 'var(--accent)' : 'var(--text-muted)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                title="自動判定（アクティビティに基づく）に戻す"
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 3-6.7" />
                    <polyline points="3 4 3 10 9 10" />
                </svg>
                <span>自動に戻す</span>
            </button>
        </div>
    );
};
