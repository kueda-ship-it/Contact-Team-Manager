import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getNewMessagesInFolder, hasExternalAccessToken, initializeMsal, msalInstance } from '../lib/microsoftGraph';
import { useAuth } from './useAuth';

const POLL_INTERVAL_MS = 60_000; // 60秒ごとに確認

export const useOutlookFolderWatch = () => {
    const { user } = useAuth();
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isMsAuthenticated = useCallback(async (): Promise<boolean> => {
        if (hasExternalAccessToken()) return true;
        await initializeMsal();
        return !!msalInstance.getActiveAccount();
    }, []);

    const checkFolders = useCallback(async () => {
        if (!user) return;
        if (!(await isMsAuthenticated())) return;

        const { data: watches, error } = await supabase
            .from('outlook_folder_watches')
            .select('id, team_id, folder_id, last_checked_at')
            .eq('user_id', user.id)
            .eq('is_active', true);

        if (error || !watches?.length) return;

        for (const watch of watches) {
            try {
                const messages = await getNewMessagesInFolder(
                    watch.folder_id,
                    watch.last_checked_at
                );

                if (messages.length === 0) continue;

                const threadsToInsert = messages.map((msg) => {
                    // 右クリックリマインドの日時を remind_at にマッピング
                    let remindAt: string | null = null;
                    if (msg.flag?.dueDateTime?.dateTime) {
                        // Graph APIのdateTimeはタイムゾーンなしなので、timeZoneフィールドを参照しUTCに変換
                        const tz = msg.flag.dueDateTime.timeZone;
                        const dt = msg.flag.dueDateTime.dateTime;
                        if (tz === 'UTC' || !tz) {
                            remindAt = dt.endsWith('Z') ? dt : dt + 'Z';
                        } else {
                            // タイムゾーン付きの場合はそのまま Date に渡す
                            remindAt = new Date(`${dt} ${tz === 'Tokyo Standard Time' ? '+09:00' : dt}`).toISOString();
                        }
                    }

                    const senderName = msg.from?.emailAddress?.name || msg.from?.emailAddress?.address || 'Outlook';
                    const senderAddr = msg.from?.emailAddress?.address || '';
                    const content = `📧 差出人: ${senderName}${senderAddr ? ` <${senderAddr}>` : ''}\n\n${msg.bodyPreview}`;

                    return {
                        team_id: watch.team_id,
                        title: msg.subject || '(件名なし)',
                        content,
                        author: senderName,
                        user_id: user.id,
                        status: 'pending' as const,
                        remind_at: remindAt,
                        reminder_sent: false,
                    };
                });

                const { error: insertError } = await supabase
                    .from('threads')
                    .insert(threadsToInsert);

                if (insertError) {
                    console.error('[OutlookWatch] Thread insert error:', insertError);
                    continue;
                }

                // last_checked_at を最新メッセージの受信日時に更新
                const latestReceivedAt = messages[messages.length - 1].receivedDateTime;
                await supabase
                    .from('outlook_folder_watches')
                    .update({ last_checked_at: latestReceivedAt })
                    .eq('id', watch.id);

                console.log(`[OutlookWatch] Created ${messages.length} thread(s) from folder watch.`);
            } catch (err) {
                console.error('[OutlookWatch] Error processing watch:', watch.folder_id, err);
            }
        }
    }, [user, isMsAuthenticated]);

    useEffect(() => {
        if (!user) return;

        checkFolders();
        intervalRef.current = setInterval(checkFolders, POLL_INTERVAL_MS);

        // externalTokenUpdated イベントでも即時チェック
        const handleTokenUpdate = () => { checkFolders(); };
        window.addEventListener('externalTokenUpdated', handleTokenUpdate);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            window.removeEventListener('externalTokenUpdated', handleTokenUpdate);
        };
    }, [user, checkFolders]);
};
