import { useEffect, useRef, useState } from 'react';
import { useNotificationContext } from '../../context/NotificationContext';

interface NotificationBellProps {
    onNotificationClick: (threadId: string) => void;
}

function formatTime(ts: number): string {
    const diff = Date.now() - ts;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'たった今';
    if (min < 60) return `${min}分前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}時間前`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}日前`;
    return new Date(ts).toLocaleDateString('ja-JP');
}

export function NotificationBell({ onNotificationClick }: NotificationBellProps) {
    const { notifications, unreadCount, markAllRead } = useNotificationContext();
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const handleToggle = () => {
        const next = !open;
        setOpen(next);
        if (next && unreadCount > 0) {
            markAllRead();
        }
    };

    const handleItemClick = (n: typeof notifications[number]) => {
        try {
            const params = new URLSearchParams(new URL(n.url).search);
            const threadId = params.get('thread');
            if (threadId) onNotificationClick(threadId);
        } catch {
            // ignore malformed URL
        }
        setOpen(false);
    };

    return (
        <div ref={wrapperRef} style={{ position: 'relative' }}>
            <button
                className="btn icon-btn gear-btn-unified"
                onClick={handleToggle}
                title="通知"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                {unreadCount > 0 && (
                    <span style={{
                        position: 'absolute',
                        top: '-2px',
                        right: '-2px',
                        background: '#FF4444',
                        color: '#fff',
                        borderRadius: '10px',
                        minWidth: '16px',
                        height: '16px',
                        fontSize: '10px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                        lineHeight: 1,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}>
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {open && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: '340px',
                    maxHeight: '480px',
                    background: 'var(--bg-secondary, #2b2d31)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}>
                    <div style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        fontWeight: 600,
                        fontSize: '0.9rem',
                    }}>
                        通知
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                        {notifications.length === 0 ? (
                            <div style={{
                                padding: '32px 16px',
                                textAlign: 'center',
                                color: 'var(--text-muted, #999)',
                                fontSize: '0.85rem',
                            }}>
                                通知はありません
                            </div>
                        ) : (
                            notifications.map(n => (
                                <button
                                    key={n.id}
                                    onClick={() => handleItemClick(n)}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '12px 16px',
                                        background: 'transparent',
                                        border: 'none',
                                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                                        cursor: 'pointer',
                                        color: 'inherit',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px',
                                        transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                                >
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted, #999)', flexShrink: 0 }}>{formatTime(n.timestamp)}</span>
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted, #bbb)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                        {n.body}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
