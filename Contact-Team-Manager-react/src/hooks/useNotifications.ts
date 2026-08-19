
import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useNotificationContext } from '../context/NotificationContext';

const RECONNECT_DELAY_MS = 5000;

/** チャネルごとの通知モード。DB は team_members.notify_mode（既定 'all'） */
export type NotifyMode = 'all' | 'mention' | 'none';
export const MODES: NotifyMode[] = ['all', 'mention', 'none'];
export const MODE_LABEL: Record<NotifyMode, string> = {
    all: 'すべて通知',
    mention: 'メンションのみ',
    none: '通知しない',
};

// 通知アイコンのパス（GitHub Pages のサブパス対応のため import.meta.env.BASE_URL を使用）
const NOTIFICATION_ICON = `${import.meta.env.BASE_URL}favicon-v3.png`;

async function showNotification(title: string, body: string, url: string, tag: string) {
    if (typeof Notification === 'undefined') {
        console.warn('[useNotifications] Notification API unavailable');
        return;
    }
    if (Notification.permission !== 'granted') {
        console.warn('[useNotifications] Notification permission not granted:', Notification.permission);
        return;
    }

    const options: NotificationOptions = {
        body,
        icon: NOTIFICATION_ICON,
        data: { url },
        tag,
        // 同じ tag でも毎回ポップアップさせる（既定 false だとサイレントに置き換わる）
        renotify: true,
    } as NotificationOptions & { renotify?: boolean };

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
        const n = new Notification(title, { body, icon: NOTIFICATION_ICON, data: { url } });
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
    // チャネルIDと通知モードのマップ { teamId: 'all' | 'mention' | 'none' }
    //   all     … そのチャネルの投稿・返信をすべて通知
    //   mention … 自分宛のメンションが当たったときだけ通知
    //   none    … 通知しない
    const teamNotifSettingsRef = useRef<Map<string, NotifyMode>>(new Map());
    // 返信の親スレッド（team_id / title）のキャッシュ。返信のたびに引かないため
    const threadMetaRef = useRef<Map<string, { teamId: string | null; title: string }>>(new Map());
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
                .select('team_id, notify_mode, notifications_enabled')
                .eq('user_id', user.id);
            if (data) {
                const map = new Map<string, NotifyMode>();
                data.forEach((m: any) => {
                    // notify_mode が主。古い行や旧クライアント由来は notifications_enabled から補う
                    const mode: NotifyMode = MODES.includes(m.notify_mode)
                        ? m.notify_mode
                        : (m.notifications_enabled === false ? 'none' : 'all');
                    map.set(String(m.team_id), mode);
                });
                teamNotifSettingsRef.current = map;
            }
        } catch (e) {
            console.error('Failed to fetch team notification settings:', e);
        }
    }, [user]);

    // チームの通知が有効かチェック（設定がない場合は有効とみなす）
    /** そのチャネルの通知モード。未設定（＝行が無い）のときは 'all' 扱い */
    const teamNotifMode = useCallback((teamId: string | number | null | undefined): NotifyMode => {
        if (!teamId) return 'all';
        return teamNotifSettingsRef.current.get(String(teamId)) ?? 'all';
    }, []);

    const isTeamNotifEnabled = useCallback((teamId: string | number | null): boolean =>
        teamNotifMode(teamId) !== 'none', [teamNotifMode]);

    /** 返信は team_id を持たないことがある。親スレッドから引いて覚える */
    const threadMeta = useCallback(async (threadId: string) => {
        if (!threadId) return { teamId: null as string | null, title: '' };
        const hit = threadMetaRef.current.get(threadId);
        if (hit) return hit;
        try {
            const { data } = await supabase
                .from('threads').select('title, team_id').eq('id', threadId).single();
            const meta = { teamId: (data?.team_id ?? null) as string | null, title: data?.title || '' };
            threadMetaRef.current.set(threadId, meta);
            if (threadMetaRef.current.size > 500) {
                // 際限なく持たない。古いものから落とす
                const first = threadMetaRef.current.keys().next().value;
                if (first) threadMetaRef.current.delete(first);
            }
            return meta;
        } catch (e) {
            console.warn('[useNotifications] Failed to fetch parent thread:', e);
            return { teamId: null as string | null, title: '' };
        }
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

            // ★返信は team_id が入っていないことがある（アプリ側の insert が付けていない）。
            //   そのまま判定するとチャネル設定を素通りしてしまうので、親スレッドから解決する。
            let parentTitle = '';
            let teamId = newRecord.team_id ?? newRecord.thread_team_id ?? null;
            if (table === 'replies') {
                const meta = await threadMeta(newRecord.thread_id);
                parentTitle = meta.title;
                if (!teamId) teamId = meta.teamId;
            }

            const mode = teamNotifMode(teamId);
            if (mode === 'none') {
                console.log('[useNotifications] Skipping: notify_mode=none', teamId);
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

            // 'mention' は自分宛のときだけ鳴らす。'all' は素通し
            if (mode === 'mention' && !isMentioned) {
                console.log('[useNotifications] Skipping: notify_mode=mention (not mentioned)', teamId);
                return;
            }

            // 通知本文用にテキストを整形（メンション記号や改行を整理して短縮）
            // 通知本文用にテキストを整形（HTMLタグ・エンティティ・改行を除去して短縮）
            const formatBody = (text: string): string => {
                if (!text) return '';
                // ブロック要素を空白に変換してから全タグを除去
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
                // 返信: 親スレッドのタイトルを見出しにする（上の threadMeta で取得済み）
                const threadTitle = parentTitle || '新しい返信';
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

            // tag は record id ベースで一意化（同じスレッドへの返信が連続しても個別に通知）
            const tagId = `${table}-${newRecord.id}`;
            await showNotification(title, body, url, tagId);
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

        // 注: global-notifications は INSERT のみ + table 単位購読 (threads/replies)。
        // メンバーシップ判定は受信側 (handleNewRecord 内) で行うため filter は付けない。
        // 過去 filter なし全件購読で Egress を焼いた事故 (#33) があるので、
        // ここで購読する event は必ず INSERT のみに限定すること (UPDATE/DELETE は含めない)。
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
    }, [user, profile, fetchTagData, teamNotifMode, threadMeta]);

    /** チャネルごとの通知モードを更新する。
     *  ★notifications_enabled も併せて更新する（旧クライアントが読んでいるため）。 */
    const updateTeamNotifMode = useCallback(async (teamId: string, mode: NotifyMode): Promise<void> => {
        if (!user) return;
        const { error } = await supabase
            .from('team_members')
            .update({ notify_mode: mode, notifications_enabled: mode !== 'none' })
            .eq('user_id', user.id)
            .eq('team_id', teamId);
        if (error) throw error;
        teamNotifSettingsRef.current.set(String(teamId), mode);   // 即時反映
    }, [user]);

    /** 現在のモードを読む（設定画面の初期表示用） */
    const getTeamNotifMode = useCallback((teamId: string): NotifyMode =>
        teamNotifMode(teamId), [teamNotifMode]);

    return { updateTeamNotifMode, getTeamNotifMode, fetchTeamNotifSettings };
}
