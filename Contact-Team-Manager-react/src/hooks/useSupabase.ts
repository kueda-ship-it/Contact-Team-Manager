import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

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
}

export function useThreads(
    teamId: number | string | null,
    limit: number = 50,
    ascending: boolean = true,
    filter: 'all' | 'pending' | 'completed' | 'mentions' | 'myposts' = 'all',
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
            const effectiveLimit = (filter === 'pending' || filter === 'mentions' || isSearching) ? 2000 : limit;

            console.log(`[useThreads] Fetching. Filter: ${filter}, Search: ${searchQuery}, Limit: ${limit}, Effective: ${effectiveLimit}`);

            if (!silent) setLoading(true);

            let query = supabase
                .from('threads')
                .select(`
                  *,
                  replies:replies(*)
                `);

            // Apply search filter if present
            if (isSearching) {
                const term = `%${searchQuery.trim()}%`;
                // Search in title and content only (author is UUID, author_name does not exist on table)
                query = query.or(`title.ilike.${term},content.ilike.${term}`);
            }

            // Apply limit (applied after filters by PostgREST logic, but definition order in JS chain implies intent)
            // We want to sort by created_at DESC normally
            query = query.order('created_at', { ascending: false }).limit(effectiveLimit);

            // Server-side filtering for status
            if (filter === 'pending') {
                query = query.eq('status', 'pending');
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
    }, [teamId, profile, memberships, limit, ascending, filter, searchQuery]);

    useEffect(() => {
        fetchThreads();

        const threadsChannel = supabase
            .channel('public:threads')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'threads'
            }, () => {
                fetchThreads(true);
            })
            .subscribe();

        const repliesChannel = supabase
            .channel('public:replies')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'replies'
            }, () => {
                fetchThreads(true);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(threadsChannel);
            supabase.removeChannel(repliesChannel);
        };
    }, [fetchThreads]);

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

    useEffect(() => {
        fetchTeams();

        const subscription = supabase
            .channel('teams')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'teams',
            }, () => fetchTeams(true))
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [fetchTeams]);

    return { teams, loading };
}

export function useProfiles() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProfiles(silent = false) {
            try {
                if (!silent) setLoading(true);
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*');

                if (error) throw error;
                setProfiles(data || []);
            } catch (error) {
                console.error('Error fetching profiles:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchProfiles();

        // Subscribe to realtime changes
        const subscription = supabase
            .channel('profiles')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'profiles',
            }, () => fetchProfiles(true))
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    return { profiles, loading };
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

    useEffect(() => {
        fetchTags();

        // Subscribe to realtime changes
        const subscription = supabase
            .channel('tags')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tags',
            }, () => fetchTags(true))
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [fetchTags]);

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

    useEffect(() => {
        fetchAllTagMembers();

        const subscription = supabase
            .channel('all-tag-members')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tag_members',
            }, () => fetchAllTagMembers())
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [fetchAllTagMembers]);

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

    useEffect(() => {
        fetchReactions();

        const subscription = supabase
            .channel('public:reactions')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'reactions',
            }, () => {
                fetchReactions(true);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [fetchReactions]);

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
            setMembers(data || []);
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
        const { error } = await supabase
            .from('team_members')
            .update({ role })
            .eq('team_id', teamId)
            .eq('user_id', profileId);
        if (error) {
            console.error('[useTeamMembers] Update error:', error);
            throw error;
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
            setMemberships(data || []);
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
        // Set up real-time sub for threads to update unread status
        const channel = supabase
            .channel('unread-updates')
            .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'threads' }, () => {
                checkUnread();
            })
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


