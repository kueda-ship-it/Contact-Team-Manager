import { useEffect, useState, useCallback, useRef } from 'react';
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
    waiting_by?: string | null;
    waiting_at?: string | null;
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

const VIEW_CACHE_MAX = 12;

// 検索ヒットの取得上限。号機のような数字は 1〜2 文字で数千件に当たるため、
// 新しい順にこの件数だけ引く(描画コストの上限を切る)。
const SEARCH_RESULT_LIMIT = 200;


// ---------------------------------------------------------------------------
// 参照系テーブル(profiles / teams / tags)の共有フェッチ。
// これらの hook は ThreadList / PostForm / RightSidebar / TeamsSidebar など
// 複数コンポーネントで個別に呼ばれており(useTeams は常時 5 インスタンス)、
// それぞれが 60 秒 polling + フォーカス refetch を持っている。素直に投げると
// 同じ select が毎分 10 本以上飛ぶ。直近 STALE_MS 以内は共有結果を返し、
// 同時に走ったものは 1 本に束ねる。
//
// 窓を 3 秒と短くしているのは意図的。狙いは「同時多発の重複」を潰すことで
// あって、キャッシュを効かせて鮮度を落とすことではない(マウント時・フォーカス時・
// 60秒 polling は各インスタンスでほぼ同時に発火する)。書き込み直後は
// invalidateShared() で明示的に捨てる。
// ---------------------------------------------------------------------------
const SHARED_STALE_MS = 3_000;
const sharedCache = new Map<string, { at: number; data: any }>();
const sharedInflight = new Map<string, Promise<any>>();

async function sharedFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const hit = sharedCache.get(key);
    if (hit && Date.now() - hit.at < SHARED_STALE_MS) return hit.data as T;

    const running = sharedInflight.get(key);
    if (running) return running as Promise<T>;

    const p = fetcher()
        .then(data => { sharedCache.set(key, { at: Date.now(), data }); return data; })
        .finally(() => { sharedInflight.delete(key); });
    sharedInflight.set(key, p);
    return p;
}

