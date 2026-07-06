import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import { useRefetchInterval } from './useRefetchInterval';
import { normalizeRole } from '../utils/role';

// Inlined types to bypass persistent module resolution issues
interface Profile {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
    role: 'Admin' | 'Manager' | 'Member' | 'Viewer';
    is_active: boolean;
    created_at: string;
    updated_at?: string;
}

interface Team {
    id: string;
    name: string;
    description?: string;
    icon?: string;
    avatar_url?: string;
    icon_color?: string;
    email_address?: string;
    created_at: string;
    order_index?: number;
    parent_id?: string | null;
}

interface TagData {
    id: string | number;
    name: string;
    color?: string;
    team_id?: number | string | null;
    created_at: string;
}

interface Attachment {
    name: string;
    url: string;
    type: string;
    size?: number;
}

interface Reply {
    id: string;
    thread_id: string;
    content: string;
    author: string;
    created_at: string;
    updated_at?: string;
    attachments?: Attachment[];
}

interface Reaction {
    id: string;
    target_id: string;
    target_type: 'thread' | 'reply';
    emoji: string;
    profile_id: string;
    created_at: string;
}

interface Thread {
    id: string;
    title: string;
    content: string;
    author: string;
    author_name: string;
    team_id: number;
    status: 'pending' | 'completed';
    waiting_contact?: boolean;
    is_pinned: boolean;
    completed_by?: string;
    completed_at?: string;
    created_at: string;
    updated_at: string;
    replies?: Reply[];
    reactions?: Reaction[];
    user_id: string;
    remind_at?: string | null;
    reminder_sent?: boolean;
    reminders?: { id: string; remind_at: string; reminder_sent: boolean }[];
}

