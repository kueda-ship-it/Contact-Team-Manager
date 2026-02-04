import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentTeamId: number | null;
    currentTeamName: string;
    initialTab?: 'profile' | 'team';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentTeamId, currentTeamName, initialTab = 'profile' }) => {
    const { user, profile } = useAuth();
    const [activeTab, setActiveTab] = useState<'profile' | 'team'>(initialTab);

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
            // We might need to fetch team details if not fully available usually props are fine
            // reusing prop currentTeamName for now, ideally fetch full team object
            setTeamName(currentTeamName);
            // Fetch team icon if possible, or just default to empty if we don't pass it in props
            // For now let's assume valid name is good start
            // To get icon properly we might need a fetch or update props to include it
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
            alert('プロフィールを更新しました（反映にはリロードが必要な場合があります）');
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
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
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
                                        const filePath = `${fileName}`;

                                        const { error: uploadError } = await supabase.storage
                                            .from('avatars')
                                            .upload(filePath, file);

                                        if (uploadError) {
                                            throw uploadError;
                                        }

                                        const { data } = supabase.storage
                                            .from('avatars')
                                            .getPublicUrl(filePath);

                                        setAvatarUrl(data.publicUrl);
                                    } catch (error: any) {
                                        alert('画像のアップロードに失敗しました: ' + error.message);
                                    }
                                }}
                            />
                            {avatarUrl && (
                                <div style={{ marginTop: '10px' }}>
                                    <div className="avatar" style={{ width: '48px', height: '48px' }}>
                                        <img src={avatarUrl} alt="Preview" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                            <button className="btn btn-primary" onClick={handleSaveProfile}>保存</button>
                        </div>
                    </div>
                )}

                {activeTab === 'team' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>チーム名</label>
                            <input
                                type="text"
                                className="input-field"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                            />
                        </div>
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: 'var(--text-muted)' }}>チームアイコン</label>
                            <input
                                type="file"
                                accept="image/*"
                                className="input-field"
                                style={{ paddingTop: '10px' }}
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file || !currentTeamId) return;

                                    try {
                                        const fileExt = file.name.split('.').pop();
                                        const fileName = `team-${currentTeamId}-${Math.random()}.${fileExt}`;
                                        const filePath = `${fileName}`;

                                        const { error: uploadError } = await supabase.storage
                                            .from('avatars') // Using avatars bucket for simplicity, or create 'team-avatars'
                                            .upload(filePath, file);

                                        if (uploadError) {
                                            throw uploadError;
                                        }

                                        const { data } = supabase.storage
                                            .from('avatars')
                                            .getPublicUrl(filePath);

                                        setTeamIconUrl(data.publicUrl);
                                    } catch (error: any) {
                                        alert('画像のアップロードに失敗しました: ' + error.message);
                                    }
                                }}
                            />
                            {teamIconUrl && (
                                <div style={{ marginTop: '10px' }}>
                                    <div className="team-icon" style={{ width: '48px', height: '48px', overflow: 'hidden', padding: 0 }}>
                                        <img src={teamIconUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                            <button className="btn btn-primary" onClick={handleSaveTeam}>保存</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