function invalidateShared(key: string) {
    sharedCache.delete(key);
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
    // 発行順を持つカウンタ。後から投げた fetch が先に返った古い fetch に
    // 上書きされる(= 検索が解ける)のを防ぐ。
    const fetchSeqRef = useRef(0);

    // チャネル(＋フィルタ/並び/検索語)単位の表示キャッシュ。
    // ★hook インスタンスごとに持つこと。モジュール共有にすると、同じ条件で
    //   件数だけ違う呼び出し(フィード=50件 / ダッシュボード=全件)が同じキーで
    //   ぶつかる。limit をキーに混ぜる案は、追加読み込みのたびにキャッシュが
    //   外れて一覧が一瞬消えるので採らない。
    const viewCacheRef = useRef(new Map<string, Thread[]>());
    const viewKeyRef = useRef('');

    const fetchThreads = useCallback(async (silent = false) => {
        const seq = ++fetchSeqRef.current;
        try {
            // 未完了/メンションは取りこぼしが出ないよう全件対象(0 = ページングで全件)。
            // 検索は上限付き: 「1」のような短い語は全体の 9 割 (2500件超) にヒットし、
            // replies 込みで全件引くと数秒〜十数秒フリーズして入力を受け付けなくなる。
            const isSearching = searchQuery.trim().length > 0;
            const effectiveLimit = isSearching
                ? SEARCH_RESULT_LIMIT
                : ((filter === 'pending' || filter === 'waiting' || filter === 'mentions') ? 0 : limit);

            console.log(`[useThreads] Fetching. Team: ${teamId}, Filter: ${filter}, Search: ${searchQuery}, Silent: ${silent}`);

            // Only show loading if we really have no data for the current team
            // ★team_id は uuid。Number(teamId) は必ず NaN になり、この判定は
            //   「常に別チーム」として成立していた（＝毎回ローディング表示）。文字列で比べる。
            const isDifferentTeam = threads.length > 0 && teamId !== null
                && String(threads[0].team_id) !== String(teamId);
            if (!silent && (threads.length === 0 || isDifferentTeam)) setLoading(true);
            setError(null);
            
            const isAdmin = profile?.role === 'Admin';
            const memberTeamIds = memberships.map(m => m.team_id);
            if ((teamId === null || teamId === '') && !isAdmin && memberTeamIds.length === 0) {
                setThreads([]);
                setLoading(false);
                return;
            }

            // ページごとに query builder を作り直す(builder は破壊的に更新されるため使い回せない)
            const buildQuery = () => {
                let q = supabase
                    .from('threads')
                    .select(`
                      *,
                      replies:replies(*),
                      reminders:thread_reminders(id, remind_at, reminder_sent)
                    `);

                if (isSearching) {
                    const term = `%${searchQuery.trim()}%`;
                    q = q.or(`title.ilike.${term},content.ilike.${term}`);
                }

                if (filter === 'pending') {
                    q = q.eq('status', 'pending');
                } else if (filter === 'waiting') {
                    q = q.eq('status', 'pending').eq('waiting_contact', true);
                } else if (filter === 'completed') {
                    q = q.eq('status', 'completed');
                } else if (filter === 'myposts') {
                    q = q.eq('user_id', user?.id);
                }

                if (teamId !== null && teamId !== '') {
                    q = q.eq('team_id', teamId);
                } else if (!isAdmin) {
                    q = q.in('team_id', memberTeamIds);
                }
                return q;
            };

            // Supabase(PostgREST) は 1 リクエスト最大 1000 行に切り詰めるため、
            // limit がそれを超える場合(0 以下 = 全件)は range() でページングして結合する。
            const PAGE_SIZE = 1000;
            const unlimited = effectiveLimit <= 0;
            let rows: any[] = [];
            for (let from = 0; unlimited || from < effectiveLimit; from += PAGE_SIZE) {
                const to = (unlimited ? from + PAGE_SIZE : Math.min(from + PAGE_SIZE, effectiveLimit)) - 1;
                const { data, error } = await buildQuery()
                    .order('created_at', { ascending: false })
                    .range(from, to);
                if (error) throw error;
                rows = rows.concat(data || []);
                if (!data || data.length < to - from + 1) break;
            }

            if (seq !== fetchSeqRef.current) return;   // 追い越された古いレスポンスは捨てる

            let result = rows;
            if (ascending) {
                result = [...result].reverse();
            }
            const cache = viewCacheRef.current;
            if (cache.size > VIEW_CACHE_MAX) cache.clear();
            cache.set(viewKeyRef.current, result as Thread[]);
            setThreads(result as Thread[]);
        } catch (error: any) {
            console.error('Error fetching threads:', error);
            if (seq === fetchSeqRef.current) setError(error);
        } finally {
            if (seq === fetchSeqRef.current) setLoading(false);
        }
    }, [teamId, profile?.id, memberships.length, limit, ascending, filter, searchQuery]);

    // チャネル切替を「待たせない」ための表示キャッシュ。
    // 一度見たチャネルは、往復(実測 約200ms。DB は 3ms で残りは日本〜シンガポール間の
    // 往復)を待たずに前回の内容を即座に出し、裏で silent に取り直して差し替える。
    // これが無いと、クリックしてから前のチャネルの内容が出たままになり
    // 「ワンテンポ遅れて切り替わる」ように見える。
    const viewKey = `${teamId ?? ''}|${filter}|${ascending}|${searchQuery.trim()}`;
    viewKeyRef.current = viewKey;

    useEffect(() => {
        const cached = viewCacheRef.current.get(viewKey);
        if (cached) {
            setThreads(cached);
            setLoading(false);
            fetchThreads(true);        // 表示は即座。更新は裏で
        } else {
            setThreads([]);            // 初見のチャネルは古い内容を残さない
            fetchThreads();
        }
        // viewKey は fetchThreads の依存の部分集合なので、依存は fetchThreads だけでよい
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchThreads]);

    // realtime のコールバックは ref 経由で最新を呼ぶ。fetchThreads を購読の依存に入れると、
    // 検索語・フィルタ・並び順を変えるたびにチャネルを張り直すことになる。
    const fetchRef = useRef(fetchThreads);
    fetchRef.current = fetchThreads;

    // memberships は updateLastRead（チャネル切替のたびに走る）で毎回新しい配列になる。
    // 参照をそのまま依存にすると、切替のたびに購読を張り直したうえ fetch がもう1本走る。
    // 中身（team_id の集合）が同じなら張り直さない。
    const membershipKey = memberships.map((m: any) => String(m.team_id)).join(',');

    useEffect(() => {
        // filter 用の team_id 集合を組み立てる。
        // - 単一チーム表示 (teamId 指定): その team のみ
        // - 全件表示 (teamId=null): Admin は購読しない (filter 不可で Egress 暴走 #33)、
        //   非 Admin は memberships で in filter
        const isAdmin = profile?.role === 'Admin';
        let filterIds: string[] = [];
        if (teamId !== null && teamId !== '') {
            filterIds = [String(teamId)];
        } else if (!isAdmin) {
            filterIds = membershipKey ? membershipKey.split(',') : [];
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
                fetchRef.current(true);
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
                fetchRef.current(true);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(threadsChannel);
            supabase.removeChannel(repliesChannel);
        };
    }, [teamId, profile?.role, membershipKey]);

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
            const data = await sharedFetch('teams', async () => {
                const { data, error } = await supabase
                    .from('teams')
                    .select('*')
                    .order('name', { ascending: true });
                if (error) throw error;
                return data || [];
            });

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
            const data = await sharedFetch('profiles', async () => {
                const { data, error } = await supabase
                    .from('profiles')
                    .select('*');
                if (error) throw error;
                return data || [];
            });

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
            const data = await sharedFetch('tags', async () => {
                const { data, error } = await supabase
                    .from('tags')
                    .select('*')
                    .order('name', { ascending: true });
                if (error) throw error;
                return data || [];
            });

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
        invalidateShared('tags');
        await fetchTags(true);
    }, [fetchTags]);

    const deleteTag = useCallback(async (tagId: string | number) => {
        const { error } = await supabase.from('tags').delete().eq('id', tagId);
        if (error) throw error;
        invalidateShared('tags');
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
    // チームごとの最終投稿時刻。last_read_at だけが動いたとき(= チャネルを開いた直後)は
    // これを使い回して再計算するだけにする。毎回 500 件引き直さない。
    const latestActivityRef = useRef<{ [teamId: string]: string }>({});
    const membershipsRef = useRef(memberships);
    membershipsRef.current = memberships;

    const membershipKey = memberships.map(m => String(m.team_id)).join(',');
    const lastReadKey = memberships.map(m => `${m.team_id}:${m.last_read_at || ''}`).join(',');

    const recompute = useCallback(() => {
        const latestActivity = latestActivityRef.current;
        const unread = new Set<string>();
        membershipsRef.current.forEach(m => {
            const tid = String(m.team_id);
            const lastRead = m.last_read_at || '1970-01-01T00:00:00Z';
            if (latestActivity[tid] && latestActivity[tid] > lastRead) {
                unread.add(tid);
            }
        });
        setUnreadTeams(unread);
    }, []);

    // 既読時刻が動いただけなら再取得せずその場で計算し直す
    useEffect(() => { recompute(); }, [lastReadKey, recompute]);

    useEffect(() => {
        if (!userId || !membershipKey) return;

        const memberTeamIds = membershipKey.split(',');

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
            latestActivityRef.current = latestActivity;
            recompute();
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
        // memberships の参照ではなく所属チームの集合で見る。updateLastRead のたびに
        // 購読を張り直して 500 件引き直すのを避ける（チャネル切替が遅くなる）。
    }, [userId, membershipKey, recompute]);

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