export function useThreads(
    teamId: number | string | null,
    limit: number = 50,
    ascending: boolean = true,
    filter: 'all' | 'pending' | 'completed' | 'waiting' | 'mentions' | 'myposts' = 'all',
    searchQuery: string = ''
) {
    const { user, profile } = useAuth();
    const { memberships } = useUserMemberships(user?.id);
    const [threads, setThreads] = useState<Thread[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchThreads = useCallback(async (silent = false) => {
        try {
            // Override limit if filtering for pending or mentions OR SEARCHING to ensure good results
            const isSearching = searchQuery.trim().length > 0;
            const effectiveLimit = (filter === 'pending' || filter === 'waiting' || filter === 'mentions' || isSearching) ? 2000 : limit;

            console.log(`[useThreads] Fetching. Team: ${teamId}, Filter: ${filter}, Search: ${searchQuery}, Silent: ${silent}`);

            // Only show loading if we really have no data for the current team
            const isDifferentTeam = threads.length > 0 && teamId !== null && threads[0].team_id !== Number(teamId);
            if (!silent && (threads.length === 0 || isDifferentTeam)) setLoading(true);
            setError(null);
            
            // ... (rest of query construction) ...
            let query = supabase
                .from('threads')
                .select(`
                  *,
                  replies:replies(*),
                  reminders:thread_reminders(id, remind_at, reminder_sent)
                `);

            if (isSearching) {
                const term = `%${searchQuery.trim()}%`;
                query = query.or(`title.ilike.${term},content.ilike.${term}`);
            }

            query = query.order('created_at', { ascending: false }).limit(effectiveLimit);

            if (filter === 'pending') {
                query = query.eq('status', 'pending');
            } else if (filter === 'waiting') {
                query = query.eq('status', 'pending').eq('waiting_contact', true);
            } else if (filter === 'completed') {
                query = query.eq('status', 'completed');
            } else if (filter === 'myposts') {
                query = query.eq('user_id', user?.id);
            }

            const isAdmin = profile?.role === 'Admin';

            if (teamId !== null && teamId !== '') {
                query = query.eq('team_id', teamId);
            } else if (!isAdmin) {
                const memberTeamIds = memberships.map(m => m.team_id);
                if (memberTeamIds.length > 0) {
                    query = query.in('team_id', memberTeamIds);
                } else {
                    setThreads([]);
                    setLoading(false);
                    return;
                }
            }

            const { data, error } = await query;
            if (error) throw error;

            let result = data || [];
            if (ascending) {
                result = [...result].reverse();
            }
            setThreads(result as Thread[]);
        } catch (error: any) {
            console.error('Error fetching threads:', error);
            setError(error);
        } finally {
            setLoading(false);
        }
    }, [teamId, profile?.id, memberships.length, limit, ascending, filter, searchQuery]);

    useEffect(() => {
        fetchThreads();

        // filter 用の team_id 集合を組み立てる。
        // - 単一チーム表示 (teamId 指定): その team のみ
        // - 全件表示 (teamId=null): Admin は購読しない (filter 不可で Egress 暴走 #33)、
        //   非 Admin は memberships で in filter
        const isAdmin = profile?.role === 'Admin';
        let filterIds: string[] = [];
        if (teamId !== null && teamId !== '') {
            filterIds = [String(teamId)];
        } else if (!isAdmin) {
            filterIds = memberships.map(m => String(m.team_id));
        }
        if (filterIds.length === 0) return; // Admin 全件表示など → realtime 諦め

        const isSingle = filterIds.length === 1;
        const filterExpr = isSingle ? `team_id=eq.${filterIds[0]}` : `team_id=in.(${filterIds.join(',')})`;
        const channelSuffix = isSingle ? `team-${filterIds[0]}` : `teams-${filterIds.length}`;

        const threadsChannel = supabase
            .channel(`public:threads:${channelSuffix}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'threads',
                filter: filterExpr,
            }, () => {
                fetchThreads(true);
            })
            .subscribe();

        // replies.team_id はマイグレーション (#34) で追加した列。INSERT 前 trigger
        // (replies_set_team_id_trigger) で thread.team_id が自動 populate されるので、
        // クライアントは team_id を意識せず insert できる。Realtime もこれで絞れる。
        const repliesChannel = supabase
            .channel(`public:replies:${channelSuffix}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'replies',
                filter: filterExpr,
            }, () => {
                fetchThreads(true);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(threadsChannel);
            supabase.removeChannel(repliesChannel);
        };
    }, [fetchThreads, teamId, profile?.role, memberships]);

    // Admin の全件表示時は filter 不可 (memberships に無い team も見る)
    // で realtime 諦め → 60秒 polling で代替する。
    const isAdminAllTeamsView = profile?.role === 'Admin' && (teamId === null || teamId === '');
    const pollFetch = useCallback(() => { fetchThreads(true); }, [fetchThreads]);
    useRefetchInterval(pollFetch, 60_000, isAdminAllTeamsView);

    return { threads, loading, error, refetch: fetchThreads };
}

export function useTeams() {
    const { user, profile } = useAuth();
    const { memberships } = useUserMemberships(user?.id);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTeams = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const { data, error } = await supabase
                .from('teams')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;

            const isAdmin = profile?.role === 'Admin';
            if (isAdmin) {
                setTeams(data || []);
            } else {
                // Filter for non-admins: Only teams they belong to, or their children/parents
                const myTeamIds = new Set(memberships.map(m => String(m.team_id)));

                const filtered = (data || []).filter((t: Team) => {
                    const isMember = myTeamIds.has(String(t.id));
                    const isParentOfMember = (data || []).some((child: Team) =>
                        child.parent_id === t.id && myTeamIds.has(String(child.id))
                    );
                    return isMember || isParentOfMember;
                });

                setTeams(filtered);
            }
        } catch (error) {
            console.error('Error fetching teams:', error);
        } finally {
            setLoading(false);
        }
    }, [profile, memberships]);

    // teams テーブルの realtime 購読は撤去 (#33 Egress 事故対策)。
    // 他ユーザーが管理画面で作成/更新/削除した変更は、タブ復帰時の
    // refetch (useRefetchOnFocus) で反映する。
    useEffect(() => {
        fetchTeams();
    }, [fetchTeams]);
    useRefetchOnFocus(fetchTeams);
    useRefetchInterval(fetchTeams, 60_000);

    return { teams, loading };
}

