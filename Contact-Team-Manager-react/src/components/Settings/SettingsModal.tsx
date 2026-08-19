import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useTeamMembers, useProfiles, useTeams, usePermissions, useUserMemberships, useTags } from '../../hooks/useSupabase';
import { CustomSelect } from '../common/CustomSelect';
import { msalInstance, signIn, signOut, initializeMsal, hasExternalAccessToken } from '../../lib/microsoftGraph';
import type { AccountInfo } from '@azure/msal-browser';
import { CHANGELOG } from '../../data/changelog';
import { TagMemberEditor } from './TagMemberEditor';
import { ImageCropModal } from '../common/ImageCropModal';
import { OutlookWatchSettings } from './OutlookWatchSettings';
import { NotificationSettings } from './NotificationSettings';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentTeamId: string | null;
    currentTeamName: string;
    initialTab?: 'profile' | 'team' | 'admin' | 'team-mgmt' | 'history' | 'outlook';
    /** 指定するとチーム管理タブが「このチームにチャネルを追加」状態で開く */
    createChannelParentId?: string | null;
}

type SettingsSection =
    | 'profile' | 'integrations' | 'notifications'
    | 'team-basic' | 'team-channels' | 'team-members' | 'team-tags'
    | 'admin-users' | 'admin-teams'
    | 'history';

