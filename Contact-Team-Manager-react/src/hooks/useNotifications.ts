
import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useNotificationContext } from '../context/NotificationContext';

const RECONNECT_DELAY_MS = 5000;

async function showNotification(title: string, body: string, url: string, tag: string) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const options: NotificationOptions = {
        body,
        icon: '/favicon-v2.png',
        data: { url },
        tag,
    };

    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.ready;
            await registration.showNotification(title, options);
            return;
        } catch (e) {
            console.warn('[useNotifications] Service Worker notification failed, falling back:', e);
        }
    }

    try {
        const n = new Notification(title, { body, icon: '/favicon-v2.png', data: { url } });
        n.onclick = (e) => {
            e.preventDefault();
            window.focus();
            try {
                const params = new URLSearchParams(new URL(url).search);
                const threadId = params.get('thread');
                if (threadId) {
                    // SW notificationclick と同じ経路で App.tsx に渡す
                    window.postMessage({ type: 'notification-click', url }, window.location.origin);
                } else {
                    window.location.href = url;
                }
            } catch {
                window.location.href = url;
            }
            n.close();
        };
    } catch (e) {
        console.error('[useNotifications] Failed to show notification:', e);
    }
}

export function useNotifications() {
    const { user, profile } = useAuth();
    const { addNotification } = useNotificationContext();
    const tagsRef = useRef<any[]>([]);
    const tagMembersRef = useRef<any[]>([]);
    // チームIDと通知有効フラグのマップ { teamId: boolean }
    const teamNotifSettingsRef = useRef<Map<string, boolean>>(new Map());
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // チームごとの通知設定を取得
    const fetchTeamNotifSettings = useCallback(async () => {
        if (!user) return;
        try {
            const { data } = await supabase
                .from('team_members')
                .select('team_id, notifications_enabled')
                .eq('user_id', user.id);
            if (data) {
                const map = new Map<string, boolean>();
                data.forEach((m: any) => {
                    map.set(String(m.team_id), m.notifications_enabled !== false);
                });
                teamNotifSettingsRef.current = map;
            }
        } catch (e) {
            console.error('Failed to fetch team notification settings:', e);
        }
    }, [user]);

    // チームの通知が有効かチェック（設定がない場合は有効とみなす）
    const isTeamNotifEnabled = useCallback((teamId: string | number | null): boolean => {
        if (!teamId) return true;
        const map = teamNotifSettingsRef.current;
        if (!map.has(String(teamId))) return true;
        return map.get(String(teamId)) === true;
    }, []);

    const checkReminders = useCallback(async () => {
        if (!user) return;
        // ユーザーごとに通知済みリマインドIDを localStorage で管理
        // （thread_reminders は user_id を持たないため、グローバルな reminder_sent
        //   だけだと他ユーザーの未通知分まで「送信済み」にしてしまう）
        const seenKey = `seen_reminder_ids_${user.id}`;
        let seenIds: Set<string>;
        try {
            const raw = localStorage.getItem(seenKey);
            seenIds = new Set(raw ? JSON.parse(raw) : []);
        } catch {
            seenIds = new Set();
        }
        const persistSeen = () => {
            try {
                localStorage.setItem(seenKey, JSON.stringify(Array.from(seenIds)));
            } catch { /* quota exceeded などは無視 */ }
        };

        try {
            const now = new Date().toISOString();
            const { data: reminders, error } = await supabase
                .from('thread_reminders')
                .select('*, thread:threads(*)')
                .lte('remind_at', now)
                .eq('reminder_sent', false);

            if (error) {
                console.error('Failed to fetch reminders:', error);
                return;
            }

            if (reminders && reminders.length > 0) {
                for (const reminder of reminders) {
                    if (seenIds.has(reminder.id)) continue;

                    const thread = reminder.thread;
                    if (!thread) continue;

                    if (!isTeamNotifEnabled(thread.team_id)) continue;

                    const isCreator = thread.user_id === user.id;
                    let isTarget = isCreator;

                    if (!isCreator) {
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
                        const body = isCreator
                            ? 'あなたが設定したリマインドです'
                            : 'メンションされたリマインドです';
                        const url = `${window.location.origin}/Contact-Team-Manager/?thread=${thread.id}`;

                        await showNotification(title, body, url, `reminder-${reminder.id}`);
                    }

                    // 評価済みとして自分の localStorage に記録（対象外でも記録して再評価を防ぐ）
                    seenIds.add(reminder.id);

                    // グローバルな reminder_sent は創作者のみが更新（クリーンアップ用）
                    // メンション対象者が更新すると他ユーザーが通知を受け取れなくなるため
                    if (isCreator) {
                        await supabase.from('thread_reminders').update({ reminder_sent: true }).eq('id', reminder.id);
                    }
                }
                persistSeen();
            }
        } catch (e) {
            console.error('Reminder check error:', e);
        }
    }, [user, profile, isTeamNotifEnabled]);

    useEffect(() => {
        fetchTagData();
        fetchTeamNotifSettings();
        checkReminders();
        const interval = setInterval(() => {
            fetchTagData();
            fetchTeamNotifSettings();
            checkReminders();
        }, 60000);
        return () => clearInterval(interval);
    }, [fetchTagData, fetchTeamNotifSettings, checkReminders]);

    // Subscribe with auto-reconnect on disconnect
    useEffect(() => {
        if (!user) return;

        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const handleNewRecord = async (payload: any, table: string) => {
            const { new: newRecord } = payload;
            console.log(`[useNotifications] New record in ${table}:`, newRecord);

            if (newRecord.user_id === user.id) {
                console.log('[useNotifications] Skipping: Own action (UID match)', newRecord.id);
                return;
            }

            // チームの通知設定を確認
            const teamId = newRecord.team_id ?? newRecord.thread_team_id;
            if (!isTeamNotifEnabled(teamId)) {
                console.log('[useNotifications] Skipping: Team notifications disabled for team:', teamId);
                return;
            }

            const content = newRecord.content || '';
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

            console.log(`[useNotifications] Mention check: Name=${isMentionedByName}, All=${isMentionedByAll}, Tag=${isMentionedByTag}`);

            let title = 'Contact Team Manager';
            let body = '';
            let url = '/';
            const isMentioned = isMentionedByName || isMentionedByAll || isMentionedByTag;

            // 通知本文用にテキストを整形（HTMLタグ・エンティティ・改行を除去して短縮）
            const formatBody = (text: string): string => {
                if (!text) return '';
                // ブロック要素を改行に変換してから全タグを除去
                let s = text
                    .replace(/<br\s*\/?>/gi, ' ')
                    .replace(/<\/(div|p|li)>/gi, ' ')
                    .replace(/<[^>]+>/g, '');
                // HTMLエンティティをデコード（&nbsp; &amp; &lt; &gt; &quot; &#39; など）
                if (typeof DOMParser !== 'undefined') {
                    try {
                        const doc = new DOMParser().parseFromString(s, 'text/html');
                        s = doc.documentElement.textContent || s;
                    } catch { /* ignore */ }
                } else {
                    s = s.replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'");
                }
                s = s.replace(/\s+/g, ' ').trim();
                return s.length > 120 ? s.slice(0, 120) + '…' : s;
            };

            const mentionPrefix = isMentioned ? '📢 ' : '';
            const authorLabel = newRecord.author ? `${newRecord.author}: ` : '';

            if (table === 'threads') {
                // 新規投稿: スレッドタイトル（件名＋物件名）と本文を通知に表示
                const threadTitle = newRecord.title || '新しい投稿';
                title = `${mentionPrefix}${threadTitle}`;
                body = `${authorLabel}${formatBody(content)}`;
                url = `${window.location.origin}/Contact-Team-Manager/?thread=${newRecord.id}`;
            } else if (table === 'replies') {
                // 返信: 親スレッドのタイトルを取得して通知に表示
                let threadTitle = '新しい返信';
                try {
                    const { data: parentThread } = await supabase
                        .from('threads')
                        .select('title')
                        .eq('id', newRecord.thread_id)
                        .single();
                    if (parentThread?.title) threadTitle = parentThread.title;
                } catch (e) {
                    console.warn('[useNotifications] Failed to fetch parent thread title:', e);
                }
                title = `${mentionPrefix}${threadTitle}`;
                body = `${authorLabel}${formatBody(content)}`;
                url = `${window.location.origin}/Contact-Team-Manager/?thread=${newRecord.thread_id}`;
            }

            // アプリ内通知リストに追加
            addNotification({
                title,
                body,
                url,
                type: isMentioned ? 'mention' : 'new-message'
            });

            await showNotification(title, body, url, isMentioned ? 'mention' : 'new-message');
        };

        const subscribe = () => {
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }

            const channel = supabase
                .channel('global-notifications')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'threads' },
                    (payload) => { handleNewRecord(payload, 'threads').catch(console.error); })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'replies' },
                    (payload) => { handleNewRecord(payload, 'replies').catch(console.error); })
                .subscribe((status, err) => {
                    // 意図的な切断（再レンダリングによる removeChannel）後のステータスは無視する
                    if (channelRef.current !== channel) {
                        return;
                    }

                    console.log('[useNotifications] Subscription status:', status);
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                        console.warn('[useNotifications] Subscription lost, reconnecting in 5s...', err);
                        reconnectTimerRef.current = setTimeout(subscribe, RECONNECT_DELAY_MS);
                    }
                });

            channelRef.current = channel;
        };

        subscribe();

        return () => {
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
                reconnectTimerRef.current = null;
            }
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [user, profile, fetchTagData, isTeamNotifEnabled]);

    // チームの通知設定を更新する関数を返す
    const updateTeamNotifSetting = useCallback(async (teamId: string, enabled: boolean): Promise<void> => {
        if (!user) return;
        await supabase
            .from('team_members')
            .update({ notifications_enabled: enabled })
            .eq('user_id', user.id)
            .eq('team_id', teamId);
        // ローカルのキャッシュも即時更新
        teamNotifSettingsRef.current.set(String(teamId), enabled);
    }, [user]);

    return { updateTeamNotifSetting };
}
