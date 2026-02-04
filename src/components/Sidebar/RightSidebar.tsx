import React from 'react';
import { useProfiles, useTags } from '../../hooks/useSupabase';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { highlightMentions, hasMention } from '../../utils/mentions';
import { getPlainTextForSidebar } from '../../utils/text';
import { useMentions } from '../../hooks/useMentions';
import { MentionList } from '../common/MentionList';

interface RightSidebarProps {
    currentTeamId: number | null;
    threadsData: {
        threads: any[];
        loading: boolean;
        error: Error | null;
        refetch: (silent?: boolean) => void;
    };
}

export const RightSidebar: React.FC<RightSidebarProps> = ({ currentTeamId, threadsData }) => {
    const { threads, loading, refetch } = threadsData;
    const { profiles } = useProfiles();
    const { tags } = useTags();
    const { user, profile: currentProfile } = useAuth();
    const quickReplyRefs = React.useRef<{ [key: string]: HTMLDivElement | null }>({});

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
    } = useMentions({ profiles, tags, currentTeamId });

    if (loading) {
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
        const thread = threads.find(t => t.id === threadId);
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
            refetch(true);
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
            refetch(true);
        }
    };

    const pendingThreads = threads
        .filter(t => t.status === 'pending')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);

    const mentionedThreads = threads
        .filter(t => {
            if (t.status === 'completed') return false;
            return hasMention(t.content, currentProfile, user?.email || null) ||
                (t.replies || []).some(r => hasMention(r.content, currentProfile, user?.email || null));
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 10);

    const scrollToThread = (threadId: string) => {
        const target = document.getElementById(`thread-${threadId}`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            target.classList.add('highlight-thread');
            setTimeout(() => target.classList.remove('highlight-thread'), 2000);
        }
    };

    return (
        <aside className="side-panel">
            <div className="side-panel-section">
                <h3 className="side-panel-title">Not Finished</h3>
                <div id="pending-sidebar-list">
                    {pendingThreads.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '10px' }}>未完了のタスクはありません</div>
                    ) : (
                        pendingThreads.map(t => (
                            <div key={t.id} className="task-card" style={{ cursor: 'pointer' }} onClick={() => scrollToThread(t.id)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div className="sidebar-title">{t.title}</div>
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
                                    <span>{new Date(t.created_at).toLocaleDateString()}</span>
                                </div>

                                <div className="quick-reply-form" onClick={(e) => e.stopPropagation()}>
                                    <div style={{ position: 'relative', width: '100%' }}>
                                        <div
                                            ref={(el) => { if (el) quickReplyRefs.current[t.id] = el; }}
                                            contentEditable
                                            className="quick-reply-input rich-editor"
                                            style={{ minHeight: '32px', maxHeight: '80px', overflowY: 'auto', color: 'white' }}
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
                                                    top: mentionPosition === 'top' ? mentionCoords.top - 205 : mentionCoords.top + 5,
                                                    left: mentionCoords.left,
                                                    position: 'fixed',
                                                    zIndex: 2000
                                                }}
                                            />
                                        )}
                                    </div>
                                    <button
                                        className="quick-reply-btn"
                                        onClick={() => handleQuickReply(t.id)}
                                        title="送信"
                                    >
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                                    <span>{new Date(t.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </aside>
    );
};