const TAB_TO_SECTION: Record<string, SettingsSection> = {
    profile: 'profile',
    team: 'team-basic',
    admin: 'admin-users',
    'team-mgmt': 'admin-teams',
    history: 'history',
    outlook: 'integrations',
    notifications: 'notifications',
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentTeamId: currentTeamIdProp, currentTeamName: currentTeamNameProp, initialTab = 'profile', createChannelParentId = null }) => {
    const { user, profile } = useAuth();
    const { profiles } = useProfiles();
    const { teams } = useTeams();
    // 設定内で対象チームを切り替えられるようにする（親から渡された値を初期値にする）
    const [teamScopeId, setTeamScopeId] = useState<string | null>(currentTeamIdProp);
    useEffect(() => { setTeamScopeId(currentTeamIdProp); }, [currentTeamIdProp]);
    const currentTeamId = teamScopeId;
    const scopedTeam = teams.find(t => String(t.id) === String(currentTeamId));
    const currentTeamName = scopedTeam?.name || currentTeamNameProp;
    const { members, loading: membersLoading, addMember, updateMemberRole, removeMember } = useTeamMembers(currentTeamId);
    // チャネルの場合、追加できるのは親チームのメンバーだけ
    const parentTeamId = scopedTeam?.parent_id ? String(scopedTeam.parent_id) : null;
    const parentTeamName = parentTeamId ? (teams.find(t => String(t.id) === parentTeamId)?.name || '') : '';
    const { members: parentTeamMembers } = useTeamMembers(parentTeamId);
    const { memberships } = useUserMemberships(user?.id);
    const { tags, addTag, deleteTag } = useTags();

    console.log('[SettingsModal] Render. currentTeamId prop:', currentTeamId, 'type:', typeof currentTeamId);

    // Permission checks
    const { canEdit: canEditCurrentTeam, isAdmin: isGlobalAdmin } = usePermissions(currentTeamId);
    const [activeTab, setActiveTab] = useState<SettingsSection>(TAB_TO_SECTION[initialTab] || 'profile');
    const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
    const [newTagName, setNewTagName] = useState('');

    useEffect(() => {
        if (isOpen) {
            setActiveTab(TAB_TO_SECTION[initialTab] || 'profile');
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
    const [newDisplayName, setNewDisplayName] = useState('');
    const [newUserRole, setNewUserRole] = useState<'Admin' | 'Manager' | 'Member' | 'Viewer'>('Member');
    const [isRegistering, setIsRegistering] = useState(false);
    const [userSearchQuery, setUserSearchQuery] = useState('');
    const [adminRoleFilter, setAdminRoleFilter] = useState<'all' | 'Admin' | 'Manager' | 'Member' | 'Viewer' | 'inactive'>('all');

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

    // Image crop state
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const cropConfirmRef = React.useRef<(blob: Blob) => Promise<void>>(async () => {});
    // Guard: prevent overlay from closing right after file picker opens (macOS ghost mousedown)
    const filePickerActiveRef = React.useRef(false);

    const openCrop = (file: File, onConfirm: (blob: Blob) => Promise<void>) => {
        const url = URL.createObjectURL(file);
        cropConfirmRef.current = onConfirm;
        setCropImageSrc(url);
    };

    // Microsoft Graph Status
    const [msAccount, setMsAccount] = useState<AccountInfo | null>(null);
    const [msLoading, setMsLoading] = useState(false);
    const [hasExternalToken, setHasExternalToken] = useState(false);

    useEffect(() => {
        const checkMsAccount = async () => {
            await initializeMsal();
            setMsAccount(msalInstance.getActiveAccount());
            setHasExternalToken(hasExternalAccessToken());
        };
        if (isOpen) {
            checkMsAccount();
        }

        const handleExternalToken = () => {
            setHasExternalToken(true);
        };
        window.addEventListener('externalTokenUpdated', handleExternalToken);
        return () => window.removeEventListener('externalTokenUpdated', handleExternalToken);
    }, [isOpen]);

    const handleMsLogin = async () => {
        setMsLoading(true);
        try {
            // signIn calls initializeMsal internally and we also do it on mount.
            // Calling it again here might cause an extra async hop that triggers popup blockers.
            const account = await signIn();
            setMsAccount(account);
            if (account) alert("Microsoft 連携に成功しました。");
        } catch (err: any) {
            console.error("Login failed:", err);
            if (err.message && !err.message.includes("ポップアップ")) {
                alert("Microsoft 連携に失敗しました: " + err.message);
            } else if (err.message && err.message.includes("ポップアップ")) {
                alert(err.message); // Show the specific "blocked" message from microsoftGraph.ts
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

    // 表示中のチームが属する「トップ階層のチーム」= チャネルの追加先の既定値
    const rootTeamIdForCurrent = (() => {
        const t = teams.find(x => String(x.id) === String(currentTeamId));
        if (!t) return null;
        return String(t.parent_id || t.id);
    })();

    const startCreateTeam = () => {
        setActiveTab('admin-teams');
        setSelectedTeamId('new');
        setIsCreatingTeam(true);
        setMgmtTeamName('');
        setMgmtTeamIconUrl('');
        setMgmtEmailAddress('');
        setMgmtParentId(null);
    };

    const startCreateChannel = (parentTeamId?: string | null) => {
        const rootTeams = teams.filter(t => !t.parent_id);
        const parent = parentTeamId || rootTeamIdForCurrent || (rootTeams[0] ? String(rootTeams[0].id) : null);
        if (!parent) {
            alert('チャネルの追加先となるチームがありません。先に「新しいチームを作る」を実行してください。');
            return;
        }
        setActiveTab('admin-teams');
        setSelectedTeamId('new');
        setIsCreatingTeam(true);
        setMgmtTeamName('');
        setMgmtTeamIconUrl('');
        setMgmtEmailAddress('');
        setMgmtParentId(String(parent));
    };

    useEffect(() => {
        if (isOpen && createChannelParentId) {
            startCreateChannel(String(createChannelParentId));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, createChannelParentId]);

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
        if (!mgmtTeamName.trim()) {
            alert(mgmtParentId ? 'チャネル名を入力してください。' : 'チーム名を入力してください。');
            return;
        }
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
                
                // Automatically add the creator as Admin
                if (user && data) {
                    const { error: memberError } = await supabase
                        .from('team_members')
                        .insert({
                            team_id: data.id,
                            user_id: user.id,
                            role: 'Manager'
                        });
                    
                    if (memberError) {
                        console.error('[handleSaveMgmtTeam] Member Auto-Add Error:', memberError);
                    } else {
                        console.log('[handleSaveMgmtTeam] Member Auto-Add Success for user:', user.id);
                    }
                }

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
            // Check if user already exists
            const { data: existingProfile } = await supabase
                .from('profiles')
                .select('id, is_active')
                .eq('email', newUserEmail)
                .maybeSingle();

            if (existingProfile) {
                alert('このメールアドレスは既に登録されています。');
                setIsRegistering(false);
                return;
            }

            // profiles に直接インサート（仮IDを割り当て）
            // is_active: false = SSO初回ログイン時に true に自動更新される
            const { error } = await supabase.from('profiles').insert({
                id: crypto.randomUUID(),
                email: newUserEmail,
                display_name: newDisplayName || newUserEmail.split('@')[0],
                role: newUserRole,
                is_active: false
            });

            if (error) throw error;

            alert('ユーザーを追加しました。\nMicrosoft SSOでログインすると自動的にアカウントが有効化されます。');
            setNewUserEmail('');
            setNewDisplayName('');
            setNewUserRole('Member');
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

    // メンバー追加の候補。チャネルなら親チームに所属している人だけに絞る
    const memberCandidates = (parentTeamId
        ? profiles.filter(p => parentTeamMembers.some(pm => String(pm.user_id) === String(p.id)))
        : profiles
    ).filter(p => !members.some(m => String(m.user_id) === String(p.id)));

    // 設定の「対象」セレクタに出すチーム / チャネル（親チームの直下にそのチャネルを並べる）
    const scopeOptions = (() => {
        const visible = teams.filter(t => isAdmin || memberships.some(m => String(m.team_id) === String(t.id)) ||
            (t.parent_id ? memberships.some(m => String(m.team_id) === String(t.parent_id)) : false));
        const roots = visible.filter(t => !t.parent_id);
        const out: { value: string | number; label: React.ReactNode }[] = [];
        roots.forEach(r => {
            out.push({ value: r.id, label: r.name });
            visible
                .filter(c => String(c.parent_id || '') === String(r.id))
                .forEach(c => out.push({ value: c.id, label: <span className="opt-channel"># {c.name}</span> }));
        });
        visible
            .filter(t => t.parent_id && !roots.some(r => String(r.id) === String(t.parent_id)))
            .forEach(c => {
                const p = teams.find(x => String(x.id) === String(c.parent_id));
                out.push({ value: c.id, label: p ? `${p.name} ＞ # ${c.name}` : `# ${c.name}` });
            });
        return out;
    })();

    if (!isOpen) return null;

    return (
        <>
        <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px' }} onMouseDown={(e) => { if (filePickerActiveRef.current) return; if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal settings-modal" onMouseDown={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h2 style={{
                        margin: 0,
                        background: 'linear-gradient(135deg, var(--text-main) 0%, var(--accent) 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        fontSize: '1.3rem',
                        fontWeight: 800,
                        letterSpacing: '-0.02em'
                    }}>設定</h2>
                    <button
                        className="btn btn-sm btn-outline"
                        onClick={onClose}
                        style={{ width: '32px', height: '32px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}
                    >✕</button>
                </div>

                <div className="settings-body">
                    <nav className="settings-nav">
                        <div className="settings-nav-group">アカウント</div>
                        <button className={`settings-nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>プロフィール</button>
                        <button className={`settings-nav-item ${activeTab === 'integrations' ? 'active' : ''}`} onClick={() => setActiveTab('integrations')}>外部サービス連携</button>
                        <button className={`settings-nav-item ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>通知</button>

                        <div className="settings-nav-group">チーム</div>
                        <button className={`settings-nav-item ${activeTab === 'team-basic' ? 'active' : ''}`} onClick={() => setActiveTab('team-basic')}>基本情報</button>
                        <button className={`settings-nav-item ${activeTab === 'team-channels' ? 'active' : ''}`} onClick={() => setActiveTab('team-channels')}>チャネル</button>
                        <button className={`settings-nav-item ${activeTab === 'team-members' ? 'active' : ''}`} onClick={() => setActiveTab('team-members')}>メンバー</button>
                        <button className={`settings-nav-item ${activeTab === 'team-tags' ? 'active' : ''}`} onClick={() => setActiveTab('team-tags')}>タグ</button>

                        {(isAdmin || canManageTeam || profile?.role !== 'Viewer') && (
                            <>
                                <div className="settings-nav-group">管理</div>
                                {isAdmin && (
                                    <button className={`settings-nav-item ${activeTab === 'admin-users' ? 'active' : ''}`} onClick={() => setActiveTab('admin-users')}>ユーザー管理</button>
                                )}
                                <button className={`settings-nav-item ${activeTab === 'admin-teams' ? 'active' : ''}`} onClick={() => setActiveTab('admin-teams')}>チーム / チャネル作成</button>
                            </>
                        )}

                        <div className="settings-nav-group">その他</div>
                        <button className={`settings-nav-item ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>更新履歴</button>
                    </nav>

                    <div className="settings-content">
                    {activeTab.startsWith('team-') && (
                        <div className="settings-scope">
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>対象</span>
                            <CustomSelect
                                placeholder="チーム / チャネルを選択..."
                                options={scopeOptions}
                                value={currentTeamId || ''}
                                onChange={(val) => setTeamScopeId(val ? String(val) : null)}
                                style={{ height: '32px', width: '100%' }}
                            />
                        </div>
                    )}

                    {activeTab === 'notifications' && <NotificationSettings />}

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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                ) : (
                                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0, border: '1px dashed rgba(255,255,255,0.25)' }}></div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    className="input-field"
                                    style={{ paddingTop: '10px', flex: 1, minWidth: 0, margin: 0 }}
                                    onMouseDown={() => { filePickerActiveRef.current = true; setTimeout(() => { filePickerActiveRef.current = false; }, 2000); }}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file || !user) return;
                                        openCrop(file, async (blob) => {
                                            try {
                                                const fileName = `avatars/${user.id}-${Math.random()}.png`;
                                                const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, blob, { contentType: 'image/png' });
                                                if (uploadError) throw uploadError;
                                                const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
                                                setAvatarUrl(data.publicUrl);
                                            } catch (err: any) {
                                                alert('アップロード失敗: ' + err.message);
                                            }
                                        });
                                        e.target.value = '';
                                    }}
                                />
                                </div>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-primary" onClick={handleSaveProfile}>保存</button>
                            </div>

                        </div>
                    )}

                    {activeTab.startsWith('team-') && !currentTeamId && (
                        <div style={{ padding: '25px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                            <p style={{ margin: '0 0 8px 0', fontSize: '0.95rem' }}>チームが選択されていません</p>
                            <p style={{ margin: '0 0 18px 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                上の「対象」から設定したいチーム / チャネルを選んでください。
                            </p>
                            <button className="btn btn-sm btn-primary" onClick={() => setActiveTab('admin-teams')}>
                                チーム / チャネルを作る
                            </button>
                        </div>
                    )}

                    {activeTab === 'team-basic' && currentTeamId && (
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
                                                onMouseDown={() => { filePickerActiveRef.current = true; setTimeout(() => { filePickerActiveRef.current = false; }, 2000); }}
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file || !currentTeamId) return;
                                                    openCrop(file, async (blob) => {
                                                        try {
                                                            const fileName = `avatars/team-${currentTeamId}-${Math.random()}.png`;
                                                            const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, blob, { contentType: 'image/png' });
                                                            if (uploadError) throw uploadError;
                                                            const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
                                                            setTeamIconUrl(data.publicUrl);
                                                        } catch (err: any) {
                                                            alert('アップロード失敗: ' + err.message);
                                                        }
                                                    });
                                                    e.target.value = '';
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
                                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--accent)' }}>このチームの所属先</h4>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 15px 0', lineHeight: 1.6 }}>
                                    ここは<strong>「{teamName || currentTeamName}」自身</strong>の置き場所を変える欄です。<br />
                                    新しいチャネルを作りたいときは、下の「＋ このチームにチャネルを作る」から作成してください。
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>親チーム</label>
                                        <CustomSelect
                                            placeholder="親チームを選択..."
                                            options={[
                                                { value: '', label: 'なし（トップ階層のチーム）' },
                                                ...teams
                                                    .filter(t => String(t.id) !== String(currentTeamId) && !t.parent_id)
                                                    .map(t => ({ value: t.id, label: `${t.name} の中のチャネルにする` })),
                                            ]}
                                            value={parentId || ''}
                                            onChange={(val) => setParentId(val ? String(val) : null)}
                                            style={{ height: '36px' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        {/* Only show "Add Channel" if current team is NOT a channel itself */}
                                        {!parentId && (
                                            <button
                                                className="btn btn-sm"
                                                style={{ padding: '6px 12px', background: 'rgba(0,183,189,0.1)', color: 'var(--accent)', border: '1px solid rgba(0,183,189,0.2)' }}
                                                onClick={() => startCreateChannel(String(currentTeamId))}
                                            >
                                                ＋ このチームにチャネルを作る
                                            </button>
                                        )}
                                        <button className="btn btn-sm btn-primary" onClick={handleSaveTeam}>所属先を保存</button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    )}

                    {activeTab === 'team-members' && currentTeamId && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                            <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--accent)' }}>メンバー管理</h4>
                                <div style={{ marginBottom: '15px' }}>
                                    <CustomSelect
                                        placeholder={memberCandidates.length === 0 ? '追加できる人がいません' : 'メンバーを追加...'}
                                        options={[
                                            { value: '', label: 'メンバーを追加...' },
                                            ...memberCandidates.map(p => ({ value: p.id, label: p.display_name }))
                                        ]}
                                        value=""
                                        onChange={async (val: string | number) => {
                                            if (val) {
                                                await addMember(String(val));
                                            }
                                        }}
                                        style={{ height: '36px' }}
                                    />
                                    {parentTeamId && (
                                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.6 }}>
                                            ※チャネルには親チーム「{parentTeamName}」のメンバーだけを追加できます。
                                            {memberCandidates.length === 0 && '（親チームのメンバーは全員参加済みです）'}
                                            <br />まだ「{parentTeamName}」にいない人は、対象を「{parentTeamName}」に切り替えて先にチームへ追加してください。
                                        </p>
                                    )}
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

                            {/* チームを退出 */}
                            {(() => {
                                const isMemberOfTeam = members.some(m => m.user_id === user?.id);
                                if (!isMemberOfTeam) return null;
                                const managerCount = members.filter(m => m.role === 'Manager' || m.role === 'manager').length;
                                const isSoleManager = (members.find(m => m.user_id === user?.id)?.role ?? '').toLowerCase() === 'manager' && managerCount <= 1;
                                return (
                                    <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(196,49,75,0.05)', border: '1px solid rgba(196,49,75,0.15)' }}>
                                        <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--danger)' }}>退出</h4>
                                        {isSoleManager && (
                                            <p style={{ fontSize: '0.75rem', color: 'rgba(196,49,75,0.8)', marginBottom: '10px' }}>
                                                あなたはこのチームの唯一の管理者です。退出する前に他のメンバーを管理者に変更してください。
                                            </p>
                                        )}
                                        <button
                                            className="btn btn-sm"
                                            style={{ color: 'var(--danger)', background: 'rgba(196,49,75,0.1)', border: '1px solid rgba(196,49,75,0.3)' }}
                                            disabled={isSoleManager}
                                            onClick={async () => {
                                                if (!user?.id) return;
                                                if (!window.confirm(`「${currentTeamName}」を退出しますか？`)) return;
                                                try {
                                                    await removeMember(user.id);
                                                    onClose();
                                                } catch (err: any) {
                                                    alert('退出に失敗しました: ' + err.message);
                                                }
                                            }}
                                        >
                                            チームを退出
                                        </button>
                                    </div>
                                );
                            })()}

                        </div>
                    )}

                    {activeTab === 'team-tags' && currentTeamId && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
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

                        </div>
                    )}

                    {activeTab === 'team-channels' && currentTeamId && (() => {
                        const rootId = String(scopedTeam?.parent_id || currentTeamId);
                        const rootTeam = teams.find(t => String(t.id) === rootId);
                        const channels = teams.filter(t => String(t.parent_id || '') === rootId);
                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--accent)' }}>
                                        「{rootTeam?.name || currentTeamName}」のチャネル
                                    </h4>
                                    <p style={{ margin: '0 0 14px 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                        チャネルはチームの中の話題ごとの部屋です。投稿はチャネル単位に分かれます。
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                                        {channels.length === 0 ? (
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>まだチャネルがありません</span>
                                        ) : channels.map(c => (
                                            <div key={c.id} style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'minmax(0, 1fr) 64px',
                                                alignItems: 'center',
                                                gap: '10px',
                                                padding: '8px 10px',
                                                borderRadius: '8px',
                                                background: 'rgba(255,255,255,0.03)'
                                            }}>
                                                <span style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}># {c.name}</span>
                                                <button
                                                    className="btn btn-sm btn-outline"
                                                    style={{ height: '28px', boxSizing: 'border-box', padding: '0 10px', fontSize: '0.75rem' }}
                                                    onClick={() => {
                                                        setIsCreatingTeam(false);
                                                        setSelectedTeamId(String(c.id));
                                                        setActiveTab('admin-teams');
                                                    }}
                                                >編集</button>
                                            </div>
                                        ))}
                                    </div>
                                    {(isAdmin || canManageTeam) && (
                                        <button
                                            className="btn btn-sm btn-primary"
                                            style={{ height: '32px' }}
                                            onClick={() => startCreateChannel(rootId)}
                                        >＋ チャネルを追加</button>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {activeTab === 'admin-users' && isAdmin && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* --- User Management Header Stats --- */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                                {[
                                    { label: '全ユーザー', value: profiles.length, color: 'var(--text-main)', gradient: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)', border: 'rgba(255,255,255,0.1)', glow: 'rgba(255,255,255,0.05)', filter: 'all' as const },
                                    { label: '管理者', value: profiles.filter(p => p.role === 'Admin').length, color: '#FF6B6B', gradient: 'linear-gradient(135deg, rgba(255,107,107,0.1) 0%, rgba(255,107,107,0.04) 100%)', border: 'rgba(255,107,107,0.25)', glow: 'rgba(255,107,107,0.12)', filter: 'Admin' as const },
                                    { label: 'アクティブ', value: profiles.filter(p => p.is_active !== false).length, color: '#33cc33', gradient: 'linear-gradient(135deg, rgba(51,204,51,0.1) 0%, rgba(51,204,51,0.04) 100%)', border: 'rgba(51,204,51,0.25)', glow: 'rgba(51,204,51,0.12)', filter: 'all' as const },
                                    { label: '無効アカウント', value: profiles.filter(p => p.is_active === false).length, color: '#f59e0b', gradient: 'linear-gradient(135deg, rgba(245,158,11,0.1) 0%, rgba(245,158,11,0.04) 100%)', border: 'rgba(245,158,11,0.25)', glow: 'rgba(245,158,11,0.12)', filter: 'inactive' as const },
                                ].map(s => (
                                    <div
                                        key={s.label}
                                        onClick={() => setAdminRoleFilter(s.filter)}
                                        style={{
                                            padding: '14px 16px',
                                            background: s.gradient,
                                            backdropFilter: 'blur(12px)',
                                            WebkitBackdropFilter: 'blur(12px)',
                                            borderRadius: '14px',
                                            border: `1px solid ${s.border}`,
                                            boxShadow: `0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 20px ${s.glow}`,
                                            cursor: 'pointer',
                                            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                                        }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
                                    >
                                        <div style={{ fontSize: '0.68rem', color: s.color, opacity: 0.85, marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
                                        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color, lineHeight: 1, textShadow: `0 0 20px ${s.glow}` }}>{s.value}<span style={{ fontSize: '0.72rem', fontWeight: 400, marginLeft: '4px', opacity: 0.6 }}>名</span></div>
                                    </div>
                                ))}
                            </div>

                            {/* --- Add User Form --- */}
                            <div style={{ padding: '20px', background: 'linear-gradient(145deg, rgba(0,183,189,0.08) 0%, rgba(255,255,255,0.03) 100%)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderRadius: '16px', border: '1px solid rgba(0,183,189,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.07), 0 0 40px rgba(0,183,189,0.06)' }}>
                                <h4 style={{ margin: '0 0 15px 0', fontSize: '1rem', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)' }}></span>
                                    新規ユーザーを追加
                                </h4>
                                <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 200px' }}>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>メールアドレス</label>
                                        <input
                                            type="email"
                                            className="input-field"
                                            placeholder="example@fts.co.jp"
                                            value={newUserEmail}
                                            onChange={(e) => setNewUserEmail(e.target.value)}
                                            style={{ height: '38px', fontSize: '0.9rem', width: '100%' }}
                                        />
                                    </div>
                                    <div style={{ flex: '1 1 150px' }}>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>表示名 (任意)</label>
                                        <input
                                            type="text"
                                            className="input-field"
                                            placeholder="山田 太郎"
                                            value={newDisplayName}
                                            onChange={(e) => setNewDisplayName(e.target.value)}
                                            style={{ height: '38px', fontSize: '0.9rem', width: '100%' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>ロール</label>
                                        <CustomSelect
                                            options={[
                                                { value: 'Admin', label: '管理者' },
                                                { value: 'Manager', label: 'マネージャ' },
                                                { value: 'Member', label: 'メンバー' },
                                                { value: 'Viewer', label: '閲覧のみ' }
                                            ]}
                                            value={newUserRole}
                                            onChange={(val) => setNewUserRole(val as any)}
                                            style={{ height: '38px', fontSize: '0.85rem' }}
                                        />
                                    </div>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleRegisterUser}
                                        disabled={isRegistering || !newUserEmail}
                                        style={{ height: '38px', padding: '0 20px', fontWeight: 600 }}
                                    >
                                        {isRegistering ? '処理中...' : 'ユーザーを追加'}
                                    </button>
                                </div>
                                <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '10px', opacity: 0.7 }}>
                                    ※追加したユーザーは Microsoft SSO で初回ログイン時に自動的に有効化されます。
                                </p>
                            </div>

                            {/* --- Role Permissions Table --- */}
                            <div style={{ padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                <h4 style={{ margin: '0 0 14px 0', fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)' }}></span>
                                    ロール別権限一覧
                                </h4>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--text-muted)', fontWeight: 600, width: '40%' }}>機能</th>
                                                {(['Admin', 'Manager', 'Member', 'Viewer'] as const).map(r => (
                                                    <th key={r} style={{ textAlign: 'center', padding: '8px 12px', color: r === 'Admin' ? '#FF6B6B' : r === 'Manager' ? 'var(--accent)' : 'var(--text-muted)', fontWeight: 600 }}>{r}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[
                                                { label: 'ユーザー招待・ロール変更', admin: true, manager: false, member: false, viewer: false },
                                                { label: 'チーム作成（管理画面）', admin: true, manager: false, member: false, viewer: false },
                                                { label: 'チーム作成（サイドバー）', admin: true, manager: true, member: false, viewer: false },
                                                { label: 'チーム設定・メンバー管理', admin: true, manager: true, member: false, viewer: false },
                                                { label: '投稿・コメント', admin: true, manager: true, member: true, viewer: false },
                                                { label: '閲覧', admin: true, manager: true, member: true, viewer: true },
                                            ].map((row, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                                    <td style={{ padding: '8px 12px', color: 'var(--text-main)' }}>{row.label}</td>
                                                    {(['admin', 'manager', 'member', 'viewer'] as const).map(r => (
                                                        <td key={r} style={{ textAlign: 'center', padding: '8px 12px' }}>
                                                            {row[r]
                                                                ? <span style={{ color: '#33cc33', fontWeight: 700, fontSize: '1rem' }}>✓</span>
                                                                : <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.9rem' }}>—</span>}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* --- Search & Filter Bar --- */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.15) 100%)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', padding: '14px 16px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.09)', boxShadow: '0 4px 20px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        className="input-field"
                                        placeholder="名前 / メールで検索..."
                                        value={userSearchQuery}
                                        onChange={(e) => setUserSearchQuery(e.target.value)}
                                        style={{ flex: 1, height: '34px', fontSize: '0.85rem', background: 'rgba(255,255,255,0.04)' }}
                                    />
                                    {userSearchQuery && (
                                        <button onClick={() => setUserSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 6px', fontSize: '1rem' }}>✕</button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                    {(['all', 'Admin', 'Manager', 'Member', 'Viewer', 'inactive'] as const).map(f => (
                                        <button
                                            key={f}
                                            onClick={() => setAdminRoleFilter(f)}
                                            style={{
                                                padding: '3px 10px', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                                                background: adminRoleFilter === f ? 'var(--accent)' : 'rgba(255,255,255,0.06)',
                                                color: adminRoleFilter === f ? '#000' : 'var(--text-muted)',
                                                border: `1px solid ${adminRoleFilter === f ? 'var(--accent)' : 'rgba(255,255,255,0.08)'}`,
                                            }}
                                        >
                                            {f === 'all' ? 'すべて' : f === 'inactive' ? '無効' : f === 'Admin' ? '管理者' : f === 'Manager' ? 'マネージャー' : f === 'Member' ? 'メンバー' : '閲覧のみ'}
                                            <span style={{ marginLeft: '5px', opacity: 0.7 }}>
                                                {f === 'all' ? profiles.length :
                                                 f === 'inactive' ? profiles.filter(p => p.is_active === false).length :
                                                 profiles.filter(p => p.role === f).length}
                                            </span>
                                        </button>
                                    ))}
                                    {selectedUserIds.size > 0 && <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--accent)', fontWeight: 600 }}>{selectedUserIds.size} 名選択中</span>}
                                </div>
                                {selectedUserIds.size > 0 && (
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                        <CustomSelect
                                            options={[
                                                { value: 'Admin', label: 'システム管理者' },
                                                { value: 'Manager', label: 'マネージャー' },
                                                { value: 'Member', label: 'メンバー' },
                                                { value: 'Viewer', label: '閲覧のみ' }
                                            ]}
                                            value={bulkRole}
                                            onChange={(val) => setBulkRole(val as any)}
                                            style={{ height: '30px', width: '140px', fontSize: '0.8rem' }}
                                        />
                                        <button
                                            className="btn btn-sm btn-primary"
                                            onClick={handleBulkRoleUpdate}
                                            disabled={isBulkUpdating}
                                            style={{ height: '30px', padding: '0 14px', fontSize: '0.8rem' }}
                                        >
                                            {isBulkUpdating ? '変更中...' : `${selectedUserIds.size}名を一括変更`}
                                        </button>
                                        <button
                                            style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', cursor: 'pointer', height: '30px', padding: '0 10px', borderRadius: '6px', fontSize: '0.8rem' }}
                                            onClick={() => setSelectedUserIds(new Set())}
                                        >選択解除</button>
                                    </div>
                                )}
                            </div>

                            {/* --- User Card Grid --- */}
                            <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                                gap: '15px', 
                                maxHeight: '500px', 
                                overflowY: 'auto', 
                                padding: '4px',
                                scrollbarWidth: 'thin'
                            }}>
                                {profiles.filter(p => {
                                    if (userSearchQuery && !p.display_name?.toLowerCase().includes(userSearchQuery.toLowerCase()) && !p.email?.toLowerCase().includes(userSearchQuery.toLowerCase())) return false;
                                    if (adminRoleFilter === 'inactive') return p.is_active === false;
                                    if (adminRoleFilter !== 'all') return p.role === adminRoleFilter;
                                    return true;
                                }).map(p => (
                                    <div
                                        key={p.id}
                                        onClick={() => toggleUserSelection(p.id)}
                                        style={{
                                            position: 'relative',
                                            padding: '15px',
                                            borderRadius: '14px',
                                            background: selectedUserIds.has(p.id)
                                                ? 'linear-gradient(135deg, rgba(0,183,189,0.15) 0%, rgba(0,183,189,0.06) 100%)'
                                                : 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                                            backdropFilter: 'blur(10px)',
                                            WebkitBackdropFilter: 'blur(10px)',
                                            border: `1px solid ${selectedUserIds.has(p.id) ? 'rgba(0,183,189,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                            boxShadow: selectedUserIds.has(p.id)
                                                ? '0 4px 20px rgba(0,183,189,0.15), inset 0 1px 0 rgba(255,255,255,0.07)'
                                                : '0 2px 10px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
                                            cursor: 'pointer',
                                            transition: 'all 0.25s ease',
                                            display: 'flex',
                                            gap: '12px',
                                            alignItems: 'center'
                                        }}
                                        className="user-card-hover"
                                    >
                                        <div style={{ position: 'relative' }}>
                                            {p.avatar_url ? (
                                                <img 
                                                    src={p.avatar_url} 
                                                    alt="" 
                                                    style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.1)' }}
                                                />
                                            ) : (
                                                <div style={{ 
                                                    width: '48px', 
                                                    height: '48px', 
                                                    borderRadius: '10px', 
                                                    background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '1.2rem',
                                                    fontWeight: 'bold',
                                                    color: 'white',
                                                    textShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                                    border: '2px solid rgba(255,255,255,0.1)'
                                                }}>
                                                    {p.display_name?.charAt(0) || p.email.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            {selectedUserIds.has(p.id) && (
                                                <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '18px', height: '18px', background: 'var(--accent)', borderRadius: '50%', color: 'white', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 10px rgba(0,0,0,0.5)', zIndex: 2 }}>
                                                    ✓
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {p.display_name}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {p.email}
                                            </div>
                                            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    padding: '2px 8px',
                                                    borderRadius: '20px',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    background: 
                                                        p.role === 'Admin' ? 'rgba(255,107,107,0.15)' : 
                                                        p.role === 'Manager' ? 'rgba(77,150,255,0.15)' : 
                                                        'rgba(255,255,255,0.08)',
                                                    color: 
                                                        p.role === 'Admin' ? '#FF6B6B' : 
                                                        p.role === 'Manager' ? '#4D96FF' : 
                                                        'rgba(255,255,255,0.6)'
                                                }}>
                                                    {p.role === 'Admin' ? 'ADMIN' : p.role === 'Manager' ? 'MANAGER' : p.role === 'Viewer' ? 'VIEWER' : 'MEMBER'}
                                                </span>
                                                {!p.is_active && (
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--danger)', fontWeight: 600 }}>DISCONTINUED</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* --- Individual Edit Section --- */}
                            {selectedUserIds.size === 1 && (
                                <div style={{
                                    padding: '25px',
                                    background: 'linear-gradient(145deg, rgba(0,183,189,0.1) 0%, rgba(0,183,189,0.03) 100%)',
                                    backdropFilter: 'blur(20px)',
                                    WebkitBackdropFilter: 'blur(20px)',
                                    borderRadius: '18px',
                                    border: '1px solid rgba(0,183,189,0.3)',
                                    boxShadow: '0 12px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 60px rgba(0,183,189,0.08)',
                                    animation: 'slideUp 0.3s ease-out'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                        <h5 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>詳細編集: {editDisplayName}</h5>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {Array.from(selectedUserIds)[0]}</div>
                                    </div>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>表示名</label>
                                                <input
                                                    type="text"
                                                    className="input-field"
                                                    value={editDisplayName}
                                                    onChange={(e) => setEditDisplayName(e.target.value)}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>ロール (権限)</label>
                                                <CustomSelect
                                                    options={[
                                                        { value: 'Admin', label: 'システム管理者 (フルアクセス)' },
                                                        { value: 'Manager', label: 'マネージャー (チーム管理可)' },
                                                        { value: 'Member', label: 'メンバー (標準機能)' },
                                                        { value: 'Viewer', label: '閲覧のみ' }
                                                    ]}
                                                    value={editRole}
                                                    onChange={(val) => setEditRole(val as any)}
                                                    style={{ height: '42px' }}
                                                />
                                            </div>
                                        </div>
                                        
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', justifyContent: 'center' }}>
                                            <div>
                                                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>アイコン画像</label>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="input-field"
                                                    style={{ paddingTop: '8px' }}
                                                    onMouseDown={() => { filePickerActiveRef.current = true; setTimeout(() => { filePickerActiveRef.current = false; }, 2000); }}
                                                    onChange={(e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        const targetUserId = Array.from(selectedUserIds)[0];
                                                        openCrop(file, async (blob) => {
                                                            try {
                                                                const fileName = `avatars/${targetUserId}-${Math.random()}.png`;
                                                                const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, blob, { contentType: 'image/png' });
                                                                if (uploadError) throw uploadError;
                                                                const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
                                                                setEditAvatarUrl(data.publicUrl);
                                                            } catch (err: any) {
                                                                alert('アップロード失敗: ' + err.message);
                                                            }
                                                        });
                                                        e.target.value = '';
                                                    }}
                                                />
                                                {editAvatarUrl && (
                                                    <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <img src={editAvatarUrl} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent)' }} />
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{
                                                padding: '15px',
                                                background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(0,0,0,0.1) 100%)',
                                                backdropFilter: 'blur(8px)',
                                                WebkitBackdropFilter: 'blur(8px)',
                                                borderRadius: '12px',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                                boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '12px'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    id="is-active-checkbox"
                                                    checked={editIsActive}
                                                    onChange={(e) => setEditIsActive(e.target.checked)}
                                                    style={{ width: '18px', height: '18px' }}
                                                />
                                                <label htmlFor="is-active-checkbox" style={{ fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' }}>
                                                    アカウントを有効にする
                                                    <div style={{ fontSize: '0.7rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                                                        オフにするとログインできなくなります
                                                    </div>
                                                </label>
                                            </div>
                                            
                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                <button 
                                                    className="btn btn-outline" 
                                                    style={{ flex: 1, height: '42px' }}
                                                    onClick={() => setSelectedUserIds(new Set())}
                                                >キャンセル</button>
                                                <button 
                                                    className="btn btn-primary" 
                                                    style={{ flex: 1, height: '42px', fontWeight: 700 }}
                                                    onClick={handleAdminSaveUser}
                                                >変更を保存</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Spacing for dropdowns */}
                            <div style={{ height: '100px' }}></div>
                        </div>
                    )}

                    {activeTab === 'admin-teams' && (isAdmin || canManageTeam || profile?.role !== 'Viewer') && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {(isAdmin || canManageTeam) && (
                                <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(0,183,189,0.06)', border: '1px solid rgba(0,183,189,0.2)' }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--accent)' }}>新しく作る</h4>
                                    <p style={{ margin: '0 0 14px 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                        <strong>チーム</strong>＝一番上のくくり（例:「連絡」）。<br />
                                        <strong>チャネル</strong>＝チームの中の話題ごとの部屋（例:「連絡 &gt; # 一般」）。<br />
                                        チャネルは必ずどれか 1 つのチームの中に作ります。
                                    </p>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        <button
                                            className="btn btn-sm btn-outline"
                                            style={{ height: '32px' }}
                                            onClick={startCreateTeam}
                                        >
                                            ＋ 新しいチームを作る
                                        </button>
                                        <button
                                            className="btn btn-sm btn-primary"
                                            style={{ height: '32px' }}
                                            onClick={() => startCreateChannel()}
                                        >
                                            ＋ チャネルを追加する
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div style={{ padding: '15px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <h4 style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: 'var(--accent)' }}>チーム管理</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div>
                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>既存のチーム / チャネルを編集</label>
                                        <CustomSelect
                                            placeholder="チーム / チャネルを選択..."
                                            options={[
                                                { value: '', label: '選択してください...' },
                                                ...teams.filter(t => {
                                                    if (isAdmin) return true;
                                                    const isDirectManager = memberships.some(m => String(m.team_id) === String(t.id) && m.role === 'Manager');
                                                    if (isDirectManager) return true;
                                                    // Also show if manager of parent
                                                    if (t.parent_id) {
                                                        return memberships.some(m => String(m.team_id) === String(t.parent_id) && m.role === 'Manager');
                                                    }
                                                    return false;
                                                }).map(t => {
                                                    const parent = t.parent_id ? teams.find(p => String(p.id) === String(t.parent_id)) : null;
                                                    return { value: t.id, label: parent ? `${parent.name} ＞ # ${t.name}` : t.name };
                                                })
                                            ]}
                                            value={isCreatingTeam ? '' : selectedTeamId}
                                            onChange={(val) => {
                                                setSelectedTeamId(String(val));
                                                setIsCreatingTeam(false);
                                            }}
                                            style={{ height: '36px' }}
                                        />
                                    </div>

                                    {(selectedTeamId || isCreatingTeam) && (
                                        <>
                                            <div style={{ padding: '15px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <h5 style={{ margin: '0 0 12px 0', fontSize: '0.85rem' }}>
                                                    {isCreatingTeam
                                                        ? (mgmtParentId
                                                            ? `新規チャネル作成（${teams.find(t => String(t.id) === String(mgmtParentId))?.name || ''} の中）`
                                                            : '新規チーム作成')
                                                        : (mgmtParentId ? 'チャネル編集' : 'チーム編集')}
                                                </h5>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            {mgmtParentId ? 'チャネル名' : 'チーム名'}
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="input-field"
                                                            value={mgmtTeamName}
                                                            onChange={(e) => setMgmtTeamName(e.target.value)}
                                                            placeholder={mgmtParentId ? '例: 一般 / 障害連絡 ...' : 'チーム名を入力...'}
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
                                                                onMouseDown={() => { filePickerActiveRef.current = true; setTimeout(() => { filePickerActiveRef.current = false; }, 2000); }}
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (!file) return;
                                                                    openCrop(file, async (blob) => {
                                                                        try {
                                                                            const fileName = `avatars/mgmt-team-${Math.random()}.png`;
                                                                            const { error: uploadError } = await supabase.storage.from('uploads').upload(fileName, blob, { contentType: 'image/png' });
                                                                            if (uploadError) throw uploadError;
                                                                            const { data } = supabase.storage.from('uploads').getPublicUrl(fileName);
                                                                            setMgmtTeamIconUrl(data.publicUrl);
                                                                        } catch (err: any) {
                                                                            alert('アップロード失敗: ' + err.message);
                                                                        }
                                                                    });
                                                                    e.target.value = '';
                                                                }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                            所属するチーム{mgmtParentId ? '（この中のチャネルになります）' : '（未選択ならトップ階層のチーム）'}
                                                        </label>
                                                        <CustomSelect
                                                            options={[
                                                                { value: '', label: 'なし（トップ階層のチーム）' },
                                                                ...teams
                                                                    .filter(t => String(t.id) !== String(selectedTeamId) && !t.parent_id)
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
                                                                {isCreatingTeam ? (mgmtParentId ? 'チャネルを作成' : 'チームを作成') : '保存'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div style={{ padding: '20px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                            {renderChangelog(CHANGELOG)}
                        </div>
                    )}

                    {activeTab === 'integrations' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

                                {(msAccount || hasExternalToken) ? (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.2)', padding: '10px 15px', borderRadius: '8px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{msAccount?.name || msAccount?.username || profile?.display_name || profile?.email || '連携済み'}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{msAccount?.username || profile?.email}</div>
                                        </div>
                                        {msAccount && (
                                            <button
                                                className="btn btn-sm"
                                                style={{ color: 'var(--danger)', background: 'rgba(196, 49, 75, 0.1)', border: '1px solid rgba(196, 49, 75, 0.2)' }}
                                                onClick={handleMsLogout}
                                                disabled={msLoading}
                                            >
                                                連携解除
                                            </button>
                                        )}
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
                            <OutlookWatchSettings />
                        </div>
                    )}
                    </div>
                </div>
            </div>
        </div >

        {cropImageSrc && (
            <ImageCropModal
                imageSrc={cropImageSrc}
                onConfirm={async (blob) => {
                    const src = cropImageSrc;
                    setCropImageSrc(null);
                    URL.revokeObjectURL(src);
                    await cropConfirmRef.current(blob);
                }}
                onCancel={() => {
                    URL.revokeObjectURL(cropImageSrc);
                    setCropImageSrc(null);
                }}
            />
        )}
        </>
    );
};
