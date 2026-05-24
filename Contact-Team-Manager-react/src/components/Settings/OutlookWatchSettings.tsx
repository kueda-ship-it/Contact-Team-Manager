import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTeams } from '../../hooks/useSupabase';
import {
    getInboxSubfolders,
    MailFolder,
    hasExternalAccessToken,
    initializeMsal,
    msalInstance,
    signIn,
    acquireMailToken,
} from '../../lib/microsoftGraph';

interface FolderWatch {
    id: string;
    folder_id: string;
    folder_name: string;
    team_id: string;
    is_active: boolean;
    last_checked_at: string;
}

// select要素の共通スタイル（input-fieldクラスを使わず直接指定して矢印の重複を防ぐ）
const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 36px 8px 12px',
    background: '#000',
    color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    appearance: 'none',
    WebkitAppearance: 'none',
    cursor: 'pointer',
    fontSize: '0.875rem',
    outline: 'none',
};

const SelectWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ position: 'relative' }}>
        {children}
        <span style={{
            position: 'absolute', right: '10px', top: '50%',
            transform: 'translateY(-50%)', pointerEvents: 'none',
            color: '#00B7C3', fontSize: '12px',
        }}>▾</span>
    </div>
);

export const OutlookWatchSettings: React.FC = () => {
    const { user } = useAuth();
    const { teams } = useTeams();

    const [watches, setWatches] = useState<FolderWatch[]>([]);
    const [folders, setFolders] = useState<MailFolder[]>([]);
    const [loadingFolders, setLoadingFolders] = useState(false);
    const [isMsConnected, setIsMsConnected] = useState(false);
    const [needsMailConsent, setNeedsMailConsent] = useState(false);

    const [selectedFolderId, setSelectedFolderId] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [saving, setSaving] = useState(false);

    const checkMsAuth = useCallback(async () => {
        if (hasExternalAccessToken()) { setIsMsConnected(true); return true; }
        await initializeMsal();
        const connected = !!msalInstance.getActiveAccount();
        setIsMsConnected(connected);
        return connected;
    }, []);

    const loadWatches = useCallback(async () => {
        if (!user) return;
        const { data } = await supabase
            .from('outlook_folder_watches')
            .select('id, folder_id, folder_name, team_id, is_active, last_checked_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: true });
        setWatches(data || []);
    }, [user]);

    const loadFolders = useCallback(async () => {
        setLoadingFolders(true);
        setNeedsMailConsent(false);
        try {
            const result = await getInboxSubfolders();
            setFolders(result);
        } catch (err: any) {
            console.error('[OutlookWatchSettings] Failed to load folders:', err);
            // 401/403/InteractionRequired = Mail.Read の同意が未取得
            const needsConsent =
                err?.statusCode === 401 ||
                err?.statusCode === 403 ||
                err?.errorCode === 'interaction_required' ||
                err?.message?.includes('Access is denied') ||
                err?.message?.includes('Insufficient privileges');
            if (needsConsent) {
                setNeedsMailConsent(true);
            } else {
                alert('フォルダの取得に失敗しました: ' + (err?.message || err));
            }
        } finally {
            setLoadingFolders(false);
        }
    }, []);

    useEffect(() => {
        checkMsAuth().then((connected) => {
            if (connected) loadFolders();
        });
        loadWatches();

        const handleToken = () => {
            setIsMsConnected(true);
            loadFolders();
        };
        window.addEventListener('externalTokenUpdated', handleToken);
        return () => window.removeEventListener('externalTokenUpdated', handleToken);
    }, [checkMsAuth, loadFolders, loadWatches]);

    const handleConnect = async () => {
        try {
                await signIn();
            setIsMsConnected(true);
            // ログイン直後に Mail.Read もまとめて取得（サイレント成功ならポップアップ不要）
            try { await acquireMailToken(true); } catch (_) { /* 失敗しても loadFolders でバナー表示 */ }
            await loadFolders();
        } catch (err: any) {
            alert('Microsoft 連携に失敗しました: ' + err.message);
        }
    };

    const handleGrantMailAccess = async () => {
        try {
            await acquireMailToken(true);
            setNeedsMailConsent(false);
            await loadFolders();
        } catch (err: any) {
            alert('認証に失敗しました: ' + err.message);
        }
    };

    const handleAddWatch = async () => {
        if (!user || !selectedFolderId || !selectedTeamId) return;
        const folder = folders.find(f => f.id === selectedFolderId);
        if (!folder) return;

        setSaving(true);
        try {
            const { error } = await supabase.from('outlook_folder_watches').insert({
                user_id: user.id,
                team_id: selectedTeamId,
                folder_id: selectedFolderId,
                folder_name: folder.displayName,
                last_checked_at: new Date().toISOString(),
            });
            if (error) throw error;
            setSelectedFolderId('');
            setSelectedTeamId('');
            await loadWatches();
        } catch (err: any) {
            alert('設定の保存に失敗しました: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (watch: FolderWatch) => {
        await supabase
            .from('outlook_folder_watches')
            .update({ is_active: !watch.is_active })
            .eq('id', watch.id);
        await loadWatches();
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('この監視設定を削除しますか？')) return;
        await supabase.from('outlook_folder_watches').delete().eq('id', id);
        await loadWatches();
    };

    const getTeamName = (teamId: string) =>
        teams.find(t => t.id === teamId)?.name || teamId;

    const alreadyWatched = new Set(watches.map(w => w.folder_id));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
                <h3 style={{ margin: '0 0 6px', fontSize: '1rem', fontWeight: 700 }}>
                    Outlookフォルダ監視
                </h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    受信トレイのサブフォルダに新着メールが届くと、指定したチームに自動でスレッドが作成されます。
                    Outlookで設定した「リマインダー（右クリック → リマインダーの追加）」も
                    アプリのリマインドに自動適用されます。
                </p>
            </div>

            {!isMsConnected ? (
                <div style={{ padding: '16px', background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '0.9rem' }}>Microsoft アカウントと連携が必要です</span>
                    <button className="btn btn-sm btn-primary" onClick={handleConnect}>
                        連携する
                    </button>
                </div>
            ) : needsMailConsent ? (
                // Mail.Read スコープの同意が必要な場合
                <div style={{ padding: '16px', background: 'rgba(255,193,7,0.1)', border: '1px solid rgba(255,193,7,0.3)', borderRadius: '10px' }}>
                    <p style={{ margin: '0 0 10px', fontSize: '0.9rem', fontWeight: 600 }}>
                        メールへのアクセス許可が必要です
                    </p>
                    <p style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        フォルダを読み取るために <strong>Mail.Read</strong> 権限が必要です。
                        下のボタンから再認証して許可してください。
                    </p>
                    <button className="btn btn-sm btn-primary" onClick={handleGrantMailAccess}>
                        メールアクセスを許可する（再認証）
                    </button>
                </div>
            ) : (
                <>
                    {/* 新規追加フォーム */}
                    <div style={{ padding: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <p style={{ margin: '0 0 12px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            新しい監視を追加
                        </p>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    監視フォルダ（受信トレイのサブフォルダ）
                                </label>
                                <SelectWrapper>
                                    <select
                                        value={selectedFolderId}
                                        onChange={e => setSelectedFolderId(e.target.value)}
                                        disabled={loadingFolders}
                                        style={selectStyle}
                                    >
                                        <option value="">
                                            {loadingFolders ? '読み込み中...' : 'フォルダを選択'}
                                        </option>
                                        {folders.map(f => (
                                            <option
                                                key={f.id}
                                                value={f.id}
                                                disabled={alreadyWatched.has(f.id)}
                                            >
                                                {f.displayName}
                                                {alreadyWatched.has(f.id) ? ' (設定済み)' : ''}
                                                {f.unreadItemCount > 0 ? ` (未読 ${f.unreadItemCount})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </SelectWrapper>
                            </div>
                            <div style={{ flex: '1 1 160px' }}>
                                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    投稿先チーム
                                </label>
                                <SelectWrapper>
                                    <select
                                        value={selectedTeamId}
                                        onChange={e => setSelectedTeamId(e.target.value)}
                                        style={selectStyle}
                                    >
                                        <option value="">チームを選択</option>
                                        {teams.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </SelectWrapper>
                            </div>
                            <button
                                className="btn btn-sm btn-primary"
                                onClick={handleAddWatch}
                                disabled={!selectedFolderId || !selectedTeamId || saving}
                                style={{ flexShrink: 0, height: '38px' }}
                            >
                                {saving ? '保存中...' : '追加'}
                            </button>
                        </div>
                    </div>

                    {/* 既存の監視一覧 */}
                    {watches.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                設定済みの監視
                            </p>
                            {watches.map(watch => (
                                <div
                                    key={watch.id}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '12px 14px',
                                        background: 'rgba(255,255,255,0.04)',
                                        borderRadius: '10px',
                                        border: `1px solid ${watch.is_active ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                        opacity: watch.is_active ? 1 : 0.6,
                                    }}
                                >
                                    <span style={{ fontSize: '1rem' }}>📁</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {watch.folder_name}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            → {getTeamName(watch.team_id)}
                                            {' '}・ 最終確認: {new Date(watch.last_checked_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                    <button
                                        className="btn btn-sm btn-outline"
                                        onClick={() => handleToggleActive(watch)}
                                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                                    >
                                        {watch.is_active ? '停止' : '再開'}
                                    </button>
                                    <button
                                        className="btn btn-sm btn-outline"
                                        onClick={() => handleDelete(watch.id)}
                                        style={{ fontSize: '0.75rem', padding: '4px 10px', color: '#f87171', borderColor: 'rgba(248,113,113,0.4)' }}
                                    >
                                        削除
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {watches.length === 0 && (
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                            監視中のフォルダはありません
                        </p>
                    )}
                </>
            )}
        </div>
    );
};
