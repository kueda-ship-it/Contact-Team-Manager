import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTeamMembers, useProfiles } from '../../hooks/useSupabase';
import { CustomSelect } from '../common/CustomSelect';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentTeamId: number | string | null;
    currentTeamName: string;
    initialTab?: 'profile' | 'team';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentTeamId, currentTeamName, initialTab = 'profile' }) => {
    const { user, profile } = useAuth();
    const { profiles } = useProfiles();
    const { members, loading: membersLoading, addMember, updateMemberRole, removeMember } = useTeamMembers(currentTeamId);
    const [activeTab, setActiveTab] = useState<'profile' | 'team'>(initialTab);
    const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
        }
    }, [isOpen, initialTab]);

    // Profile State
    const [displayName, setDisplayName] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');

    // Team State
    const [teamName, setTeamName] = useState('');
    const [teamIconUrl, setTeamIconUrl] = useState('');

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
        }
    };

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

    const handleSaveTeam = async () => {
        if (!currentTeamId) return;
        const updates = {
            name: teamName,
            avatar_url: teamIconUrl
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
                        disabled={!currentTeamId}
                    >
                        チーム設定
                    </button>
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
                                            const fileName = `${user.id}-${Math.random()}.${fileExt}`;
                                            const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
                                            if (uploadError) throw uploadError;
                                            const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
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
                                                        const fileName = `team-${currentTeamId}-${Math.random()}.${fileExt}`;
                                                        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file);
                                                        if (uploadError) throw uploadError;
                                                        const { data } = supabase.storage.from('avatars').getPublicUrl(fileName);
                                                        setTeamIconUrl(data.publicUrl);
                                                    } catch (err: any) {
                                                        alert('アップロード失敗: ' + err.message);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                        <button className="btn btn-sm btn-primary" onClick={handleSaveTeam}>チーム設定を保存</button>
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
                                            ...profiles.filter(p => !members.some(m => m.profile_id === p.id)).map(p => ({ value: p.id, label: p.display_name }))
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
                </div>
            </div>
        </div>
    );
};
