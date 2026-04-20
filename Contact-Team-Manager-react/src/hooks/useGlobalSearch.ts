import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { useUserMemberships } from './useSupabase';

export interface SearchHit {
    threadId: string;
    teamId: number | string | null;
    teamName: string;
    threadTitle: string;
    snippet: string;
    matchedIn: 'title' | 'content' | 'reply';
    createdAt: string | null;
}

interface RawThreadRow {
    id: string;
    team_id: number | string | null;
    title: string | null;
    content: string | null;
    created_at: string | null;
}

interface RawReplyRow {
    id: string;
    thread_id: string;
    content: string | null;
    created_at: string | null;
    thread: { id: string; team_id: number | string | null; title: string | null } | null;
}

const DEBOUNCE_MS = 220;
const MAX_RESULTS = 30;
const MIN_QUERY_LEN = 2;

const stripHtml = (s: string | null | undefined): string => {
    if (!s) return '';
    let t = s.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(div|p|li)>/gi, ' ').replace(/<[^>]+>/g, '');
    try {
        if (typeof DOMParser !== 'undefined') {
            const doc = new DOMParser().parseFromString(t, 'text/html');
            t = doc.documentElement.textContent || t;
        }
    } catch { /* ignore */ }
    return t.replace(/\s+/g, ' ').trim();
};

// ヒット語の周辺 ~60 文字を抜き出すスニペッター。大文字小文字を無視。
const makeSnippet = (text: string, query: string, radius = 40): string => {
    const plain = stripHtml(text);
    if (!plain) return '';
    const idx = plain.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) return plain.slice(0, radius * 2);
    const start = Math.max(0, idx - radius);
    const end = Math.min(plain.length, idx + query.length + radius);
    return (start > 0 ? '…' : '') + plain.slice(start, end) + (end < plain.length ? '…' : '');
};

export function useGlobalSearch(query: string) {
    const { user, profile } = useAuth();
    const { memberships } = useUserMemberships(user?.id);
    const [hits, setHits] = useState<SearchHit[]>([]);
    const [loading, setLoading] = useState(false);
    const reqIdRef = useRef(0);

    useEffect(() => {
        const trimmed = query.trim();
        if (trimmed.length < MIN_QUERY_LEN) {
            setHits([]);
            setLoading(false);
            return;
        }
        if (!user) return;

        const myReq = ++reqIdRef.current;
        setLoading(true);

        const timer = setTimeout(async () => {
            try {
                const isAdmin = profile?.role === 'Admin';
                const memberTeamIds = memberships.map(m => String(m.team_id));

                // アクセス可能なチーム ID を取得（Admin は全チーム、それ以外はメンバー参加チーム）
                let accessibleTeamIds: (number | string)[] | null = null;
                if (!isAdmin) {
                    if (memberTeamIds.length === 0) {
                        if (reqIdRef.current === myReq) setHits([]);
                        return;
                    }
                    accessibleTeamIds = memberTeamIds;
                }

                // チームマスタを一回取得（結果に名前を埋めるため）
                const { data: teamsData } = await supabase
                    .from('teams')
                    .select('id, name');
                const teamNameMap = new Map<string, string>();
                (teamsData ?? []).forEach((t: { id: number | string; name: string }) => {
                    teamNameMap.set(String(t.id), t.name);
                });

                const term = `%${trimmed.replace(/[%_]/g, (c) => '\\' + c)}%`;

                // --- threads 検索 (title/content) ---
                let threadQuery = supabase
                    .from('threads')
                    .select('id, team_id, title, content, created_at')
                    .or(`title.ilike.${term},content.ilike.${term}`)
                    .order('created_at', { ascending: false })
                    .limit(MAX_RESULTS);
                if (accessibleTeamIds) {
                    threadQuery = threadQuery.in('team_id', accessibleTeamIds);
                }

                // --- replies 検索 (content) — 親スレッド情報を join ---
                let replyQuery = supabase
                    .from('replies')
                    .select('id, thread_id, content, created_at, thread:threads(id, team_id, title)')
                    .ilike('content', term)
                    .order('created_at', { ascending: false })
                    .limit(MAX_RESULTS);

                const [threadRes, replyRes] = await Promise.all([threadQuery, replyQuery]);

                if (reqIdRef.current !== myReq) return; // 新しいクエリに置き換えられた

                const threadRows = (threadRes.data || []) as RawThreadRow[];
                const replyRows = (replyRes.data || []) as unknown as RawReplyRow[];

                const collected = new Map<string, SearchHit>();

                for (const row of threadRows) {
                    if (collected.has(row.id)) continue;
                    const titleMatched = !!row.title && row.title.toLowerCase().includes(trimmed.toLowerCase());
                    const hit: SearchHit = {
                        threadId: row.id,
                        teamId: row.team_id,
                        teamName: teamNameMap.get(String(row.team_id)) || '',
                        threadTitle: stripHtml(row.title) || '(無題)',
                        snippet: titleMatched
                            ? stripHtml(row.content).slice(0, 80)
                            : makeSnippet(row.content || '', trimmed),
                        matchedIn: titleMatched ? 'title' : 'content',
                        createdAt: row.created_at,
                    };
                    collected.set(row.id, hit);
                }

                for (const row of replyRows) {
                    const parent = row.thread;
                    if (!parent) continue;
                    // メンバーシップフィルタ（replies は team_id を直接持たないため親チームで弾く）
                    if (accessibleTeamIds && !accessibleTeamIds.map(String).includes(String(parent.team_id))) continue;
                    if (collected.has(parent.id)) continue;
                    const hit: SearchHit = {
                        threadId: parent.id,
                        teamId: parent.team_id,
                        teamName: teamNameMap.get(String(parent.team_id)) || '',
                        threadTitle: stripHtml(parent.title) || '(無題)',
                        snippet: makeSnippet(row.content || '', trimmed),
                        matchedIn: 'reply',
                        createdAt: row.created_at,
                    };
                    collected.set(parent.id, hit);
                }

                // 作成日時降順で並べる
                const sorted = Array.from(collected.values()).sort((a, b) => {
                    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return tb - ta;
                }).slice(0, MAX_RESULTS);

                if (reqIdRef.current === myReq) {
                    setHits(sorted);
                }
            } catch (e) {
                console.error('[useGlobalSearch] error:', e);
                if (reqIdRef.current === myReq) setHits([]);
            } finally {
                if (reqIdRef.current === myReq) setLoading(false);
            }
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [query, user?.id, profile?.role, memberships.length]);

    return { hits, loading };
}