export function useProfiles() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchProfiles = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const { data, error } = await supabase
                .from('profiles')
                .select('*');

            if (error) throw error;
            setProfiles((data || []).map((p: any) => ({ ...p, role: normalizeRole(p.role) })));
        } catch (error) {
            console.error('Error fetching profiles:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // profiles の realtime 購読は撤去 (#33 Egress 事故対策)。
    // 他ユーザーが管理画面で変更した内容は、タブ復帰時に refetch で反映する。
    useEffect(() => {
        fetchProfiles();
    }, [fetchProfiles]);
    useRefetchOnFocus(fetchProfiles);
    useRefetchInterval(fetchProfiles, 60_000);

    return { profiles, loading, refetch: fetchProfiles };
}

export function useTags() {
    const [tags, setTags] = useState<TagData[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchTags = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const { data, error } = await supabase
                .from('tags')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;
            setTags(data || []);
        } catch (error) {
            console.error('Error fetching tags:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // tags の realtime 購読は撤去 (#33 Egress 事故対策)。
    // 他ユーザーの追加/削除はタブ復帰時 refetch + 60秒 polling で反映する。
    useEffect(() => {
        fetchTags();
    }, [fetchTags]);
    useRefetchOnFocus(fetchTags);
    useRefetchInterval(fetchTags, 60_000);

    const addTag = useCallback(async (name: string, teamId?: string | number | null, color?: string) => {
        const insertData: any = { name };
        if (teamId) insertData.team_id = teamId;
        if (color) insertData.color = color;
        const { error } = await supabase.from('tags').insert(insertData);
        if (error) throw error;
        await fetchTags(true);
    }, [fetchTags]);

    const deleteTag = useCallback(async (tagId: string | number) => {
        const { error } = await supabase.from('tags').delete().eq('id', tagId);
        if (error) throw error;
        await fetchTags(true);
    }, [fetchTags]);

    return { tags, loading, addTag, deleteTag, refetch: fetchTags };
}

export function useTagMembers(tagId: string | number | null) {
    const [tagMembers, setTagMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchTagMembers = useCallback(async (silent = false) => {
        if (!tagId) {
            setTagMembers([]);
            return;
        }
        if (!silent) setLoading(true);
        try {
            const { data, error } = await supabase
                .from('tag_members')
                .select(`
                    *,
                    profile:profiles(*)
                `)
                .eq('tag_id', tagId);

            if (error) throw error;
            setTagMembers(data || []);
        } catch (error) {
            console.error('Error fetching tag members:', error);
        } finally {
            setLoading(false);
        }
    }, [tagId]);

    useEffect(() => {
        fetchTagMembers();

        if (!tagId) return;

        const subscription = supabase
            .channel(`tag-members-${tagId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tag_members',
                filter: `tag_id=eq.${tagId}`
            }, () => fetchTagMembers(true))
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [fetchTagMembers, tagId]);

    const addTagMember = useCallback(async (profileId: string) => {
        if (!tagId) return;
        const { error } = await supabase
            .from('tag_members')
            .insert({ tag_id: tagId, profile_id: profileId });
        if (error) throw error;
        await fetchTagMembers(true);
    }, [tagId, fetchTagMembers]);

    const removeTagMember = useCallback(async (profileId: string) => {
        if (!tagId) return;
        const { error } = await supabase
            .from('tag_members')
            .delete()
            .eq('tag_id', tagId)
            .eq('profile_id', profileId);
        if (error) throw error;
        await fetchTagMembers(true);
    }, [tagId, fetchTagMembers]);

    return { tagMembers, loading, addTagMember, removeTagMember, refetch: fetchTagMembers };
}

// Also export a utility to get all tag members for multiple tags at once
export function useAllTagMembers() {
    const [allTagMembers, setAllTagMembers] = useState<any[]>([]);

    const fetchAllTagMembers = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('tag_members')
                .select('tag_id, profile_id');

            if (error) throw error;
            setAllTagMembers(data || []);
        } catch (error) {
            console.error('Error fetching all tag members:', error);
        }
    }, []);

    // all-tag-members の realtime 購読は撤去 (#33 Egress 事故対策)。
    // tag_members 全件購読は filter 不可で Egress を焼くため不可。
    // タブ復帰時 refetch + 60秒 polling で反映する。
    useEffect(() => {
        fetchAllTagMembers();
    }, [fetchAllTagMembers]);
    useRefetchOnFocus(fetchAllTagMembers);
    useRefetchInterval(fetchAllTagMembers, 60_000);

    // Helper: get user IDs for a given tag name
    const getUserIdsForTag = useCallback((tagId: string | number): string[] => {
        return allTagMembers
            .filter(tm => String(tm.tag_id) === String(tagId))
            .map(tm => tm.profile_id);
    }, [allTagMembers]);

    return { allTagMembers, getUserIdsForTag, refetch: fetchAllTagMembers };
}

// Reaction type
interface Reaction {
    id: string;
    emoji: string;
    thread_id?: string;
    reply_id?: string;
    profile_id: string;
    created_at: string;
}

export function useReactions() {
    const [reactions, setReactions] = useState<Reaction[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchReactions = useCallback(async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const { data, error } = await supabase
                .from('reactions')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) throw error;
            setReactions(data || []);
        } catch (error) {
            console.error('Error fetching reactions:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // reactions の realtime 購読は撤去 (#33 Egress 事故対策)。
    // reactions テーブルは team_id を持たず filter 不可。
    // タブ復帰時 refetch + 120秒 polling で反映する。
    // payload が大きくなりがちなので polling 間隔は他より長め。
    useEffect(() => {
        fetchReactions();
    }, [fetchReactions]);
    useRefetchOnFocus(fetchReactions);
    useRefetchInterval(fetchReactions, 120_000);

    return { reactions, loading, refetch: fetchReactions };
}

export function useTeamMembers(teamId: number | string | null) {
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchMembers = useCallback(async () => {
        if (!teamId) {
            setMembers([]);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('team_members')
                .select(`
                    *,
                    profile:profiles(*)
                `)
                .eq('team_id', teamId);

            if (error) throw error;
            // Normalize both team_members.role and joined profile.role.
            setMembers((data || []).map((m: any) => ({
                ...m,
                role: normalizeRole(m.role),
                profile: m.profile ? { ...m.profile, role: normalizeRole(m.profile.role) } : m.profile,
            })));
        } catch (error) {
            console.error('Error fetching team members:', error);
        } finally {
            setLoading(false);
        }
    }, [teamId]);

    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    const addMember = async (profileId: string, role = 'Member') => {
        if (!teamId) return;
        const { error } = await supabase
            .from('team_members')
            .insert([{ team_id: teamId, user_id: profileId, role }]);
        if (error) throw error;
        await fetchMembers();
    };

    const updateMemberRole = async (profileId: string, role: string) => {
        if (!teamId) return;
        console.log(`[useTeamMembers] Updating role: team=${teamId}, profile=${profileId}, role=${role}`);
        const { data: updated, error } = await supabase
            .from('team_members')
            .update({ role })
            .eq('team_id', teamId)
            .eq('user_id', profileId)
            .select();
        if (error) {
            console.error('[useTeamMembers] Update error:', error);
            throw error;
        }
        if (!updated || updated.length === 0) {
            throw new Error('更新権限がないか、対象レコードが見つかりません');
        }
        await fetchMembers();
    };

    const removeMember = async (profileId: string) => {
        if (!teamId) return;
        console.log(`[useTeamMembers] Removing member: team=${teamId}, profile=${profileId}`);
        const { error } = await supabase
            .from('team_members')
            .delete()
            .eq('team_id', teamId)
            .eq('user_id', profileId);
        if (error) {
            console.error('[useTeamMembers] Remove error:', error);
            throw error;
        }
        await fetchMembers();
    };

    return { members, loading, addMember, updateMemberRole, removeMember, refetch: fetchMembers };
}

export function useUserMemberships(userId: string | undefined) {
    const [memberships, setMemberships] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchMemberships = useCallback(async () => {
        if (!userId) {
            setMemberships([]);
            return;
        }
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('team_members')
                .select('*')
                .eq('user_id', userId);

            if (error) throw error;
            // Normalize role casing — team_members.role has mixed casing
            // ('Manager', 'Member', 'member') and downstream === 'Manager' checks
            // would otherwise miss the lowercase rows. See src/utils/role.ts.
            setMemberships((data || []).map((m: any) => ({ ...m, role: normalizeRole(m.role) })));
        } catch (error) {
            console.error('Error fetching user memberships:', error);
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        fetchMemberships();
    }, [fetchMemberships]);

    const updateLastRead = async (teamId: string) => {
        if (!userId) return;
        try {
            const { error } = await supabase
                .from('team_members')
                .update({ last_read_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('team_id', teamId);
            if (error) throw error;
            // Optimistic update
            setMemberships(prev => prev.map(m =>
                m.team_id === teamId ? { ...m, last_read_at: new Date().toISOString() } : m
            ));
        } catch (error) {
            console.error('Error updating last read at:', error);
        }
    };

    return { memberships, loading, refetch: fetchMemberships, updateLastRead };
}

export function usePopularTeamId(userId: string | undefined) {
    const [popularTeamId, setPopularTeamId] = useState<string | number | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        const fetchPopularTeam = async () => {
            setLoading(true);
            try {
                // Fetch distribution of posts by this user per team
                const { data, error } = await supabase
                    .from('threads')
                    .select('team_id')
                    .eq('user_id', userId);

                if (error) throw error;

                if (data && data.length > 0) {
                    const counts: { [id: string]: number } = {};
                    data.forEach(t => {
                        const tid = String(t.team_id);
                        counts[tid] = (counts[tid] || 0) + 1;
                    });

                    // Sort by count descending
                    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                    setPopularTeamId(sorted[0][0]);
                }
            } catch (err) {
                console.error('Error fetching popular team:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchPopularTeam();
    }, [userId]);

    return { popularTeamId, loading };
}

export function useUnreadCounts(userId: string | undefined, memberships: any[]) {
    const [unreadTeams, setUnreadTeams] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!userId || memberships.length === 0) return;

        const memberTeamIds = memberships.map(m => m.team_id);

        const checkUnread = async () => {
            // Fetch only threads belonging to user's teams, selecting minimal fields
            const { data, error } = await supabase
                .from('threads')
                .select('team_id, created_at')
                .in('team_id', memberTeamIds)
                .order('created_at', { ascending: false })
                .limit(500);

            if (error) {
                console.error('Error fetching unread status:', error);
                return;
            }

            const latestActivity: { [teamId: string]: string } = {};
            data.forEach(t => {
                const tid = String(t.team_id);
                if (!latestActivity[tid] || t.created_at > latestActivity[tid]) {
                    latestActivity[tid] = t.created_at;
                }
            });

            const unread = new Set<string>();
            memberships.forEach(m => {
                const tid = String(m.team_id);
                const lastRead = m.last_read_at || '1970-01-01T00:00:00Z';
                if (latestActivity[tid] && latestActivity[tid] > lastRead) {
                    unread.add(tid);
                }
            });
            setUnreadTeams(unread);
        };

        checkUnread();

        // 自分が所属しているチームの threads INSERT のみ購読する。
        // 過去 filter なし全件購読で Egress を焼いた事故 (#33) があったため、
        // 必ず team_id=in.(...) で絞ること。
        const filterIds = memberTeamIds.join(',');
        const channel = supabase
            .channel(`unread-updates:${userId}`)
            .on(
                'postgres_changes' as any,
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'threads',
                    filter: `team_id=in.(${filterIds})`,
                },
                () => {
                    checkUnread();
                },
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, memberships]);

    return { unreadTeams };
}

export function usePermissions(teamId: string | number | null) {
    const { profile } = useAuth();
    const { memberships } = useUserMemberships(profile?.id);

    const getEffectiveRole = useCallback(() => {
        if (!profile) return 'Viewer';
        if (profile.role === 'Admin') return 'Admin';

        if (!teamId) return profile.role;

        const membership = memberships.find(m => String(m.team_id) === String(teamId));
        if (membership) {
            // Priority: Admin > Manager > Member > Viewer
            const roles = ['Viewer', 'Member', 'Manager', 'Admin'];
            const globalIdx = roles.indexOf(profile.role);
            const teamIdx = roles.indexOf(membership.role);
            return roles[Math.max(globalIdx, teamIdx)] as Profile['role'];
        }

        return profile.role;
    }, [profile, teamId, memberships]);

    const role = getEffectiveRole();
    const canEdit = role === 'Admin' || role === 'Manager';
    const isAdmin = role === 'Admin';
    const isManager = role === 'Manager';

    return { role, canEdit, isAdmin, isManager };
}


export function useEquipmentSearch(machineNumber: string) {
    const [equipment, setEquipment] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!machineNumber || machineNumber.length < 3) {
            setEquipment(null);
            return;
        }

        const search = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('Equipment')
                    .select('*')
                    .eq('号機', machineNumber)
                    .maybeSingle();

                if (error) {
                    console.error('Equipment search error:', error);
                    setEquipment(null);
                } else if (data) {
                    setEquipment(data);
                } else {
                    setEquipment(null);
                }
            } catch (err) {
                console.error('Equipment search exception:', err);
                setEquipment(null);
            } finally {
                setLoading(false);
            }
        };

        const timer = setTimeout(search, 300);
        return () => clearTimeout(timer);
    }, [machineNumber]);

    return { equipment, loading };
}


