
import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useNotifications() {
    const { user, profile } = useAuth();

    useEffect(() => {
        if (!user) return;

        // Request permission
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const handleNewRecord = (payload: any, table: string) => {
            const { new: newRecord } = payload;

            // Skip if own action
            if (newRecord.user_id === user.id) return;
            // Also skip if author name matches (legacy check)
            if (newRecord.author === (profile?.display_name || user.email)) return;

            let title = 'Contact Team Manager';
            let body = '';
            let url = '/';

            if (table === 'threads') {
                title = `新しい投稿: ${newRecord.title}`;
                body = `${newRecord.author}さんが新しい投稿を作成しました`;
                url = `/?thread=${newRecord.id}`; // Simple URL pattern, handling needs to be in App
            } else if (table === 'replies') {
                title = `新しい返信`;
                body = `${newRecord.author}さんが返信しました`;
                url = `/?thread=${newRecord.thread_id}`;
            }

            if (Notification.permission === 'granted') {
                try {
                    // Try using Service Worker registration to show notification (for mobile/PWA support)
                    navigator.serviceWorker.ready.then(registration => {
                        registration.showNotification(title, {
                            body: body,
                            icon: '/favicon-v2.png', // Ensure this exists or use default
                            data: { url: url },
                            tag: 'new-message'
                        });
                    });
                } catch (e) {
                    // Fallback to standard Notification API
                    new Notification(title, {
                        body: body,
                        icon: '/favicon-v2.png'
                    });
                }
            }
        };

        const channel = supabase
            .channel('global-notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'threads' }, (payload) => handleNewRecord(payload, 'threads'))
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'replies' }, (payload) => handleNewRecord(payload, 'replies'))
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, profile]);
}
