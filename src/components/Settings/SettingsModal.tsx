import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTeamMembers, useProfiles, useTeams, usePermissions, useUserMemberships } from '../../hooks/useSupabase';
import { CustomSelect } from '../common/CustomSelect';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentTeamId: string | null;
    currentTeamName: string;
    initialTab?: 'profile' | 'team' | 'admin' | 'team-mgmt';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentTeamId, currentTeamName, initialTab = 'profile' }) => {
    const { user, profile } = useAuth();
    const { profiles } = useProfiles();
    const { teams } = useTeams();
    const { members, loading: membersLoading, addMember, updateMemberRole, removeMember } = useTeamMembers(currentTeamId);
    const { memberships } = useUserMemberships(user?.id);

    // Permission checks
    const { canEdit: canEditCurrentTeam, isAdmin: isGlobalAdmin } = usePermissions(currentTeamId);
    const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'admin' | 'team-mgmt'>(initialTab as any);
    const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab as any);
        }
    }, [isOpen, initialTab]);

    // Profile State
    const [displayName, setDisplayName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');

    const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
    const [bulkRole, setBulkRole] = useState<'Admin' | 'Manager' | 'Member' | 'Viewer'>('Member');
    const [isBulkUpdating, setIsBulkUpdating] = useState(false);

    const toggleUserSelection = (id: string) => {
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleBulkRoleUpdate = async () => {
        if (selectedUserIds.size === 0) return;
        if (!window.confirm(`${selectedUserIds.size}名のロールを一括で ${bulkRole} に更新しますか？`)) return;

        setIsBulkUpdating(true);
        try {
            const updates = Array.from(selectedUserIds).map(id => ({
                id,
                role: bulkRole,
                updated_at: new Date().toISOString()
            }));

            // Supabase upsert handles bulk updates if an array is passed
            const { error } = await supabase.from('profiles').upsert(updates);
            if (error) throw error;

            alert('一括更新が完了しました');
            setSelectedUserIds(new Set());
        } catch (error: any) {
            alert('更新に失敗しました: ' + error.message);
        } finally {
            setIsBulkUpdating(false);
        }
    };

    // Admin User Edit State

    const [editDisplayName, setEditDisplayName] = useState('');
    const [editAvatarUrl, setEditAvatarUrl] = useState('');
    const [editRole, setEditRole] = useState<'Admin' | 'Manager' | 'Member' | 'Viewer'>('Member');

    // Team State
    const [teamName, setTeamName] = useState('');
    const [teamIconUrl, setTeamIconUrl] = useState('');
    const [parentId, setParentId] = useState<string | null>(null);

    // Admin Team Management State
    const [selectedTeamId, setSelectedTeamId] = useState<string>('');
    const [mgmtTeamName, setMgmtTeamName] = useState('');
    const [mgmtTeamIconUrl, setMgmtTeamIconUrl] = useState('');
    const [mgmtParentId, setMgmtParentId] = useState<string | null>(null);
    const [isCreatingTeam, setIsCreatingTeam] = useState(false);

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.display_name || '');
            setAvatarUrl(profile.avatar_url || '');
        }
    }, [profile]);

    useEffect(() => {
        if (currentTeamId) {
            setTeamName(currentTeamName);
            fetchTeamDetails();
        }
    }, [currentTeamId, currentTeamName]);

    const fetchTeamDetails = async () => {
        if (!currentTeamId) return;
        const { data } = await supabase.from('teams').select('*').eq('id', currentTeamId).single();
        if (data) {
            setTeamName(data.name);
            setTeamIconUrl(data.avatar_url || '');
            setParentId(data.parent_id || null);
        }
    };

    const isAdmin = isGlobalAdmin;
    const canManageTeam = canEditCurrentTeam;

    useEffect(() => {
        if (selectedUserIds.size === 1) {
            const targetId = Array.from(selectedUserIds)[0];
            const u = profiles.find(p => p.id === targetId);
            if (u) {
                setEditDisplayName(u.display_name || '');
                setEditAvatarUrl(u.avatar_url || '');
                setEditRole(u.role || 'Member');
            }
        } else {
            // Clear edit fields if multiple or no users are selected
            setEditDisplayName('');
            setEditAvatarUrl('');
            setEditRole('Member');
        }
    }, [selectedUserIds, profiles]);

    useEffect(() => {
        if (selectedTeamId === 'new') {
            setIsCreatingTeam(true);
            setMgmtTeamName('');
            setMgmtTeamIconUrl('');
            // Don't reset mgmtParentId here - it may have been set by the "Add Channel" button
            // setMgmtParentId(null);
        } else if (selectedTeamId) {
            setIsCreatingTeam(false);
            const t = teams.find(team => team.id === selectedTeamId);
            if (t) {
                setMgmtTeamName(t.name);
                setMgmtTeamIconUrl(t.avatar_url || '');
                setMgmtParentId(t.parent_id || null);
            }
        }
    }, [selectedTeamId, teams]);

    const handleSaveProfile = async () => {
        if (!user) return;
        const updates = {
            id: user.id,
            display_name: displayName,
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('profiles').upsert(updates);
        if (error) {
            alert('プロフィールの更新に失敗しました: ' + error.message);
        } else {
            alert('プロフィールを更新しました');
            onClose();
        }
    };

    const handleSaveMgmtTeam = async () => {
        if (isCreatingTeam) {
            const { data, error } = await supabase.from('teams').insert({
                name: mgmtTeamName,
                avatar_url: mgmtTeamIconUrl,
                parent_id: mgmtParentId
            }).select().single();

            if (error) {
                alert('チームの作成に失敗しました: ' + error.message);
            } else {
                alert('チームを作成しました');
                setSelectedTeamId(data.id);
                setIsCreatingTeam(false);
            }
        } else {
            if (!selectedTeamId) return;
            const updates = {
                name: mgmtTeamName,
                avatar_url: mgmtTeamIconUrl,
                parent_id: mgmtParentId
            };

            const { error } = await supabase.from('teams').update(updates).eq('id', selectedTeamId);
            if (error) {
                alert('チームの更新に失敗しました: ' + error.message);
            } else {
                alert('チーム情報を更新しました');
            }
        }
    };

    const handleDeleteTeam = async () => {
        if (!selectedTeamId || isCreatingTeam) return;
        if (!window.confirm('本当にこのチームを削除しますか？所属メンバーやスレッドも影響を受ける可能性があります。')) return;

        const { error } = await supabase.from('teams').delete().eq('id', selectedTeamId);
        if (error) {
            alert('削除に失敗しました: ' + error.message);
        } else {
            alert('チームを削除しました');
            setSelectedTeamId('');
        }
    };

    const handleAdminSaveUser = async () => {
        if (selectedUserIds.size !== 1) return;
        const targetId = Array.from(selectedUserIds)[0];
        const updates = {
            id: targetId,
            display_name: editDisplayName,
            avatar_url: editAvatarUrl,
            role: editRole,
            updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from('profiles').upsert(updates);
        if (error) {
            alert('ユーザーの更新に失敗しました: ' + error.message);
        } else {
            alert('ユーザー情報を更新しました');
        }
    };

    const handleSaveTeam = async () => {
        if (!currentTeamId) return;
        const updates = {
            name: teamName,
            avatar_url: teamIconUrl,
            parent_id: parentId
        };

        const { error } = await supabase.from('teams').update(updates).eq('id', currentTeamId);
        if (error) {
            alert('チームの更新に失敗しました: ' + error.message);
        } else {
            alert('チーム情報を更新しました');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{ margin: 0 }}>設定</h2>
                    <button className="btn btn-sm btn-outline" onClick={onClose}>✕</button>
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <button
                        className={`btn btn-sm ${activeTab === 'profile' ? 'btn-primary' : 'btn-outline'}`}
                        style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' }}
                        onClick={() => setActiveTab('profile')}
                    >
                        個人設定
                    </button>
                    <button
                        className={`btn btn-sm ${activeTab === 'team' ? 'btn-primary' : 'btn-outline'}`}
                        style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' }}
                        onClick={() => setActiveTab('team')}
                        disabled={!currentTeamId || (!canManageTeam && !isAdmin)}
                    >
                        チーム設定
                    </button>
                    {isAdmin && (
                        <button
                            className={`btn btn-sm ${activeTab === 'admin' ? 'btn-primary' : 'btn-outline'}`}
                            style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' }}
                            onClick={() => setActiveTab('admin')}
                        >
                            ユーザー管理
                        </button>
                    )}
                    {(isAdmin || (canManageTeam && currentTeamId)) && (
                        <button
                            className={`btn btn-sm ${activeTab === 'team-mgmt' ? 'btn-primary' : 'btn-outline'}`}
                            style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' }}
                            onClick={() => setActiveTab('team-mgmt')}
                        >
                            チーム管理
                        </button>
                    )}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '12px', minHeight: 0 }}>
                    {activeTab === 'profile' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>表示名</label>
                                <input
                                    type="text"
                                    className="input-field"
                                    value={displayName}
                                    onChange={(e) => setDisplayName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>アイコン画像</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="input-field"
                                    style={{ paddingTop: '10px' }}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file || !user) return;
                                        try {
                                            const fileExt = file.name.split('.').pop();
                                            const fileName = `avatars/${user.id}-${Math.random()}.${fileExt}`;
                                            const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, file);
                                            if (uploadError) throw uploadError;
                                            const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
                                            setAvatarUrl(data.publicUrl);
                                        } catch (err: any) {
                                            alert('アップロード失敗: ' + err.message);
                                        }
                                    }}
                                />
                                {avatarUrl && (
                                    <div style={{ marginTop: '10px' }}>
                                        <img src={avatarUrl} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={handleSaveProfile}>保存</button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'team' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                            <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--accent)' }}>基本情報</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>チーム名</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            value={teamName}
                                            onChange={(e) => setTeamName(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>チームアイコン</label>
                                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                            {teamIconUrl && <img src={teamIconUrl} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />}
                                            <input
                                                type="file"
                                                accept="image/*"
                                                style={{ fontSize: '0.8rem' }}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file || !currentTeamId) return;
                                                    try {
                                                        const fileExt = file.name.split('.').pop();
                                                        const fileName = `avatars/team-${currentTeamId}-${Math.random()}.${fileExt}`;
                                                        const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, file);
                                                        if (uploadError) throw uploadError;
                                                        const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
                                                        setTeamIconUrl(data.publicUrl);
                                                    } catch (err: any) {
                                                        alert('アップロード失敗: ' + err.message);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button className="btn btn-sm btn-primary" onClick={handleSaveTeam}>基本情報を保存</button>
                                    </div>
                                </div>
                            </div>

                            <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--accent)' }}>階層設定 (Team / Channel)</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>親チーム (これを設定すると Channel になります)</label>
                                        <CustomSelect
                                            placeholder="親チームを選択..."
                                            options={[
                                                { value: '', label: 'なし (上位 Team)' },
                                                ...teams
                                                    .filter(t => t.id !== currentTeamId && !t.parent_id)
                                                    .map(t => ({ value: t.id, label: t.name })),
                                            ]}
                                            value={parentId || ''}
                                            onChange={(val) => setParentId(val ? String(val) : null)}
                                            style={{ height: '36px' }}
                                        />
                                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                                            ※親チームを設定すると、そのチームの「Channel」として表示されます。
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        {/* Only show "Add Channel" if current team is NOT a channel itself */}
                                        {!parentId && (
                                            <button
                                                className="btn btn-sm"
                                                style={{ padding: '6px 12px', background: 'rgba(0,183,189,0.1)', color: 'var(--accent)', border: '1px solid rgba(0,183,189,0.2)' }}
                                                onClick={() => {
                                                    setActiveTab('team-mgmt');
                                                    setSelectedTeamId('new');
                                                    setIsCreatingTeam(true);
                                                    setMgmtTeamName('');
                                                    setMgmtTeamIconUrl('');
                                                    setMgmtParentId(String(currentTeamId));
                                                }}
                                            >
                                                + このチームにチャネルを追加
                                            </button>
                                        )}
                                        <button className="btn btn-sm btn-primary" onClick={handleSaveTeam}>階層設定を保存</button>
                                    </div>
                                </div>
                            </div>

                            <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--accent)' }}>メンバー管理</h4>
                                <div style={{ marginBottom: '15px' }}>
                                    <CustomSelect
                                        placeholder="メンバーを追加..."
                                        options={[
                                            { value: '', label: 'メンバーを追加...' },
                                            ...profiles.filter(p => !members.some(m => m.user_id === p.id)).map(p => ({ value: p.id, label: p.display_name }))
                                        ]}
                                        value=""
                                        onChange={async (val: string | number) => {
                                            if (val) {
                                                await addMember(String(val));
                                            }
                                        }}
                                        style={{ height: '36px' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {membersLoading ? <div>読み込み中...</div> : members.map((m: any) => (
                                        <div key={m.user_id} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '8px',
                                            background: 'rgba(255,255,255,0.03)',
                                            borderRadius: '6px',
                                            opacity: updatingRoleId === m.user_id ? 0.5 : 1
                                        }}>
                                            <span style={{ fontSize: '0.9rem' }}>{m.profile?.display_name || 'Unknown'}</span>
                                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                {updatingRoleId === m.user_id && <span style={{ fontSize: '0.7rem', color: 'var(--accent)' }}>保存中...</span>}
                                                <CustomSelect
                                                    options={[
                                                        { value: 'Manager', label: '管理者' },
                                                        { value: 'Member', label: 'メンバー' },
                                                        { value: 'Viewer', label: '閲覧のみ' }
                                                    ]}
                                                    value={m.role || 'Member'}
                                                    onChange={async (newRole: string | number) => {
                                                        setUpdatingRoleId(m.user_id);
                                                        try {
                                                            await updateMemberRole(m.user_id, String(newRole));
                                                        } catch (err: any) {
                                                            alert('ロールの更新に失敗しました: ' + err.message);
                                                        } finally {
                                                            setUpdatingRoleId(null);
                                                        }
                                                    }}
                                                    style={{ width: '130px', height: '28px' }}
                                                    className={updatingRoleId === m.user_id ? 'disabled' : ''}
                                                />
                                                <button
                                                    onClick={() => removeMember(m.user_id)}
                                                    style={{ color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 5px' }}
                                                    disabled={updatingRoleId === m.user_id}
                                                >✕</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {/* Extra space to ensure dropdowns at the bottom are not clipped by the scroll container */}
                            <div style={{ height: '180px' }}></div>
                        </div>
                    )}

                    {activeTab === 'admin' && isAdmin && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--accent)' }}>ユーザー管理 ({profiles.length}名)</h4>
                                    {selectedUserIds.size > 0 && (
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', background: 'rgba(0,183,189,0.1)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--accent)' }}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{selectedUserIds.size}人選択中</span>
                                            <CustomSelect
                                                options={[
                                                    { value: 'Admin', label: 'システム管理者' },
                                                    { value: 'Manager', label: 'マネージャー' },
                                                    { value: 'Member', label: 'メンバー' },
                                                    { value: 'Viewer', label: '閲覧のみ' }
                                                ]}
                                                value={bulkRole}
                                                onChange={(val) => setBulkRole(val as any)}
                                                style={{ height: '28px', width: '130px', fontSize: '0.8rem' }}
                                            />
                                            <button
                                                className="btn btn-sm btn-primary"
                                                onClick={handleBulkRoleUpdate}
                                                disabled={isBulkUpdating}
                                                style={{ height: '28px', padding: '0 10px' }}
                                            >
                                                {isBulkUpdating ? '更新中...' : '一括変更'}
                                            </button>
                                            <button
                                                style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', opacity: 0.6 }}
                                                onClick={() => setSelectedUserIds(new Set())}
                                            >✕</button>
                                        </div>
                                    )}
                                </div>

                                <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '4px', padding: '4px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                    {profiles.map(p => (
                                        <div
                                            key={p.id}
                                            onClick={() => toggleUserSelection(p.id)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px',
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                background: selectedUserIds.has(p.id) ? 'rgba(0,183,189,0.15)' : 'transparent',
                                                border: selectedUserIds.has(p.id) ? '1px solid rgba(0,183,189,0.3)' : '1px solid transparent',
                                                transition: 'all 0.1s'
                                            }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedUserIds.has(p.id)}
                                                readOnly
                                                style={{ pointerEvents: 'none' }}
                                            />
                                            <img src={p.avatar_url || 'https://via.placeholder.com/32'} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{p.display_name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.email}</div>
                                            </div>
                                            <div style={{
                                                fontSize: '0.75rem',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                background: 'rgba(255,255,255,0.05)',
                                                color: p.role === 'Admin' ? '#FF6B6B' : (p.role === 'Manager' ? '#4D96FF' : 'inherit')
                                            }}>
                                                {p.role === 'Admin' ? '管理者' : (p.role === 'Manager' ? 'マネージャ' : (p.role === 'Viewer' ? '閲覧' : 'メンバ'))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {selectedUserIds.size === 1 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <h5 style={{ margin: 0, fontSize: '0.85rem' }}>個別編集: {editDisplayName}</h5>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>表示名</label>
                                            <input
                                                type="text"
                                                className="input-field"
                                                value={editDisplayName}
                                                onChange={(e) => setEditDisplayName(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>ロール (権限)</label>
                                            <CustomSelect
                                                options={[
                                                    { value: 'Admin', label: 'システム管理者' },
                                                    { value: 'Manager', label: 'マネージャー' },
                                                    { value: 'Member', label: 'メンバー' },
                                                    { value: 'Viewer', label: '閲覧のみ' }
                                                ]}
                                                value={editRole}
                                                onChange={(val) => setEditRole(val as any)}
                                                style={{ height: '36px' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <button className="btn btn-sm btn-primary" onClick={handleAdminSaveUser}>設定を保存</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'team-mgmt' && (isAdmin || canManageTeam) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--accent)' }}>チーム管理</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>チームを選択</label>
                                        <CustomSelect
                                            placeholder="チームを選択..."
                                            options={[
                                                { value: '', label: '選択してください...' },
                                                ...(isAdmin ? [{ value: 'new', label: '+ 新規チーム作成' }] : []),
                                                ...teams.filter(t => {
                                                    if (isAdmin) return true;
                                                    const isDirectManager = memberships.some(m => String(m.team_id) === String(t.id) && m.role === 'Manager');
                                                    if (isDirectManager) return true;
                                                    // Also show if manager of parent
                                                    if (t.parent_id) {
                                                        return memberships.some(m => String(m.team_id) === String(t.parent_id) && m.role === 'Manager');
                                                    }
                                                    return false;
                                                }).map(t => ({ value: t.id, label: t.name }))
                                            ]}
                                            value={selectedTeamId}
                                            onChange={(val) => {
                                                setSelectedTeamId(String(val));
                                                // If user manually selects "new team" from dropdown, clear parent ID
                                                if (val === 'new') {
                                                    setMgmtParentId(null);
                                                }
                                            }}
                                            style={{ height: '36px' }}
                                        />
                                    </div>

                                    {(selectedTeamId || isCreatingTeam) && (
                                        <>
                                            <div style={{ padding: '15px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <h5 style={{ margin: '0 0 12px 0', fontSize: '0.85rem' }}>
                                                    {isCreatingTeam ? (mgmtParentId ? '新規チャネル作成' : '新規チーム作成') : 'チーム編集'}
                                                </h5>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>名称</label>
                                                        <input
                                                            type="text"
                                                            className="input-field"
                                                            value={mgmtTeamName}
                                                            onChange={(e) => setMgmtTeamName(e.target.value)}
                                                            placeholder="チーム名を入力..."
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>チームアイコン</label>
                                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                                            {mgmtTeamIconUrl && <img src={mgmtTeamIconUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />}
                                                            <input
                                                                type="file"
                                                                accept="image/*"
                                                                style={{ fontSize: '0.75rem' }}
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (!file) return;
                                                                    try {
                                                                        const fileExt = file.name.split('.').pop();
                                                                        const fileName = `avatars/mgmt-team-${Math.random()}.${fileExt}`;
                                                                        const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, file);
                                                                        if (uploadError) throw uploadError;
                                                                        const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
                                                                        setMgmtTeamIconUrl(data.publicUrl);
                                                                    } catch (err: any) {
                                                                        alert('アップロード失敗: ' + err.message);
                                                                    }
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>親チーム (Channel 設定)</label>
                                                        <CustomSelect
                                                            options={[
                                                                { value: '', label: 'なし (上位 Team)' },
                                                                ...teams
                                                                    .filter(t => t.id !== selectedTeamId && !t.parent_id)
                                                                    .map(t => ({ value: t.id, label: t.name }))
                                                            ]}
                                                            value={mgmtParentId || ''}
                                                            onChange={(val) => setMgmtParentId(val ? String(val) : null)}
                                                            style={{ height: '32px', fontSize: '0.8rem' }}
                                                        />
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                                                        {!isCreatingTeam && (
                                                            <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} onClick={handleDeleteTeam}>削除</button>
                                                        )}
                                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
                                                            <button className="btn btn-sm btn-primary" onClick={handleSaveMgmtTeam}>
                                                                {isCreatingTeam ? '作成' : '保存'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                            <div style={{ height: '180px' }}></div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
