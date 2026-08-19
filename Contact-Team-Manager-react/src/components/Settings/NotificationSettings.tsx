import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTeams, useUserMemberships } from '../../hooks/useSupabase';
import { MODE_LABEL, MODES, type NotifyMode } from '../../hooks/useNotifications';

/** チャネルごとの通知設定（自分の分だけ）。
 *
 *  設定の実体は `team_members.notify_mode`（'all' | 'mention' | 'none'）。
 *  ★`notifications_enabled` も併せて更新する。旧クライアント（root の app.js）が
 *    まだそちらを読んでいるため、片方だけ書くと挙動がズレる。
 *
 *  ここで変えた内容が通知側に効くまで最大60秒かかる
 *  （useNotifications が1分ごとに設定を読み直しているため）。
 */
const MODE_HELP: Record<NotifyMode, string> = {
    all: 'このチャネルの投稿と返信をすべて通知します',
    mention: '@自分 / @all / #タグ が当たったときだけ通知します',
    none: 'このチャネルでは通知しません',
};

export const NotificationSettings: React.FC = () => {
    const { user } = useAuth();
    const { teams } = useTeams();
    const { memberships } = useUserMemberships(user?.id);
    const [modes, setModes] = useState<Record<string, NotifyMode>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        const { data, error: e } = await supabase
            .from('team_members')
            .select('team_id, notify_mode, notifications_enabled')
            .eq('user_id', user.id);
        if (e) {
            setError(`設定を読めなかった: ${e.message}`);
        } else {
            const next: Record<string, NotifyMode> = {};
            (data || []).forEach((m: any) => {
                next[String(m.team_id)] = MODES.includes(m.notify_mode)
                    ? m.notify_mode
                    : (m.notifications_enabled === false ? 'none' : 'all');
            });
            setModes(next);
            setError(null);
        }
        setLoading(false);
    }, [user]);

    useEffect(() => { load(); }, [load]);

    const change = async (teamId: string, mode: NotifyMode) => {
        if (!user) return;
        const before = modes[teamId] ?? 'all';
        setModes(m => ({ ...m, [teamId]: mode }));   // 先に見た目を変える
        setSaving(teamId);
        // ★書き込みはタイムアウト付き。詰まったまま無言で終わらせない
        const timer = new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('タイムアウト（15秒）')), 15000));
        try {
            const req = supabase.from('team_members')
                .update({ notify_mode: mode, notifications_enabled: mode !== 'none' })
                .eq('user_id', user.id).eq('team_id', teamId);
            const { error: e } = await Promise.race([req, timer]) as any;
            if (e) throw e;
            setError(null);
        } catch (err: any) {
            setModes(m => ({ ...m, [teamId]: before }));   // 戻す
            setError(`保存に失敗した: ${err?.message || err}`);
            alert(`通知設定の保存に失敗しました\n${err?.message || err}`);
        } finally {
            setSaving(null);
        }
    };

    // 自分が入っているチャネルだけ。親チーム名でグループにして並べる
    const myTeamIds = new Set(memberships.map((m: any) => String(m.team_id)));
    const mine = teams
        .filter(t => myTeamIds.has(String(t.id)))
        .map(t => {
            const parent = t.parent_id
                ? teams.find(p => String(p.id) === String(t.parent_id))
                : null;
            return { id: String(t.id), name: t.name, parentName: parent?.name || '' };
        })
        .sort((a, b) => (a.parentName || a.name).localeCompare(b.parentName || b.name, 'ja')
            || a.name.localeCompare(b.name, 'ja'));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>チャネルごとの通知</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>
                    自分だけの設定です。新規投稿と返信の両方に効きます。<br />
                    変更が通知に反映されるまで最大1分かかります。
                </div>
            </div>

            {error && (
                <div style={{ fontSize: '0.8rem', color: 'var(--danger, #ff8a80)' }}>{error}</div>
            )}

            {loading && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>読み込み中…</div>}

            {!loading && mine.length === 0 && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    参加しているチャネルがありません。
                </div>
            )}

            <div style={{ display: 'grid', gap: '8px' }}>
                {mine.map(ch => {
                    const mode = modes[ch.id] ?? 'all';
                    return (
                        <div
                            key={ch.id}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(0, 1fr) 320px',
                                alignItems: 'center',
                                gap: '12px',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: 'var(--bg-subtle, rgba(255,255,255,.04))',
                                opacity: saving === ch.id ? 0.6 : 1,
                            }}
                        >
                            <div style={{ minWidth: 0 }}>
                                <div style={{
                                    fontSize: '0.9rem', overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {ch.name}
                                </div>
                                {ch.parentName && (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        {ch.parentName}
                                    </div>
                                )}
                            </div>

                            <div
                                role="radiogroup"
                                aria-label={`${ch.name} の通知`}
                                style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '4px' }}
                            >
                                {MODES.map(m => (
                                    <button
                                        key={m}
                                        role="radio"
                                        aria-checked={mode === m}
                                        title={MODE_HELP[m]}
                                        disabled={saving === ch.id}
                                        onClick={() => mode !== m && change(ch.id, m)}
                                        style={{
                                            height: '28px',
                                            boxSizing: 'border-box',
                                            fontSize: '0.75rem',
                                            lineHeight: 1,
                                            cursor: saving === ch.id ? 'default' : 'pointer',
                                            borderRadius: '6px',
                                            border: '1px solid var(--border, rgba(255,255,255,.15))',
                                            background: mode === m ? 'var(--accent, #6264A7)' : 'transparent',
                                            color: mode === m ? '#fff' : 'var(--text-muted)',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {MODE_LABEL[m]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
