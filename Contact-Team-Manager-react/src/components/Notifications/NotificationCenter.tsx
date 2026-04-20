
import React, { useState, useRef, useEffect } from 'react';
import { useNotificationContext, AppNotification } from '../../context/NotificationContext';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';

export const NotificationCenter: React.FC = () => {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationContext();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleItemClick = (notification: AppNotification) => {
        markAsRead(notification.id);
        setIsOpen(false);
        // Navigate by changing URL (app should handle this via query params)
        window.location.href = notification.url;
    };

    return (
        <div className="notification-center-container" ref={dropdownRef}>
            <button 
                className="btn icon-btn bell-btn" 
                onClick={() => setIsOpen(!isOpen)}
                title="通知"
                style={{ padding: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
                {unreadCount > 0 && (
                    <span className="unread-badge">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown glass-panel">
                    <div className="notification-header">
                        <h3>通知</h3>
                        {unreadCount > 0 && (
                            <button className="mark-all-btn" onClick={markAllAsRead}>
                                全て既読にする
                            </button>
                        )}
                    </div>
                    
                    <div className="notification-list">
                        {notifications.length === 0 ? (
                            <div className="no-notifications">
                                通知はありません
                            </div>
                        ) : (
                            notifications.map(notif => (
                                <div 
                                    key={notif.id} 
                                    className={`notification-item ${notif.isRead ? '' : 'unread'}`}
                                    onClick={() => handleItemClick(notif)}
                                >
                                    <div className="notif-title">{notif.title}</div>
                                    <div className="notif-body">{notif.body}</div>
                                    <div className="notif-time">
                                        {formatDistanceToNow(notif.timestamp, { addSuffix: true, locale: ja })}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
