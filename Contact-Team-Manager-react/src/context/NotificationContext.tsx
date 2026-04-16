import React, { createContext, useContext, useState, useCallback } from 'react';

export interface AppNotification {
    id: string;
    title: string;
    body: string;
    url: string;
    type: 'mention' | 'new-message' | string;
    timestamp: number;
    read: boolean;
}

interface NotificationContextValue {
    notifications: AppNotification[];
    addNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
    markAllRead: () => void;
    unreadCount: number;
}

const NotificationContext = createContext<NotificationContextValue>({
    notifications: [],
    addNotification: () => {},
    markAllRead: () => {},
    unreadCount: 0,
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
    const [notifications, setNotifications] = useState<AppNotification[]>([]);

    const addNotification = useCallback((n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => {
        setNotifications(prev => [
            {
                ...n,
                id: `${Date.now()}-${Math.random()}`,
                timestamp: Date.now(),
                read: false,
            },
            ...prev.slice(0, 49),
        ]);
    }, []);

    const markAllRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <NotificationContext.Provider value={{ notifications, addNotification, markAllRead, unreadCount }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotificationContext() {
    return useContext(NotificationContext);
}
