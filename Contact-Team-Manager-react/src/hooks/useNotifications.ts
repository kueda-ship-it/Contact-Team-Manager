
import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useNotifications() {
    const { user, profile } = useAuth();
    // Use refs to avoid re-subscribing to realtime channels when tag data changes
    const tagsRef = useRef<any[]>([]);
    const tagMembersRef = useRef<any[]>([]);

    // Fetch tag data once and keep it updated via ref (no state → no re-render → no re-subscription)
    const fetchTagData = useCallback(async () => {
        try {
            const [tmRes, tagRes] = await Promise.all([
                supabase.from('tag_members').select('tag_id, profile_id'),
                supabase.from('tags').select('id, name')
            ]);
            if (tmRes.data) tagMembersRef.current = tmRes.data;
            if (tagRes.data) tagsRef.current = tagRes.data;
        } catch (e) {
            console.error('Failed to fetch tag data for notifications:', e);
        }
    }, []);

    const checkReminders = useCallback(async () => {
        if (!user) return;
        try {
            const now = new Date().toISOString();
            const { data: threadsToRemind, error } = await supabase
                .from('threads')
                .select('*')
                .lte('remind_at', now)
                .eq('reminder_sent', false);

            if (error) {
                console.error('Failed to fetch reminders:', error);
                return;
            }

            if (threadsToRemind && threadsToRemind.length > 0) {
                for (const thread of threadsToRemind) {
                    let isTarget = false;

                    if (thread.user_id === user.id) {
                        isTarget = true;
                    } else {
                        const content = thread.content || '';
                        const myDisplayName = profile?.display_name || '';
                        const isMentionedByName = myDisplayName && content.includes(`@${myDisplayName}`);
                        const isMentionedByAll = content.includes('@all');

                        let isMentionedByTag = false;
                        const tags = tagsRef.current;
                        const allTagMembers = tagMembersRef.current;
                        for (const tag of tags) {
                            if (content.includes(`#${tag.name}`)) {
                                const isUserInTag = allTagMembers.some(
                                    tm => tm.tag_id === tag.id && tm.profile_id === user.id
                                );
                                if (isUserInTag) {
                                    isMentionedByTag = true;
                                    break;
                                }
                            }
                        }

                        isTarget = isMentionedByName || isMentionedByAll || isMentionedByTag;
                    }

                    if (isTarget) {
                        const title = `⏰ リマインド: ${thread.title}`;
                        const body = thread.user_id === user.id ? 'あなたが設定したリマインドです' : 'メンションされたリマインドです';

                        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                            try {
                                navigator.serviceWorker.ready.then(registration => {
                                    registration.showNotification(title, {
                                        body: body,
                                        icon: '/favicon-v2.png',
                                        data: { url: `${window.location.origin}/Contact-Team-Manager/?thread=${thread.id}` },
                                        tag: 'reminder'
                                    });
                                });
                            } catch (e) {
                                new Notification(title, {
                                    body: body,
                                    icon: '/favicon-v2.png'
                                });
                            }
                        }
                    }

                    // 1度送信を試みたらフラグを立てる（重複通知防止）
                    await supabase.from('threads').update({ reminder_sent: true }).eq('id', thread.id);
                }
            }
        } catch (e) {
            console.error('Reminder check error:', e);
        }
    }, [user, profile]);

    useEffect(() => {
        fetchTagData();
        checkReminders();
        // Periodically refresh tag data (every 60 seconds) and check reminders
        const interval = setInterval(() => {
            fetchTagData();
            checkReminders();
        }, 60000);
        return () => clearInterval(interval);
    }, [fetchTagData, checkReminders]);

    useEffect(() => {
        if (!user) return;

        // Request permission
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const handleNewRecord = (payload: any, table: string) => {
            const { new: newRecord } = payload;

            // Skip if own action
            if (newRecord.user_id === user.id) return;
            // Also skip if author name matches (legacy check)
            if (newRecord.author === (profile?.display_name || user.email)) return;

            // Check if the user is mentioned via @displayName or @all
            const content = newRecord.content || '';
            const myDisplayName = profile?.display_name || '';
            const isMentionedByName = myDisplayName && content.includes(`@${myDisplayName}`);
            const isMentionedByAll = content.includes('@all');

            // Check if the user is a member of any mentioned tags (#tagName)
            let isMentionedByTag = false;
            const tags = tagsRef.current;
            const allTagMembers = tagMembersRef.current;
            for (const tag of tags) {
                if (content.includes(`#${tag.name}`)) {
                    const isUserInTag = allTagMembers.some(
                        tm => tm.tag_id === tag.id && tm.profile_id === user.id
                    );
                    if (isUserInTag) {
                        isMentionedByTag = true;
                        break;
                    }
                }
            }

            let title = 'Contact Team Manager';
            let body = '';
            let url = '/';

            if (table === 'threads') {
                if (isMentionedByName || isMentionedByAll || isMentionedByTag) {
                    title = `📢 メンションされました`;
                    body = `${newRecord.author}さんがあなたをメンションしました: ${newRecord.title}`;
                } else {
                    title = `新しい投稿: ${newRecord.title}`;
                    body = `${newRecord.author}さんが新しい投稿を作成しました`;
                }
                url = `${window.location.origin}/Contact-Team-Manager/?thread=${newRecord.id}`;
            } else if (table === 'replies') {
                if (isMentionedByName || isMentionedByAll || isMentionedByTag) {
                    title = `📢 返信でメンションされました`;
                    body = `${newRecord.author}さんがあなたをメンションしました`;
                } else {
                    title = `新しい返信`;
                    body = `${newRecord.author}さんが返信しました`;
                }
                url = `${window.location.origin}/Contact-Team-Manager/?thread=${newRecord.thread_id}`;
            }

            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                try {
                    navigator.serviceWorker.ready.then(registration => {
                        registration.showNotification(title, {
                            body: body,
                            icon: '/favicon-v2.png',
                            data: { url: url },
                            tag: (isMentionedByName || isMentionedByAll || isMentionedByTag) ? 'mention' : 'new-message'
                        });
                    });
                } catch (e) {
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
    }, [user, profile, fetchTagData]);
}
