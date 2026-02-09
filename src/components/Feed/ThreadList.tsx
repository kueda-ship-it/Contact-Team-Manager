import React from 'react';
import { useTeams, useProfiles, useTags, useReactions } from '../../hooks/useSupabase';
import { useAuth } from '../../hooks/useAuth';
import { useOneDriveUpload } from '../../hooks/useOneDriveUpload';
import { Attachment } from '../../hooks/useFileUpload';
import { supabase } from '../../lib/supabase';
import { formatDate } from '../../utils/text';
import { highlightMentions, hasMention } from '../../utils/mentions';
import { ReactionBar } from '../ReactionBar';
import { useMentions } from '../../hooks/useMentions';
import { MentionList } from '../common/MentionList';
import { CustomSelect } from '../common/CustomSelect';
import { msalInstance } from '../../lib/microsoftGraph';

interface ThreadListProps {
    currentTeamId: number | string | null;
    threadsData: {
        threads: any[];
        loading: boolean;
        error: Error | null;
        refetch: (silent?: boolean) => void;
    };
    statusFilter: 'all' | 'pending' | 'completed' | 'mentions';
    onStatusChange: (status: 'all' | 'pending' | 'completed' | 'mentions') => void;
}

export const ThreadList: React.FC<ThreadListProps> = ({ currentTeamId, threadsData, statusFilter, onStatusChange }) => {
    const { threads, loading, error, refetch } = threadsData;
    const { teams } = useTeams();
    const { profiles } = useProfiles();
    const { tags } = useTags();
    const { reactions, refetch: refetchReactions } = useReactions();
    const { user, profile: currentProfile } = useAuth();
    const [editingThreadId, setEditingThreadId] = React.useState<string | null>(null);
    const [editingReplyId, setEditingReplyId] = React.useState<string | null>(null);
    const editRefs = React.useRef<{ [key: string]: HTMLDivElement | null }>({});
    const fileInputRefs = React.useRef<{ [key: string]: HTMLInputElement | null }>({});

    // Track multiple file uploads for different reply forms
    // Using a simple object to manage attachments per reply form
    const [replyAttachments, setReplyAttachments] = React.useState<{ [key: string]: Attachment[] }>({});
    const [replyUploading, setReplyUploading] = React.useState<{ [key: string]: boolean }>({});

    const { uploadFile, downloadFileFromOneDrive, isAuthenticated, login } = useOneDriveUpload(); // Use OneDrive instead of Supabase

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

    // Auto-scroll to bottom of thread list on load/update
    const threadListRef = React.useRef<HTMLDivElement>(null);
    const replyRefs = React.useRef<{ [key: string]: HTMLDivElement | null }>({});
    React.useEffect(() => {
        if (threadListRef.current) {
            threadListRef.current.scrollTop = threadListRef.current.scrollHeight;
        }
    }, [threads.length, currentTeamId]);

    if (loading) {
        return <div style={{ padding: '20px', textAlign: 'center' }}>Loading threads...</div>;
    }

    if (error) {
        return <div style={{ padding: '20px', color: 'var(--danger)' }}>Error: {error.message}</div>;
    }

    const currentTeamName = currentTeamId
        ? teams.find(t => t.id === currentTeamId)?.name || 'Team'
        : 'All Teams';

    const mentionOptions = {
        allProfiles: profiles,
        allTags: tags,
        currentProfile: currentProfile,
        currentUserEmail: user?.email || null
    };

    const getProfile = (name: string, id?: string) => {
        if (id) return profiles.find(p => p.id === id);
        return profiles.find(p => p.display_name === name || p.email === name);
    };

    const handleToggleStatus = async (threadId: string, currentStatus: string) => {
        if (!user) return;
        const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
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

    const handleDeleteThread = async (threadId: string) => {
        if (!window.confirm('この投稿を削除しますか？')) return;
        const { error } = await supabase.from('threads').delete().eq('id', threadId);
        if (error) {
            alert('削除に失敗しました: ' + error.message);
        } else {
            refetch(true);
        }
    };

    const handleAddReply = async (threadId: string) => {
        const inputEl = replyRefs.current[threadId];
        if (!inputEl) return;
        const content = inputEl.innerHTML;
        const plainText = inputEl.innerText.trim();

        if (!plainText) return;
        if (!user) return;
        if (replyUploading[threadId]) return;

        const authorName = currentProfile?.display_name || user.email || 'Unknown';
        const atts = replyAttachments[threadId] || [];

        const { error } = await supabase.from('replies').insert([{
            thread_id: threadId,
            content: content,
            author: authorName,
            user_id: user.id,
            attachments: atts.length > 0 ? atts : null
        }]);

        if (error) {
            alert('返信に失敗しました: ' + error.message);
        } else {
            inputEl.innerHTML = '';
            setReplyAttachments(prev => ({ ...prev, [threadId]: [] }));
            refetch(true);
        }
    };

    const handleReplyFileChange = async (threadId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0 || !user) return;

        setReplyUploading(prev => ({ ...prev, [threadId]: true }));
        try {
            const newAtts: Attachment[] = [];
            for (const file of files) {
                const uploaded = await uploadFile(file);
                if (uploaded) newAtts.push(uploaded);
            }
            setReplyAttachments(prev => ({
                ...prev,
                [threadId]: [...(prev[threadId] || []), ...newAtts]
            }));
        } finally {
            setReplyUploading(prev => ({ ...prev, [threadId]: false }));
            if (e.target) e.target.value = '';
        }
    };

    const handleReplyAttachClick = async (threadId: string) => {
        // useOneDriveUpload hook now provides isAuthenticated state
        // detailed logic: 
        // 1. If authenticated, OPEN FILE PICKER IMMEDIATELY (sync)
        // 2. If not, show confirm -> login -> alert

        if (isAuthenticated) {
            const fileInput = document.querySelector(`input[data-reply-thread="${threadId}"]`) as HTMLInputElement;
            fileInput?.click();
        } else {
            const shouldLogin = window.confirm(
                "ファイルを添付するには Microsoft アカウントでのサインインが必要です。\n" +
                "今すぐサインインしますか？\n\n" +
                "(設定画面からもサインインできます)"
            );

            if (shouldLogin) {
                const account = await login();
                if (account) {
                    alert("サインインしました。もう一度添付ボタンを押してください。");
                }
            }
        }
    };

    const removeReplyAttachment = (threadId: string, index: number) => {
        setReplyAttachments(prev => ({
            ...prev,
            [threadId]: (prev[threadId] || []).filter((_, i) => i !== index)
        }));
    };

    const handleDeleteReply = async (replyId: string) => {
        if (!window.confirm('この返信を削除しますか？')) return;
        const { error } = await supabase.from('replies').delete().eq('id', replyId);
        if (error) {
            alert('削除に失敗しました: ' + error.message);
        } else {
            refetch(true);
        }
    };

    const handleUpdateThread = async (threadId: string) => {
        const el = editRefs.current[threadId];
        if (!el) {
            console.error("Edit ref not found for thread:", threadId);
            return;
        }
        const content = el.innerHTML;
        console.log("Updating thread:", threadId, "Content length:", content.length);

        const { data, error } = await supabase.from('threads').update({ content: content }).eq('id', threadId).select();

        if (error) {
            console.error("Update failed:", error);
            alert('更新に失敗しました: ' + error.message);
        } else {
            console.log("Update success:", data);
            setEditingThreadId(null);
            refetch(true);
        }
    };

    const handleUpdateReply = async (replyId: string) => {
        const el = editRefs.current[replyId];
        if (!el) return;
        const content = el.innerHTML;

        const { error } = await supabase.from('replies').update({ content: content }).eq('id', replyId);
        if (error) {
            alert('更新に失敗しました: ' + error.message);
        } else {
            setEditingReplyId(null);
            refetch(true);
        }
    };

    const handleAddReaction = async (emoji: string, threadId?: string, replyId?: string) => {
        if (!user) return;

        const payload: any = {
            emoji,
            profile_id: user.id
        };

        if (threadId) payload.thread_id = threadId;
        if (replyId) payload.reply_id = replyId;

        const { error } = await supabase.from('reactions').insert([payload]);
        if (error) {
            console.error('リアクション追加エラー:', error);
            alert(`リアクション追加に失敗しました: ${error.message}`);
        } else {
            refetchReactions();
        }
    };

    const handleRemoveReaction = async (reactionId: string) => {
        const { error } = await supabase.from('reactions').delete().eq('id', reactionId);
        if (error) {
            console.error('リアクション削除エラー:', error);
        } else {
            refetchReactions();
        }
    };

    const renderAttachments = (attachments: any[] | null) => {
        if (!attachments || attachments.length === 0) return null;
        return (
            <div className="attachment-display" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                {attachments.map((att: any, idx: number) => {
                    const isOneDrive = att.storageProvider === 'onedrive' || att.id;
                    return (
                        <div key={idx} className="attachment-group" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                            <div className="attachment-wrapper" style={{ position: 'relative' }}>
                                <div onClick={() => window.open(att.url, '_blank')} style={{ cursor: 'pointer' }}>
                                    {att.type?.startsWith('image/') ? (
                                        <img src={att.thumbnailUrl || att.url} alt={att.name} className="attachment-thumb-large" style={{ maxWidth: '200px', maxHeight: '150px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                                    ) : (
                                        <div className="file-link" style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '1.2rem' }}>📄</span>
                                            <span style={{ fontSize: '0.85rem' }}>{att.name}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {isOneDrive && att.id && (
                                <button
                                    className="btn-download-orange"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        downloadFileFromOneDrive(att.id, att.name!);
                                    }}
                                    title="ダウンロード"
                                    style={{
                                        marginTop: '4px',
                                        height: '32px',
                                        width: '32px',
                                        padding: 0
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <div className="feed-list" ref={threadListRef} style={{ overflowY: 'auto', height: '100%' }}>
            <div className="feed-header-sticky">
                <div className="feed-header-left">
                    <CustomSelect
                        options={[
                            { value: 'all', label: 'すべて表示' },
                            { value: 'pending', label: '未完了' },
                            { value: 'completed', label: '完了済み' },
                            { value: 'mentions', label: '自分宛て' }
                        ]}
                        value={statusFilter}
                        onChange={(val: string | number) => onStatusChange(val as any)}
                        style={{
                            width: '140px',
                            background: 'transparent',
                            border: 'none',
                        }}
                    />
                </div>
                <div className="feed-header-center">
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                        {currentTeamName}
                        <span style={{ color: 'var(--primary-light)', fontSize: '0.9rem', fontWeight: 'normal' }}>{threads.length} 件</span>
                    </h2>
                </div>
                <div className="feed-header-right">
                    <button className="btn-sort-toggle">降順</button>
                </div>
            </div>

            {threads
                .filter(thread => {
                    if (statusFilter === 'pending') return thread.status === 'pending';
                    if (statusFilter === 'completed') return thread.status === 'completed';
                    if (statusFilter === 'mentions') {
                        return hasMention(thread.content, currentProfile, user?.email || null) ||
                            (thread.replies || []).some((r: any) => hasMention(r.content, currentProfile, user?.email || null));
                    }
                    return true;
                })
                .length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    表示する投稿がありません。
                </div>
            ) : (
                threads
                    .filter(thread => {
                        if (statusFilter === 'pending') return thread.status === 'pending';
                        if (statusFilter === 'completed') return thread.status === 'completed';
                        if (statusFilter === 'mentions') {
                            return hasMention(thread.content, currentProfile, user?.email || null) ||
                                (thread.replies || []).some((r: any) => hasMention(r.content, currentProfile, user?.email || null));
                        }
                        return true;
                    })
                    .map(thread => {
                        const authorProfile = getProfile(thread.author);
                        const authorAvatar = authorProfile?.avatar_url;

                        const completerProfile = thread.completed_by ? profiles.find(p => p.id === thread.completed_by) : null;
                        const completerName = completerProfile?.display_name || completerProfile?.email || 'Unknown';

                        return (
                            <div
                                key={thread.id}
                                id={`thread-${thread.id}`}
                                className={`task-card ${thread.is_pinned ? 'is-pinned' : ''} ${thread.status === 'completed' ? 'is-completed' : ''}`}
                                style={{ position: 'relative', paddingBottom: '50px' }}
                            >
                                {thread.is_pinned && <div className="pinned-badge">重要</div>}
                                {currentTeamId === null && (
                                    <div className="team-badge">
                                        {teams.find(t => t.id === thread.team_id)?.name || 'Unknown'}
                                    </div>
                                )}

                                <div className="dot-menu-container">
                                    <div className="dot-menu-trigger">⋮</div>
                                    <div className="dot-menu">
                                        {(user?.id === thread.user_id || ['Admin', 'Manager'].includes(currentProfile?.role || '')) && (
                                            <>
                                                {user?.id === thread.user_id && (
                                                    <div className="menu-item" onClick={() => {
                                                        setEditingThreadId(thread.id);
                                                        // useTimeout to wait for render then focus? 
                                                        // handled by simple autofocus or effect?
                                                        // We can rely on user clicking or just standard flow.
                                                    }}>
                                                        <span className="menu-icon">✏️</span> 編集
                                                    </div>
                                                )}
                                                <div className="menu-item menu-item-delete" onClick={() => handleDeleteThread(thread.id)}>
                                                    <span className="menu-icon">🗑️</span> 削除
                                                </div>
                                                {['Admin'].includes(currentProfile?.role || '') && (
                                                    <div className="menu-item move-team-item">
                                                        <span className="menu-icon">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                                            </svg>
                                                        </span> チーム移動
                                                        <div className="submenu">
                                                            {teams.filter(t => t.id !== thread.team_id).map(t => (
                                                                <div key={t.id} className="menu-item" onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    if (window.confirm(`この投稿を「${t.name}」へ移動しますか？`)) {
                                                                        const { error } = await supabase.from('threads').update({ team_id: t.id }).eq('id', thread.id);
                                                                        if (error) alert('移動に失敗しました: ' + error.message);
                                                                        else refetch(true);
                                                                    }
                                                                }}>
                                                                    {t.name}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="task-header-meta">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                        <div className="avatar-container">
                                            <div className="avatar">
                                                {authorAvatar ? (
                                                    <img src={authorAvatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                                ) : (
                                                    (thread.author && thread.author[0].toUpperCase())
                                                )}
                                            </div>
                                            <div className="status-dot active"></div>
                                        </div>
                                        <div className="task-author-info">
                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                                <span className="author-name">{thread.author}</span>
                                                <span className="thread-date" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                    {formatDate(thread.created_at)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="task-title-line" id={`title-${thread.id}`}>{thread.title}</div>
                                {editingThreadId === thread.id ? (
                                    <div className="edit-form" style={{ marginBottom: '10px' }}>
                                        <div
                                            ref={(el) => {
                                                if (el) {
                                                    editRefs.current[thread.id] = el;
                                                    // Initialize content only once if empty
                                                    if (!el.innerHTML && thread.content) {
                                                        el.innerHTML = thread.content;
                                                    }
                                                }
                                            }}
                                            contentEditable
                                            className="input-field rich-editor"
                                            style={{ minHeight: '80px', marginBottom: '8px', color: 'var(--text-main)' }}
                                            onInput={(e) => handleInput(e, thread.id)}
                                            onKeyDown={(e) => {
                                                if (isOpen && targetThreadId === thread.id) {
                                                    handleKeyDown(e, thread.id, e.currentTarget);
                                                }
                                            }}
                                        />
                                        {isOpen && targetThreadId === thread.id && (
                                            <MentionList
                                                candidates={candidates}
                                                activeIndex={activeIndex}
                                                onSelect={(c) => {
                                                    const el = editRefs.current[thread.id];
                                                    if (el) insertMention(c, el);
                                                }}
                                                style={{
                                                    top: mentionPosition === 'top' ? mentionCoords.top - 205 : mentionCoords.top + 5,
                                                    left: mentionCoords.left,
                                                    position: 'fixed'
                                                }}
                                            />
                                        )}
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button className="btn btn-sm" onClick={() => setEditingThreadId(null)}>キャンセル</button>
                                            <button className="btn btn-sm btn-primary" onClick={() => handleUpdateThread(thread.id)}>保存</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div
                                        className="task-content line-clamp-2"
                                        dangerouslySetInnerHTML={{ __html: highlightMentions(thread.content, mentionOptions) }}
                                        style={{ whiteSpace: 'pre-wrap', cursor: 'pointer' }}
                                        title="クリックで全文表示/折りたたみ"
                                        onClick={(e) => e.currentTarget.classList.toggle('line-clamp-2')}
                                    />
                                )}

                                {renderAttachments(thread.attachments)}

                                <div className="task-footer-teams">
                                    <ReactionBar
                                        reactions={reactions.filter(r => r.thread_id === thread.id && !r.reply_id)}
                                        profiles={profiles}
                                        currentUserId={user?.id}
                                        currentProfile={currentProfile}
                                        onAdd={(emoji) => handleAddReaction(emoji, thread.id, undefined)}
                                        onRemove={handleRemoveReaction}
                                    />
                                </div>

                                <div className={`reply-section ${(!thread.replies || thread.replies.length === 0) ? 'is-empty' : ''}`}>
                                    {thread.replies && thread.replies.length > 0 && (
                                        <div className="reply-scroll-area">
                                            {[...thread.replies].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map(reply => {
                                                const replyAuthorProfile = getProfile(reply.author);
                                                const replyAvatar = replyAuthorProfile?.avatar_url;
                                                return (
                                                    <div key={reply.id} className="reply-item" style={{ position: 'relative' }}>
                                                        <div className="dot-menu-container" style={{ top: '2px', right: '2px', transform: 'scale(0.8)' }}>
                                                            <div className="dot-menu-trigger">⋮</div>
                                                            <div className="dot-menu">
                                                                {(user?.id === reply.user_id || ['Admin', 'Manager'].includes(currentProfile?.role || '')) && (
                                                                    <>
                                                                        {user?.id === reply.user_id && (
                                                                            <div className="menu-item" onClick={() => setEditingReplyId(reply.id)}>
                                                                                <span className="menu-icon">✏️</span> 編集
                                                                            </div>
                                                                        )}
                                                                        <div className="menu-item menu-item-delete" onClick={() => handleDeleteReply(reply.id)}>
                                                                            <span className="menu-icon">🗑️</span> 削除
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="reply-header">
                                                            <div className="avatar" style={{ width: '20px', height: '20px', fontSize: '0.6rem' }}>
                                                                {replyAvatar ? (
                                                                    <img src={replyAvatar} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                                                                ) : (
                                                                    (reply.author && reply.author[0].toUpperCase())
                                                                )}
                                                            </div>
                                                            <span>{reply.author}</span>
                                                            <span>{formatDate(reply.created_at)}</span>
                                                        </div>
                                                        {editingReplyId === reply.id ? (
                                                            <div className="edit-form" style={{ marginTop: '5px' }}>
                                                                <div style={{ position: 'relative' }}>
                                                                    <div
                                                                        ref={(el) => {
                                                                            if (el) {
                                                                                editRefs.current[reply.id] = el;
                                                                                // Initialize content only once if empty
                                                                                if (!el.innerHTML && reply.content) {
                                                                                    el.innerHTML = reply.content;
                                                                                }
                                                                            }
                                                                        }}
                                                                        contentEditable
                                                                        className="input-field rich-editor"
                                                                        style={{ minHeight: '60px', marginBottom: '8px', color: 'var(--text-main)', fontSize: '0.85rem' }}
                                                                        onInput={(e) => handleInput(e, reply.id)}
                                                                        onKeyDown={(e) => {
                                                                            if (isOpen && targetThreadId === reply.id) {
                                                                                handleKeyDown(e, reply.id, e.currentTarget);
                                                                            }
                                                                        }}
                                                                    />
                                                                    {isOpen && targetThreadId === reply.id && (
                                                                        <MentionList
                                                                            candidates={candidates}
                                                                            activeIndex={activeIndex}
                                                                            onSelect={(c) => {
                                                                                const el = editRefs.current[reply.id];
                                                                                if (el) insertMention(c, el);
                                                                            }}
                                                                            style={{
                                                                                top: mentionPosition === 'top' ? mentionCoords.top - 205 : mentionCoords.top + 5,
                                                                                left: mentionCoords.left,
                                                                                position: 'fixed'
                                                                            }}
                                                                        />
                                                                    )}
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                    <button className="btn btn-sm" onClick={() => setEditingReplyId(null)}>キャンセル</button>
                                                                    <button className="btn btn-sm btn-primary" onClick={() => handleUpdateReply(reply.id)}>保存</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div
                                                                className="reply-content"
                                                                dangerouslySetInnerHTML={{ __html: highlightMentions(reply.content, mentionOptions) }}
                                                            />
                                                        )}
                                                        {renderAttachments(reply.attachments)}
                                                        <ReactionBar
                                                            reactions={reactions.filter(r => r.reply_id === reply.id)}
                                                            profiles={profiles}
                                                            currentUserId={user?.id}
                                                            currentProfile={currentProfile}
                                                            onAdd={(emoji) => handleAddReaction(emoji, undefined, reply.id)}
                                                            onRemove={handleRemoveReaction}
                                                            style={{ marginTop: '4px' }}
                                                        />
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                    {thread.status !== 'completed' && (
                                        <div className="reply-form" style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', marginTop: '10px' }}>
                                            <div style={{ flex: 1, position: 'relative' }}>
                                                <div
                                                    ref={(el) => { if (el) replyRefs.current[thread.id] = el; }}
                                                    contentEditable
                                                    className="input-field btn-sm rich-editor"
                                                    style={{ minHeight: '38px', marginTop: 0, padding: '8px' }}
                                                    onInput={(e) => {
                                                        handleInput(e, thread.id);
                                                    }}
                                                    onKeyDown={(e) => {
                                                        if (isOpen && targetThreadId === thread.id) {
                                                            handleKeyDown(e, thread.id, e.currentTarget);
                                                            if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
                                                                return;
                                                            }
                                                        }
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleAddReply(thread.id);
                                                        }
                                                    }}
                                                    onPaste={(e: React.ClipboardEvent) => {
                                                        e.preventDefault();
                                                        const text = e.clipboardData.getData('text/plain');
                                                        document.execCommand('insertText', false, text);
                                                    }}
                                                />
                                                {isOpen && targetThreadId === thread.id && (
                                                    <MentionList
                                                        candidates={candidates}
                                                        activeIndex={activeIndex}
                                                        onSelect={(c) => {
                                                            const el = replyRefs.current[thread.id];
                                                            if (el) insertMention(c, el);
                                                        }}
                                                        style={{
                                                            top: mentionPosition === 'top' ? mentionCoords.top - 205 : mentionCoords.top + 5,
                                                            left: mentionCoords.left,
                                                            position: 'fixed'
                                                        }}
                                                    />
                                                )}
                                                {(replyAttachments[thread.id]?.length || 0) > 0 && (
                                                    <div className="attachment-preview-area" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                                        {replyAttachments[thread.id].map((att, idx) => (
                                                            <div key={idx} className="attachment-item" style={{ position: 'relative', width: '40px', height: '40px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                                {att.type.startsWith('image/') ? (
                                                                    <img src={att.thumbnailUrl || att.url} alt={att.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                ) : (
                                                                    <span style={{ fontSize: '14px' }}>📄</span>
                                                                )}
                                                                <div
                                                                    className="attachment-remove"
                                                                    onClick={() => removeReplyAttachment(thread.id, idx)}
                                                                    style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: 'white', width: '14px', height: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '10px' }}
                                                                >
                                                                    ×
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '5px', marginTop: '0px' }}>
                                                <button
                                                    className="btn-sm btn-clip-yellow"
                                                    style={{ padding: 0, width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                                    onClick={() => handleReplyAttachClick(thread.id)}
                                                    disabled={replyUploading[thread.id]}
                                                >
                                                    {replyUploading[thread.id] ? (
                                                        <div className="spinner-small" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                                    ) : (
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                                        </svg>
                                                    )}
                                                </button>
                                                <input
                                                    type="file"
                                                    ref={el => { fileInputRefs.current[thread.id] = el; }}
                                                    data-reply-thread={thread.id}
                                                    style={{ display: 'none' }}
                                                    multiple
                                                    onChange={(e) => handleReplyFileChange(thread.id, e)}
                                                    disabled={replyUploading[thread.id]}
                                                />
                                                <button
                                                    className="btn-send-blue"
                                                    title="送信"
                                                    style={{
                                                        width: '38px',
                                                        height: '38px',
                                                        padding: 0,
                                                        flexShrink: 0,
                                                        cursor: 'pointer'
                                                    }}
                                                    onClick={() => handleAddReply(thread.id)}
                                                >
                                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="22" y1="2" x2="11" y2="13"></line>
                                                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div style={{ position: 'absolute', bottom: '10px', right: (thread.replies && thread.replies.length > 0) ? '20px' : '15px', display: 'flex', alignItems: 'center', gap: '10px', zIndex: 100 }}>
                                    {thread.status === 'completed' && (
                                        <div style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--success)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            background: 'rgba(67, 181, 129, 0.1)',
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            border: '1px solid rgba(67, 181, 129, 0.2)',
                                            animation: 'fadeIn 0.3s ease-out',
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                        }}>
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                            <span style={{ fontWeight: 600 }}>完了者: {completerName}</span>
                                            <span style={{ opacity: 0.7, marginLeft: '4px' }}>{formatDate(thread.completed_at)}</span>
                                        </div>
                                    )}
                                    <button
                                        className={`btn btn-sm btn-status ${thread.status === 'completed' ? 'btn-revert' : ''}`}
                                        title={thread.status === 'completed' ? '未完了に戻す' : '完了にする'}
                                        style={{ width: '38px', height: '38px' }}
                                        onClick={() => handleToggleStatus(thread.id, thread.status)}
                                    >
                                        {thread.status === 'completed' ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                                        ) : (
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        );
                    })
            )}
        </div >
    );
};
