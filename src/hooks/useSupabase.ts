import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Inlined types to bypass persistent module resolution issues
interface Profile {
    id: string;
    email: string;
    display_name: string;
    avatar_url?: string;
    role: 'Admin' | 'Manager' | 'Member' | 'Viewer';
    created_at: string;
    updated_at?: string;
}

interface Team {
    id: number;
    name: string;
    description?: string;
    icon?: string;
    avatar_url?: string;
    icon_color?: string;
    created_at: string;
    order_index?: number;
}

interface TagData {
    id: number;
    name: string;
    color?: string;
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
}

export function useThreads(teamId: number | string | null) {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const fetchThreads = useCallback(async (silent = false) => {
        try {
            console.log('[useThreads] Fetching with teamId:', teamId);
            if (!silent) setLoading(true);
            let query = supabase
                .from('threads')
                .select(`
          *,
          replies:replies(*)
        `)
                .order('created_at', { ascending: true });

            if (teamId !== null && teamId !== '') {
                console.log('[useThreads] Applying filter for team_id:', teamId);
                // Supabase supports both number and string (UUID) equality
                query = query.eq('team_id', teamId);
            } else {
                console.log('[useThreads] Fetching all teams (teamId is null or empty)');
            }

            const { data, error: fetchError } = await query;
            if (fetchError) throw fetchError;
            console.log('[useThreads] Received threads count:', data?.length || 0);
            setThreads(data || []);
        } catch (err) {
            setError(err as Error);
            console.error('Error fetching threads:', err);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [teamId]);

    useEffect(() => {
        fetchThreads();

        // Use simple, stable channel names like legacy app.js
        const threadsChannel = supabase.channel('public:threads')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'threads' }, (payload) => {
                console.log('[useThreads] Realtime threads change:', payload);
                fetchThreads(true);
            })
            .subscribe();

        const repliesChannel = supabase.channel('public:replies')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'replies' }, (payload) => {
                console.log('[useThreads] Realtime replies change:', payload);
                fetchThreads(true);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(threadsChannel);
            supabase.removeChannel(repliesChannel);
        };
    }, [fetchThreads]); // fetchThreads changes with teamId, correctly resetting subscription if needed.

    return { threads, loading, error, refetch: fetchThreads };
}

export function useTeams() {
    const [teams, setTeams] = useState<Team[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchTeams() {
            try {
                const { data, error } = await supabase
                    .from('teams')
                    .select('*')
                    .order('name', { ascending: true });

                if (error) throw error;
                console.log('Fetched teams:', data);
                setTeams(data || []);
            } catch (error) {
                console.error('Error fetching teams (Details):', error);
            } finally {
                setLoading(false);
            }
        }

        fetchTeams();

        // Subscribe to realtime changes
        const subscription = supabase
            .channel('teams')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'teams',
            }, fetchTeams)
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    return { teams, loading };
}

export function useProfiles() {
    const [profiles, setProfiles] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProfiles() {
            try {
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
            }, fetchProfiles)
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

    useEffect(() => {
        async function fetchTags() {
            try {
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
        }

        fetchTags();

        // Subscribe to realtime changes
        const subscription = supabase
            .channel('tags')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tags',
            }, fetchTags)
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    return { tags, loading };
}

// Reaction type
interface Reaction {
    id: string;
    emoji: string;
    thread_id?: string;
    reply_id?: string;
    user_id: string;
    created_at: string;
}

export function useReactions() {
    const [reactions, setReactions] = useState<Reaction[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchReactions = useCallback(async () => {
        try {
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
                fetchReactions();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, [fetchReactions]);

    return { reactions, loading, refetch: fetchReactions };
}
