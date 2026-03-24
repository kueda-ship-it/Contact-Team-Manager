import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTeamMembers, useProfiles, useTeams, usePermissions, useUserMemberships, useTags } from '../../hooks/useSupabase';
import { CustomSelect } from '../common/CustomSelect';
import { msalInstance, signIn, signOut, initializeMsal } from '../../lib/microsoftGraph';
import type { AccountInfo } from '@azure/msal-browser';
import { CHANGELOG } from '../../data/changelog';
import { TagMemberEditor } from './TagMemberEditor';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentTeamId: string | null;
    currentTeamName: string;
    initialTab?: 'profile' | 'team' | 'admin' | 'team-mgmt' | 'history';
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentTeamId, currentTeamName, initialTab = 'profile' }) => {
    const { user, profile } = useAuth();
    const { profiles } = useProfiles();
    const { teams } = useTeams();
    const { members, loading: membersLoading, addMember, updateMemberRole, removeMember } = useTeamMembers(currentTeamId);
    const { memberships } = useUserMemberships(user?.id);
    const { tags, addTag, deleteTag } = useTags();

    console.log('[SettingsModal] Render. currentTeamId prop:', currentTeamId, 'type:', typeof currentTeamId);

    // Permission checks
    const { canEdit: canEditCurrentTeam, isAdmin: isGlobalAdmin } = usePermissions(currentTeamId);
    const [activeTab, setActiveTab] = useState<'profile' | 'team' | 'admin' | 'team-mgmt' | 'history'>(initialTab as any);
    const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
    const [newTagName, setNewTagName] = useState('');

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
    const [editIsActive, setEditIsActive] = useState(true);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);

    // Team State
    const [teamName, setTeamName] = useState('');
    const [teamIconUrl, setTeamIconUrl] = useState('');
    const [parentId, setParentId] = useState<string | null>(null);
    const [teamEmailAddress, setTeamEmailAddress] = useState('');

    // Admin Team Management State
    const [selectedTeamId, setSelectedTeamId] = useState<string>('');
    const [mgmtTeamName, setMgmtTeamName] = useState('');
    const [mgmtTeamIconUrl, setMgmtTeamIconUrl] = useState('');
    const [mgmtParentId, setMgmtParentId] = useState<string | null>(null);
    const [mgmtEmailAddress, setMgmtEmailAddress] = useState('');
    const [isCreatingTeam, setIsCreatingTeam] = useState(false);

    // Microsoft Graph Status
    const [msAccount, setMsAccount] = useState<AccountInfo | null>(null);
    const [msLoading, setMsLoading] = useState(false);

    useEffect(() => {
        const checkMsAccount = async () => {
            await initializeMsal();
            setMsAccount(msalInstance.getActiveAccount());
        };
        if (isOpen) {
            checkMsAccount();
        }
    }, [isOpen]);

    const handleMsLogin = async () => {
        setMsLoading(true);
        try {
            await initializeMsal();
            const account = await signIn();
            setMsAccount(account);
            alert("Microsoft 連携に成功しました。");
        } catch (err: any) {
            // Error is already alerted in signIn or can be handled here
            if (err.message && !err.message.includes("ポップアップ")) {
                alert("Microsoft 連携に失敗しました: " + err.message);
            }
        } finally {
            setMsLoading(false);
        }
    };

    const handleMsLogout = async () => {
        if (!window.confirm("Microsoft 連携を解除しますか？OneDrive へのアップロードができなくなります。")) return;
        setMsLoading(true);
        try {
            await signOut();
            setMsAccount(null);
        } catch (err: any) {
            alert("解除に失敗しました: " + err.message);
        } finally {
            setMsLoading(false);
        }
    };

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
        console.log('[fetchTeamDetails] Fetching for ID:', currentTeamId);
        const { data, error } = await supabase.from('teams').select('*').eq('id', currentTeamId).single();
        if (error) {
            console.error('[fetchTeamDetails] Error:', error);
            return;
        }
        if (data) {
            console.log('[fetchTeamDetails] Data received:', data);
            setTeamName(data.name);
            setTeamIconUrl(data.avatar_url || '');
            setParentId(data.parent_id || null);
            setTeamEmailAddress(data.email_address || '');
        }
    };

    // Attach to window for easier debugging
    useEffect(() => {
        (window as any).debugSupabase = supabase;
        (window as any).debugCurrentTeamId = currentTeamId;
    }, [currentTeamId]);

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
                setEditIsActive(u.is_active !== false);
            }
        } else {
            // Clear edit fields if multiple or no users are selected
            setEditDisplayName('');
            setEditAvatarUrl('');
            setEditRole('Member');
            setEditIsActive(true);
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
                setMgmtEmailAddress(t.email_address || '');
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

    const handleFirstChannelCreation = async (parentTeamId: string | number, currentChannelId: string | number) => {
        try {
            const { data: existingChannels } = await supabase
                .from('teams')
                .select('id, name')
                .eq('parent_id', parentTeamId);

            const otherChannels = existingChannels?.filter(c => String(c.id) !== String(currentChannelId)) || [];

            // If there are other channels already, do nothing.
            if (otherChannels.length > 0) return;

            // At this point, the parent had NO other channels before we added currentChannelId.
            const currentChannelData = existingChannels?.find(c => String(c.id) === String(currentChannelId));
            let targetChannelId = currentChannelId;

            if (currentChannelData?.name !== '一般') {
                // Create "一般" channel because user created something else as the first one
                const { data: generalChannel } = await supabase
                    .from('teams')
                    .select('id')
                    .eq('parent_id', parentTeamId)
                    .eq('name', '一般')
                    .maybeSingle();

                targetChannelId = generalChannel?.id || currentChannelId;

                if (!generalChannel?.id) {
                    const { data: newGeneralChannel, error: genCreateError } = await supabase
                        .from('teams')
                        .insert({
                            name: '一般',
                            parent_id: parentTeamId
                        })
                        .select()
                        .single();

                    if (newGeneralChannel) {
                        targetChannelId = newGeneralChannel.id;
                    } else if (genCreateError) {
                        console.error('Failed to create 一般 channel:', genCreateError);
                    }
                }
            }

            if (targetChannelId) {
                // Move threads
                const { error: moveError } = await supabase
                    .from('threads')
                    .update({ team_id: targetChannelId })
                    .eq('team_id', parentTeamId);

                if (!moveError) {
                    console.log('Moved existing threads to 一般 channel for parent:', parentTeamId);
                } else {
                    console.error('Failed to move threads:', moveError);
                }

                // Copy parent team memberships to the 一般 channel
                const { data: parentMembers, error: membersError } = await supabase
                    .from('team_members')
                    .select('user_id, role')
                    .eq('team_id', parentTeamId);

                if (!membersError && parentMembers && parentMembers.length > 0) {
                    const newMemberships = parentMembers.map(m => ({
                        team_id: targetChannelId,
                        user_id: m.user_id,
                        role: m.role
                    }));

                    const { error: copyError } = await supabase
                        .from('team_members')
                        .upsert(newMemberships, { onConflict: 'team_id,user_id' });

                    if (!copyError) {
                        console.log(`Copied ${parentMembers.length} memberships to 一般 channel`);
                    } else {
                        console.error('Failed to copy memberships:', copyError);
                    }
                }
            }
        } catch (e) {
            console.error('Error handling first channel creation:', e);
        }
    };

    const handleSaveMgmtTeam = async () => {
        if (isCreatingTeam) {
            const insertData = {
                name: mgmtTeamName,
                avatar_url: mgmtTeamIconUrl,
                parent_id: mgmtParentId,
                email_address: mgmtEmailAddress || null
            };
            console.log('[handleSaveMgmtTeam] Creating:', insertData);
            const { data, error } = await supabase.from('teams').insert(insertData).select().single();

            if (error) {
                console.error('[handleSaveMgmtTeam] Create Error:', error);
                alert('チームの作成に失敗しました: ' + error.message);
            } else {
                console.log('[handleSaveMgmtTeam] Create Success:', data);
                alert('チームを作成しました');
                setSelectedTeamId(data.id);
                setIsCreatingTeam(false);
                if (mgmtParentId) {
                    await handleFirstChannelCreation(mgmtParentId, data.id);
                }
            }
        } else {
            if (!selectedTeamId) return;
            const updates = {
                name: mgmtTeamName,
                avatar_url: mgmtTeamIconUrl,
                parent_id: mgmtParentId,
                email_address: mgmtEmailAddress || null
            };

            console.log('[handleSaveMgmtTeam] Updating:', selectedTeamId, updates);
            const { error } = await supabase.from('teams').update(updates).eq('id', selectedTeamId);
            if (error) {
                console.error('[handleSaveMgmtTeam] Update Error:', error);
                alert('チームの更新に失敗しました: ' + error.message);
            } else {
                console.log('[handleSaveMgmtTeam] Update Success');
                alert('チーム情報を更新しました');
                if (mgmtParentId) {
                    await handleFirstChannelCreation(mgmtParentId, selectedTeamId);
                }
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

    const handleRegisterUser = async () => {
        if (!newUserEmail) return;
        setIsRegistering(true);
        try {
            // Check if user already exists in profiles
            const { data: existingProfile } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', newUserEmail)
                .maybeSingle();

            if (existingProfile) {
                alert('このユーザーは既にシステムに登録されています。');
                setIsRegistering(false);
                return;
            }

            // Check if already in whitelist
            const { data: existingWhitelist } = await supabase
                .from('whitelist')
                .select('email')
                .eq('email', newUserEmail)
                .maybeSingle();

            if (existingWhitelist) {
                alert('このメールアドレスは既にホワイトリストに登録済みです。');
                setIsRegistering(false);
                return;
            }

            // Insert into the new 'whitelist' table instead of 'profiles'
            // This avoids the foreign key constraint with auth.users because
            // we haven't created the auth user yet.
            const { error } = await supabase.from('whitelist').insert({
                email: newUserEmail
            });

            if (error) throw error;

            alert('ユーザーを登録しました。');
            setNewUserEmail('');
            // reload profiles is handled by the hook
        } catch (error: any) {
            alert('登録に失敗しました: ' + error.message);
        } finally {
            setIsRegistering(false);
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
            is_active: editIsActive,
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
        console.log('[handleSaveTeam] Clicked. currentTeamId prop at click time:', currentTeamId);

        if (!currentTeamId || currentTeamId === 'null') {
            console.warn('[handleSaveTeam] No currentTeamId (falsy or string "null")');
            alert(`エラー: チームIDが特定できません (currentTeamId: ${currentTeamId})\nチームが正しく選択されているか確認してください。`);
            return;
        }

        const updates = {
            name: teamName,
            avatar_url: teamIconUrl,
            parent_id: parentId,
            email_address: teamEmailAddress || null
        };

        console.log('[handleSaveTeam] Start. Updates:', updates);
        // Explicitly cast to number if it looks like one
        const targetId = isNaN(Number(currentTeamId)) ? currentTeamId : Number(currentTeamId);
        console.log('[handleSaveTeam] targetId after cast:', targetId);

        try {
            const { data, error, status } = await supabase
                .from('teams')
                .update(updates)
                .eq('id', targetId)
                .select();

            console.log('[handleSaveTeam] Supabase response status:', status, 'Data:', data);

            if (error) {
                console.error('[handleSaveTeam] DB Error:', error);
                alert(`保存失敗 (エラーコード: ${error.code})\nメッセージ: ${error.message}\n詳細: ${error.details}`);
            } else if (!data || data.length === 0) {
                console.warn('[handleSaveTeam] No rows updated. RLS issue or wrong ID?');
                alert(`保存が反映されませんでした。 (status: ${status})\n※権限がないか、ID [${targetId}] のチームが見つかりません。`);
            } else {
                console.log('[handleSaveTeam] Success! Updated data:', data);
                alert('チーム情報を正常に更新しました');
                await fetchTeamDetails();
                if (parentId) {
                    await handleFirstChannelCreation(parentId, currentTeamId);
                }
            }
        } catch (err: any) {
            console.error('[handleSaveTeam] Exception:', err);
            alert('実行中に例外が発生しました: ' + err.message);
        }
    };

    // Helper to render changelog with basic markdown styling
    const renderChangelog = (text: string) => {
        return text.split('\n').map((line, index) => {
            // Headers (## )
            if (line.startsWith('## ')) {
                return (
                    <h4 key={index} style={{
                        margin: '20px 0 10px 0',
                        fontSize: '1rem',
                        color: 'var(--accent)',
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                        paddingBottom: '5px'
                    }}>
                        {line.replace('## ', '')}
                    </h4>
                );
            }
            // List items (- )
            if (line.trim().startsWith('- ')) {
                const content = line.trim().replace('- ', '');
                // Handle bold (**text**)
                const parts = content.split(/(\*\*.*?\*\*)/g);
                return (
                    <div key={index} style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-start',
                        marginBottom: '6px',
                        fontSize: '0.9rem',
                        lineHeight: '1.5',
                        color: 'var(--text-main)',
                        paddingLeft: '5px'
                    }}>
                        <span style={{ color: 'var(--accent)', flexShrink: 0 }}>✓</span>
                        <span>
                            {parts.map((part, i) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                    return <strong key={i} style={{ color: 'var(--text-main)' }}>{part.slice(2, -2)}</strong>;
                                }
                                return part;
                            })}
                        </span>
                    </div>
                );
            }
            // Normal text (ignore empty lines or just render them as spacers)
            if (!line.trim()) {
                return <div key={index} style={{ height: '8px' }}></div>;
            }
            return <div key={index} style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{line}</div>;
        });
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
                    <button
                        className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-outline'}`}
                        style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: 'none' }}
                        onClick={() => setActiveTab('history')}
                    >
                        更新履歴
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

                            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '10px 0' }} />

                            <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <svg width="18" height="18" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <rect width="11" height="11" fill="#F25022" />
                                        <rect x="12" width="11" height="11" fill="#7FBA00" />
                                        <rect y="12" width="11" height="11" fill="#00A4EF" />
                                        <rect x="12" y="12" width="11" height="11" fill="#FFB900" />
                                    </svg>
                                    Microsoft Graph (OneDrive) 連携
                                </h4>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
                                    ファイルを OneDrive にアップロードしたり、添付ファイルをダウンロードしたりするために必要です。
                                </p>

                                {msAccount ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '10px 15px', borderRadius: '8px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{msAccount.name || msAccount.username}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{msAccount.username}</div>
                                        </div>
                                        <button
                                            className="btn btn-sm"
                                            style={{ color: 'var(--danger)', background: 'rgba(196, 49, 75, 0.1)', border: '1px solid rgba(196, 49, 75, 0.2)' }}
                                            onClick={handleMsLogout}
                                            disabled={msLoading}
                                        >
                                            連携解除
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ textAlign: 'center', padding: '10px' }}>
                                        <button
                                            className="btn btn-primary"
                                            style={{ background: '#2F2F2F', color: 'white', border: '1px solid #444' }}
                                            onClick={handleMsLogin}
                                            disabled={msLoading}
                                        >
                                            {msLoading ? '接続中...' : 'Microsoft 連携を開始する'}
                                        </button>
                                    </div>
                                )}
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
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>投稿用メールアドレス</label>
                                        <input
                                            type="email"
                                            className="input-field"
                                            value={teamEmailAddress}
                                            onChange={(e) => setTeamEmailAddress(e.target.value)}
                                            placeholder="example@fts.co.jp"
                                            readOnly={!canManageTeam && !isAdmin}
                                        />
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

                            <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--accent)' }}>タグ管理</h4>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                    同じチーム内の全チャネルで共通のタグが使えます。タグにメンバーを追加すると、#タグ名 でメンション時に通知されます。
                                </p>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '15px' }}>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="新しいタグ名..."
                                        value={newTagName}
                                        onChange={(e) => setNewTagName(e.target.value)}
                                        onKeyDown={async (e) => {
                                            if (e.key === 'Enter' && newTagName.trim()) {
                                                try {
                                                    const effectiveTeamId = parentId || currentTeamId;
                                                    await addTag(newTagName.trim(), effectiveTeamId);
                                                    setNewTagName('');
                                                } catch (err: any) {
                                                    alert('タグの追加に失敗しました: ' + err.message);
                                                }
                                            }
                                        }}
                                        style={{ flex: 1 }}
                                    />
                                    <button
                                        className="btn btn-sm btn-primary"
                                        disabled={!newTagName.trim()}
                                        onClick={async () => {
                                            if (!newTagName.trim()) return;
                                            try {
                                                const effectiveTeamId = parentId || currentTeamId;
                                                await addTag(newTagName.trim(), effectiveTeamId);
                                                setNewTagName('');
                                            } catch (err: any) {
                                                alert('タグの追加に失敗しました: ' + err.message);
                                            }
                                        }}
                                    >追加</button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {(() => {
                                        const effectiveTeamId = parentId || currentTeamId;
                                        const teamTags = tags.filter(t => {
                                            if (!t.team_id) return false;
                                            return String(t.team_id) === String(effectiveTeamId);
                                        });
                                        if (teamTags.length === 0) {
                                            return <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>まだタグがありません</span>;
                                        }
                                        return teamTags.map(t => (
                                            <TagMemberEditor
                                                key={t.id}
                                                tagId={t.id}
                                                tagName={t.name}
                                                profiles={profiles}
                                                onDelete={async () => {
                                                    if (window.confirm(`タグ「#${t.name}」を削除しますか？`)) {
                                                        try {
                                                            await deleteTag(t.id);
                                                        } catch (err: any) {
                                                            alert('タグの削除に失敗しました: ' + err.message);
                                                        }
                                                    }
                                                }}
                                            />
                                        ));
                                    })()}
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

                                {/* User Registration Form */}
                                <div style={{ marginBottom: '20px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <h5 style={{ margin: '0 0 10px 0', fontSize: '0.85rem' }}>新規ユーザー登録 (ホワイトリストに追加)</h5>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <input
                                            type="email"
                                            className="input-field"
                                            placeholder="example@mail.com"
                                            value={newUserEmail}
                                            onChange={(e) => setNewUserEmail(e.target.value)}
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            className="btn btn-sm btn-primary"
                                            onClick={handleRegisterUser}
                                            disabled={isRegistering || !newUserEmail}
                                        >
                                            {isRegistering ? '登録中...' : 'ユーザー追加'}
                                        </button>
                                    </div>
                                    <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '5px' }}>
                                        ※ここで登録されたメールアドレスのみがログイン可能になります。
                                    </p>
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
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
                                            <input
                                                type="checkbox"
                                                id="is-active-checkbox"
                                                checked={editIsActive}
                                                onChange={(e) => setEditIsActive(e.target.checked)}
                                            />
                                            <label htmlFor="is-active-checkbox" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>ログインを許可する</label>
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
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>投稿用メールアドレス</label>
                                                        <input
                                                            type="email"
                                                            className="input-field"
                                                            value={mgmtEmailAddress}
                                                            onChange={(e) => setMgmtEmailAddress(e.target.value)}
                                                            placeholder="example@fts.co.jp"
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

                    {activeTab === 'history' && (
                        <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            {renderChangelog(CHANGELOG)}
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
};
