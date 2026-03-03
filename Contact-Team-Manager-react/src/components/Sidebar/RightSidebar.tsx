import React from 'react';
import { useProfiles, useTags, useTeams } from '../../hooks/useSupabase';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { highlightMentions, hasMention } from '../../utils/mentions';
import { getPlainTextForSidebar, formatDate } from '../../utils/text';
import { useMentions } from '../../hooks/useMentions';
import { MentionList } from '../common/MentionList';
import { PullToRefresh } from '../common/PullToRefresh';

interface RightSidebarProps {
    currentTeamId: number | string | null;
    threadsData: {
        threads: any[];
        loading: boolean;
        error: Error | null;
        refetch: (silent?: boolean) => void;
    };
    onThreadClick?: (threadId: string) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({ currentTeamId, threadsData, onThreadClick }) => {
    // We use main threadsData only for mentions and general structure, but for "Not Finished", 
    // we must fetch ALL pending tasks independently of the main feed's limit/filter.
    const { threads: mainThreads, loading: mainLoading, refetch: mainRefetch } = threadsData;

    // Independent state for pending items
    const [pendingThreads, setPendingThreads] = React.useState<any[]>([]);
    const [pendingLoading, setPendingLoading] = React.useState(true);

    const { profiles } = useProfiles();
    const { tags } = useTags();
    const { teams } = useTeams();
    const { user, profile: currentProfile } = useAuth();
    const quickReplyRefs = React.useRef<{ [key: string]: HTMLDivElement | null }>({});

    // Fetch all pending threads separately
    const fetchPendingThreads = React.useCallback(async (silent = false) => {
        if (!user) return;
        if (!silent) setPendingLoading(true);
        try {
            // Fetch pending threads regardless of limit (up to 2000 safe limit)
            // Filter by currentTeamId if selected, or all if not.
            let query = supabase
                .from('threads')
                .select(`
                    *,
                    replies:replies(*)
                `)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(2000);

            if (currentTeamId) {
                query = query.eq('team_id', currentTeamId);
            } else if (currentProfile?.role !== 'Admin') {
                // 所属チームがない（currentTeamIdがnull）かつ管理者でない場合
                // 全チームの未完了タスクを取得してしまうのを防ぐ
                setPendingThreads([]);
                setPendingLoading(false);
                return;
            }

            const { data, error } = await query;
            if (error) throw error;
            setPendingThreads(data || []);
        } catch (e) {
            console.error("Error fetching pending threads for sidebar:", e);
        } finally {
            setPendingLoading(false);
        }
    }, [currentTeamId, user, currentProfile]);

    // Initial fetch and on team change
    React.useEffect(() => {
        fetchPendingThreads();
    }, [fetchPendingThreads]);

    // Re-fetch when main threads update - use silent mode to avoid Loading flash
    React.useEffect(() => {
        fetchPendingThreads(true);
    }, [threadsData.threads, fetchPendingThreads]);

    const {
        isOpen,
        candidates,
        activeIndex,
        targetThreadId,
        mentionPosition,
        mentionCoords,
        handleInput,
        handleKeyDown,
        insertMention
    } = useMentions({ profiles, tags, currentTeamId, teams });

    if (mainLoading && pendingLoading) {
        return <aside className="side-panel"><div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading...</div></aside>;
    }

    const mentionOptions = {
        allProfiles: profiles,
        allTags: tags,
        currentProfile: currentProfile,
        currentUserEmail: user?.email || null
    };

    const handleToggleStatus = async (threadId: string) => {
        if (!user) return;
        // Find in pendingThreads or mainThreads
        const thread = pendingThreads.find(t => t.id === threadId) || mainThreads.find(t => t.id === threadId);
        if (!thread) return;

        const newStatus = thread.status === 'completed' ? 'pending' : 'completed';
        const payload: any = { status: newStatus };
        if (newStatus === 'completed') {
            payload.completed_by = user.id;
            payload.completed_at = new Date().toISOString();
        } else {
            payload.completed_by = null;
            payload.completed_at = null;
        }

        const { error } = await supabase.from('threads').update(payload).eq('id', threadId);
        if (error) {
            alert('更新に失敗しました: ' + error.message);
        } else {
            // Refetch both
            mainRefetch(true);
            fetchPendingThreads();
        }
    };

    const handleQuickReply = async (threadId: string) => {
        const inputEl = quickReplyRefs.current[threadId];
        if (!inputEl) return;
        const content = inputEl.innerHTML;
        const plainText = inputEl.innerText.trim();

        if (!plainText) return;
        if (!user) return;

        const authorName = currentProfile?.display_name || user.email || 'Unknown';

        const { error } = await supabase.from('replies').insert([{
            thread_id: threadId,
            content: content,
            author: authorName,
            user_id: user.id
        }]);

        if (error) {
            alert('返信に失敗しました: ' + error.message);
        } else {
            inputEl.innerHTML = '';
            mainRefetch(true); // Update main feed
            // fetchPendingThreads(); // Not strictly necessary unless we re-order by update?
        }
    };

    // Mentions still come from main threads as they are context-dependent?
    // Or should we fetch mentions separately too? 
    // User only complained about "Not Finished".
    // Mentions usually are relevant to "Unread" which is complex.
    // Let's stick to using mainThreads for Mentions for now, 
    // as fetching ALL mentions might be heavy.
    // But filters in main feed might hide mentions... 
    // For now, keep mentions as is.

    const mentionedThreads = mainThreads
        .filter(t => {
            if (t.status === 'completed') return false;
            return hasMention(t.content, currentProfile, user?.email || null) ||
                (t.replies || []).some((r: any) => hasMention(r.content, currentProfile, user?.email || null));
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    // .slice(0, 10); // Limit removed

    const scrollToThread = (threadId: string) => {
        if (onThreadClick) {
            onThreadClick(threadId);
        } else {
            // Fallback (though normally onThreadClick should be provided)
            const target = document.getElementById(`thread-${threadId}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                target.classList.add('highlight-thread');
                setTimeout(() => target.classList.remove('highlight-thread'), 2000);
            }
        }
    };

    return (
        <aside className="side-panel">
            <PullToRefresh onRefresh={async () => {
                mainRefetch(false);
                await fetchPendingThreads(false);
            }}>
                <div style={{ paddingBottom: '20px' }}>
                    <div className="side-panel-section">
                        <h3 className="side-panel-title">Not Finished</h3>
                        <div id="pending-sidebar-list">
                            {pendingThreads.length === 0 ? (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '10px' }}>未完了のタスクはありません</div>
                            ) : (
                                pendingThreads.map(t => (
                                    <div key={t.id} className="task-card mini-job-card" style={{ cursor: 'pointer', position: 'relative' }} onClick={() => scrollToThread(t.id)}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <div className="sidebar-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                {t.title}
                                            </div>
                                            <button
                                                className="btn btn-sm btn-status"
                                                onClick={(e) => { e.stopPropagation(); handleToggleStatus(t.id); }}
                                                title="完了にする"
                                                style={{ width: '28px', height: '28px', padding: 0, marginLeft: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', border: '1px solid rgba(255, 255, 255, 0.4)' }}
                                            >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                            </button>
                                        </div>
                                        <div
                                            className="task-content"
                                            dangerouslySetInnerHTML={{ __html: highlightMentions(getPlainTextForSidebar(t.content), mentionOptions) }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                            <span>by {t.author}</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {(() => {
                                                    const today = new Date();
                                                    today.setHours(0, 0, 0, 0);
                                                    const created = new Date(t.created_at);
                                                    created.setHours(0, 0, 0, 0);
                                                    // 日数差を計算。当日なら0。
                                                    const diffDays = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

                                                    // 当日=Day 1、翌日=Day 2...
                                                    const dayCount = diffDays + 1;

                                                    let color = 'var(--success)'; // Day 1~2: 緑
                                                    let blinkClass = '';
                                                    let icon = (
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                                            <polyline points="22 4 12 14.01 9 11.01" />
                                                        </svg>
                                                    ); // Default / Day 1~2 (Activity/Progress - Checkbox style)

                                                    if (dayCount >= 7) {
                                                        color = 'var(--danger)'; // Day 7~: 赤点滅
                                                        blinkClass = 'blink-alert';
                                                        icon = (
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                                                <line x1="12" y1="9" x2="12" y2="13" />
                                                                <line x1="12" y1="17" x2="12.01" y2="17" />
                                                            </svg>
                                                        );
                                                    }
                                                    else if (dayCount >= 5) {
                                                        color = 'var(--orange, #F59E0B)'; // Day 5~6: オレンジ
                                                        icon = (
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                                                <line x1="16" y1="2" x2="16" y2="6" />
                                                                <line x1="8" y1="2" x2="8" y2="6" />
                                                                <line x1="3" y1="10" x2="21" y2="10" />
                                                            </svg>
                                                        );
                                                    }
                                                    else if (dayCount >= 3) {
                                                        color = 'var(--warning, #EAB308)'; // Day 3~4: 黄色 (Fallback to explicit color just in case)
                                                        icon = (
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <circle cx="12" cy="12" r="10" />
                                                                <polyline points="12 6 12 12 16 14" />
                                                            </svg>
                                                        );
                                                    }

                                                    return (
                                                        <span className={blinkClass} style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: color, color: '#fff', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
                                                            <span>{icon}</span> Day {dayCount}
                                                        </span>
                                                    );
                                                })()}
                                                <span>{formatDate(t.created_at)}</span>
                                            </span>
                                        </div>

                                        {/* Quick Reply - Hidden by default, shown on hover/focus */}
                                        <div className="quick-reply-form hover-reveal" onClick={(e) => e.stopPropagation()}>
                                            <div style={{ position: 'relative', flex: 1 }}>
                                                <div
                                                    ref={(el) => { if (el) quickReplyRefs.current[t.id] = el; }}
                                                    contentEditable
                                                    className="quick-reply-input rich-editor"
                                                    style={{ minHeight: '32px', maxHeight: '80px', overflowY: 'auto', marginBottom: 0 }}
                                                    onInput={(e) => handleInput(e, t.id)}
                                                    onKeyDown={(e) => {
                                                        if (isOpen && targetThreadId === t.id) {
                                                            handleKeyDown(e, t.id, e.currentTarget);
                                                            if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
                                                                return;
                                                            }
                                                        }
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleQuickReply(t.id);
                                                        }
                                                    }}
                                                />
                                                {isOpen && targetThreadId === t.id && (
                                                    <MentionList
                                                        candidates={candidates}
                                                        activeIndex={activeIndex}
                                                        onSelect={(c) => {
                                                            const el = quickReplyRefs.current[t.id];
                                                            if (el) insertMention(c, el);
                                                        }}
                                                        style={{
                                                            top: mentionCoords.top + (mentionPosition === 'top' ? -5 : 5),
                                                            left: mentionCoords.left,
                                                            position: 'fixed',
                                                            transform: mentionPosition === 'top' ? 'translateY(-100%)' : 'none',
                                                            zIndex: 2000
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            <button
                                                className="btn-send-blue"
                                                onClick={() => handleQuickReply(t.id)}
                                                title="送信"
                                                style={{ width: '38px', padding: 0, flexShrink: 0 }}
                                            >
                                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="22" y1="2" x2="11" y2="13"></line>
                                                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="side-panel-section" style={{ minHeight: '200px' }}>
                        <h3 className="side-panel-title">Mentions</h3>
                        <div id="assigned-sidebar-list">
                            {mentionedThreads.length === 0 ? (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '10px' }}>メンションされた投稿はありません</div>
                            ) : (
                                mentionedThreads.map(t => (
                                    <div key={t.id} className="task-card" style={{ cursor: 'pointer' }} onClick={() => scrollToThread(t.id)}>
                                        <div className="sidebar-title">{t.title}</div>
                                        <div
                                            className="task-content"
                                            dangerouslySetInnerHTML={{ __html: highlightMentions(getPlainTextForSidebar(t.content), mentionOptions) }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                            <span>by {t.author}</span>
                                            <span>{formatDate(t.created_at)}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </PullToRefresh>
        </aside>
    );
};
