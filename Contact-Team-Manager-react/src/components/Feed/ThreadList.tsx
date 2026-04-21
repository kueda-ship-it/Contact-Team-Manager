import React from 'react';
import { useTeams, useProfiles, useTags, useReactions, useTeamMembers } from '../../hooks/useSupabase';
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
import { LinkPreview } from '../common/LinkPreview';
import { WaterDateTimePicker } from '../common/WaterDateTimePicker';

// Helper component for auto-refreshing images
const ThreadImage: React.FC<{ 
    att: any; 
    getFreshMetadata: (id: string, driveId?: string) => Promise<any>;
    isAuthenticated: boolean;
    onLogin: () => Promise<any>;
}> = ({ att, getFreshMetadata, isAuthenticated, onLogin }) => {
    // Initial src: priority to direct links. Only use .url if it seems to be a direct link or we have nothing else.
    // OneDrive webUrls usually contain "view.aspx" or similar, which break <img>.
    const isDirectLink = (url: string) => url && (url.includes('download.aspx') || url.includes('content.office.net') || url.includes('public.blob.core.windows.net'));
    
    // Quality improvement: Prefer downloadUrl (high res) over thumbnailUrl
    const [src, setSrc] = React.useState(att.downloadUrl || att.thumbnailUrl || (isDirectLink(att.url) ? att.url : ''));
    const [retryCount, setRetryCount] = React.useState(0);
    const [isAuthNeeded, setIsAuthNeeded] = React.useState(false);

    // React to auth changes: If we were blocked and now authenticated, try again automatically.
    React.useEffect(() => {
        if (isAuthenticated && isAuthNeeded) {
            console.log(`[ThreadImage] Authentication detected for ${att.id}, retrying load.`);
            setIsAuthNeeded(false);
            setRetryCount(0);
            // This re-evaluates src or triggers handleError again if <img> still fails
        }
    }, [isAuthenticated, isAuthNeeded, att.id]);

    const handleError = async () => {
        if (!att.id || retryCount >= 1) {
            // If already retried and still fails, check if we need auth
            if (!isAuthenticated) {
                console.log("[ThreadImage] Still failing and not authenticated. Showing auth button.");
                setIsAuthNeeded(true);
            }
            return;
        }
        
        console.log(`[ThreadImage] Image failed to load, fetching fresh metadata for ${att.id} (drive: ${att.driveId})`);
        setRetryCount(prev => prev + 1);
        
        const fresh = await getFreshMetadata(att.id, att.driveId);
        if (fresh) {
            setSrc(fresh.downloadUrl || fresh.thumbnailUrl);
            setIsAuthNeeded(false);
        } else if (!isAuthenticated) {
            setIsAuthNeeded(true);
        }
    };

    if (isAuthNeeded) {
        return (
            <div className="attachment-file-icon" style={{ cursor: 'pointer', width: '200px', height: '150px', background: 'rgba(0,183,195,0.05)', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', border: '1px dashed rgba(0,183,195,0.3)' }} onClick={onLogin}>
                <span style={{ fontSize: '1.2rem' }}>🔒</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>クリックして画像を表示</span>
            </div>
        );
    }

    if (!src && !att.thumbnailUrl && !att.downloadUrl) {
         return (
            <div className="attachment-file-icon" style={{ width: '60px', height: '60px', background: 'rgba(255,165,0,0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', border: '1px solid rgba(255,165,0,0.3)' }}>
                🖼️
            </div>
        );
    }

    return (
        <img
            src={src}
            alt={att.name}
            onError={handleError}
            className="attachment-thumb-large"
            style={{ maxWidth: '300px', maxHeight: '300px', borderRadius: '4px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
        />
    );
};

// Helper to extract URLs from text
const extractUrls = (text: string | null): string[] => {
    if (!text) return [];
    const urlRegex = /((?:https?|file):\/\/[^\s<]+[^<.,:;"')\s])/g;
    const matches = text.match(urlRegex);
    return matches ? Array.from(new Set(matches)) : [];
};

interface ThreadListProps {
    currentTeamId: number | string | null;
    threadsData: {
        threads: any[];
        loading: boolean;
        error: Error | null;
        refetch: (silent?: boolean) => void;
    };
    statusFilter: 'all' | 'pending' | 'completed' | 'mentions' | 'myposts';
    onStatusChange: (status: 'all' | 'pending' | 'completed' | 'mentions' | 'myposts') => void;
    sortAscending: boolean;
    onToggleSort: () => void;
    onLoadMore: () => void;
    scrollToThreadId?: string | null;
    onScrollComplete?: () => void;
}

export const ThreadList: React.FC<ThreadListProps> = ({
    currentTeamId,
    threadsData,
    statusFilter,
    onStatusChange,
    sortAscending,
    onToggleSort,
    onLoadMore,
    scrollToThreadId,
    onScrollComplete
}) => {
    const { threads, loading: threadsLoading, error, refetch } = threadsData;
    const { teams } = useTeams();
    const { profiles } = useProfiles();
    const { tags } = useTags();
    const { reactions, refetch: refetchReactions } = useReactions();
    const { user, profile: currentProfile } = useAuth();
    const [editingThreadId, setEditingThreadId] = React.useState<string | null>(null);
    const [editingReplyId, setEditingReplyId] = React.useState<string | null>(null);
    const {
        uploadFile,
        downloadFileFromOneDrive,
        getFreshAttachmentMetadata,
        isAuthenticated,
        login
    } = useOneDriveUpload();
    const editRefs = React.useRef<{ [key: string]: HTMLDivElement | null }>({});
    const fileInputRefs = React.useRef<{ [key: string]: HTMLInputElement | null }>({});

    // Track multiple file uploads for different reply forms
    // Using a simple object to manage attachments per reply form
    const [replyAttachments, setReplyAttachments] = React.useState<{ [key: string]: Attachment[] }>({});
    const [replyUploading, setReplyUploading] = React.useState<{ [key: string]: boolean }>({});
    // リマインド編集パネル: threadId -> リマインド行リスト
    const [remindPanel, setRemindPanel] = React.useState<{
        threadId: string;
        rows: { id: string | null; value: string }[];
    } | null>(null);
    const [remindSaving, setRemindSaving] = React.useState(false);
    const [replyPendingFiles, setReplyPendingFiles] = React.useState<{ [key: string]: { id: string, file: File, previewUrl: string }[] }>({});
    const [expandedThreads, setExpandedThreads] = React.useState<Set<string>>(new Set());
    const [needsExpandMap, setNeedsExpandMap] = React.useState<{ [key: string]: boolean }>({});
    const [openMenuId, setOpenMenuId] = React.useState<string | null>(null);
    const [selectedPreviewUrl, setSelectedPreviewUrl] = React.useState<string | null>(null);
    const measureRefs = React.useRef<{ [key: string]: HTMLDivElement | null }>({});
    const [previewImageUrl, setPreviewImageUrl] = React.useState<string | null>(null);
    const [previewAttId, setPreviewAttId] = React.useState<string | null>(null);

    // Close open menu when clicking outside
    React.useEffect(() => {
        const handleClickOutside = () => { setOpenMenuId(null); };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // Disable pointer events on overlapping UI when menu is open
    React.useEffect(() => {
        if (openMenuId !== null) {
            document.body.classList.add('menu-open');
        } else {
            document.body.classList.remove('menu-open');
        }
        return () => document.body.classList.remove('menu-open');
    }, [openMenuId]);

    // Measure heights to detect if they exceed thresholds (200px for threads, 100px for replies)
    React.useLayoutEffect(() => {
        const observer = new ResizeObserver((entries) => {
            setNeedsExpandMap(prev => {
                const next = { ...prev };
                let changed = false;
                for (const entry of entries) {
                    const el = entry.target as HTMLElement;
                    const id = el.getAttribute('data-measure-id');
                    if (id) {
                        const threshold = id.startsWith('reply-') ? 100 : 200;
                        const needs = el.scrollHeight > threshold;
                        if (next[id] !== needs) {
                            next[id] = needs;
                            changed = true;
                        }
                    }
                }
                return changed ? next : prev;
            });
        });

        Object.values(measureRefs.current).forEach(el => {
            if (el) observer.observe(el);
        });

        return () => observer.disconnect();
    }, [threads]); // Re-observe when threads change (new items added)

    const toggleExpand = (id: string) => {
        setExpandedThreads(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };


    const { members: teamMembers } = useTeamMembers(currentTeamId);
    const memberIds = React.useMemo(() => 
        currentTeamId ? teamMembers.map(m => m.user_id) : undefined
    , [teamMembers, currentTeamId]);

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
    } = useMentions({ profiles, tags, currentTeamId, teams, memberIds });

    // Auto-scroll to proper end of thread list on load/update
    const threadListRef = React.useRef<HTMLDivElement>(null);
    const bottomAnchorRef = React.useRef<HTMLDivElement>(null);
    const replyRefs = React.useRef<{ [key: string]: HTMLDivElement | null }>({});

    // Get the last thread ID to detect meaningful updates
    // const lastThreadId = threads.length > 0 ? (sortAscending ? threads[threads.length - 1].id : threads[0].id) : null;


    // Scroll position management for infinite scroll
    const [prevScrollHeight, setPrevScrollHeight] = React.useState<number | null>(null);

    React.useLayoutEffect(() => {
        if (threadListRef.current) {
            const el = threadListRef.current;

            if (prevScrollHeight !== null && threads.length > 0) {
                // If we loaded more items (inserted at top), restore relative position
                const heightDesc = el.scrollHeight - prevScrollHeight;
                if (heightDesc > 0) {
                    el.scrollTop = heightDesc;
                }
                setPrevScrollHeight(null);
            } else if (sortAscending && prevScrollHeight === null) {
                // Initial load only for Chat Mode: Scroll to bottom
                // We utilize a small timeout or just run it if we are sure it's initial
                // But we need to distinguish "Initial Load" from "Update".
                // For simplified "Chat Mode", we usually want to stay at bottom unless user scrolled up.
                // Here we force bottom on mount or major refresh logic if at top? 
                // Let's stick to the previous behavior: Initial mount scroll to bottom.
                // We can use a ref to track if initial scroll is done?
            }
        }
    }, [threads.length, prevScrollHeight, sortAscending]);

    const initialScrollDone = React.useRef(false);

    // Reset initial scroll state when team changes or sort order changes
    React.useEffect(() => {
        initialScrollDone.current = false;
    }, [currentTeamId, sortAscending]);

    // Initial scroll to bottom for Chat Mode
    React.useEffect(() => {
        // Wait until loading is finished and we have threads
        if (!threadsLoading && sortAscending && threads.length > 0) {
            // Always try to scroll to bottom on initial load of the view or when switching to Chat mode
            if (!initialScrollDone.current) {
                // Use a small timeout to ensure DOM is updated
                const timer = setTimeout(() => {
                    bottomAnchorRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' });
                    initialScrollDone.current = true;
                }, 150);
                return () => clearTimeout(timer);
            }
        }
    }, [currentTeamId, sortAscending, threads.length, threadsLoading]);
    // Actually user wants "Default is bottom is newest".

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        // Check for top reach for "Load More" (Chat Mode)
        if (sortAscending && el.scrollTop === 0 && threads.length >= 50) {
            // Reached top, load more
            setPrevScrollHeight(el.scrollHeight);
            onLoadMore();
        }
    };

    const displayThreads = React.useMemo(() => {
        if (!threads) return [];
        // Chat Mode (sortAscending = true): Oldest -> Newest (Newest at Bottom)
        // News Mode (sortAscending = false): Newest -> Oldest (Newest at Top)
        return [...threads].sort((a, b) => {
            const dateA = new Date(a.created_at).getTime(); // Use created_at for strict chronological order
            const dateB = new Date(b.created_at).getTime();
            // Ascending (Chat): A - B
            // Descending (News): B - A
            return sortAscending ? dateA - dateB : dateB - dateA;
        });
    }, [threads, sortAscending]);

    // Handle scroll to specific thread (from sidebar navigation)
    React.useEffect(() => {
        if (scrollToThreadId && !threadsLoading && threads.length > 0) {
            let retryCount = 0;
            const maxRetries = 20; // 2 seconds total

            const tryScroll = () => {
                const el = document.getElementById(`thread-${scrollToThreadId}`);
                if (el) {
                    console.log('Scrolling to thread:', scrollToThreadId);
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('highlight-thread');
                    setTimeout(() => el.classList.remove('highlight-thread'), 3000);
                    if (onScrollComplete) onScrollComplete();
                } else if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(tryScroll, 100);
                } else {
                    console.warn('Scroll target not found after retries:', scrollToThreadId);
                    if (onScrollComplete) onScrollComplete();
                }
            };

            tryScroll();
        }
    }, [scrollToThreadId, threadsLoading, threads.length, onScrollComplete]);

    if (threadsLoading && threads.length === 0) {
        return null;
    }

    if (error) {
        return (
            <div style={{ padding: '20px', color: 'var(--danger)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>通信エラーが発生しました。ネットワーク接続を確認してください。</div>
                <button
                    className="btn btn-outline"
                    style={{ width: 'fit-content' }}
                    onClick={() => refetch()}
                >
                    再試行
                </button>
            </div>
        );
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

    // thread_reminders テーブルから対象スレッドのリマインドを取得してパネルを開く
    const openRemindPanel = async (threadId: string) => {
        const { data } = await supabase
            .from('thread_reminders')
            .select('id, remind_at')
            .eq('thread_id', threadId)
            .order('remind_at', { ascending: true });
        const rows = (data || []).map((r: any) => {
            const d = new Date(r.remind_at);
            const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                .toISOString().slice(0, 16);
            return { id: r.id, value: local };
        });
        setRemindPanel({ threadId, rows: rows.length > 0 ? rows : [{ id: null, value: '' }] });
    };

    const handleSaveRemindPanel = async () => {
        if (!remindPanel) return;
        setRemindSaving(true);
        try {
            const { threadId, rows } = remindPanel;
            const validRows = rows.filter(r => r.value.trim() !== '');

            // 既存行を取得し、削除が実際に成功したか .select() で検証する。
            // RLS の DELETE ポリシーが欠落していると Supabase は「成功 / 0 行削除」を返してしまい
            // 一括 delete + insert 戦略が累積バグを起こすため、明示的な検証を入れる。
            const { data: existing, error: fetchError } = await supabase
                .from('thread_reminders')
                .select('id')
                .eq('thread_id', threadId);
            if (fetchError) throw fetchError;
            const existingIds = (existing || []).map((r: any) => r.id);

            if (existingIds.length > 0) {
                const { data: deleted, error: deleteError } = await supabase
                    .from('thread_reminders')
                    .delete()
                    .eq('thread_id', threadId)
                    .select('id');
                if (deleteError) throw deleteError;
                if ((deleted || []).length !== existingIds.length) {
                    throw new Error(
                        `削除権限が不足しています（${existingIds.length} 件中 ${(deleted || []).length} 件のみ削除）。RLS DELETE ポリシーを確認してください。`
                    );
                }
            }

            if (validRows.length > 0) {
                const { error: insertError } = await supabase.from('thread_reminders').insert(
                    validRows.map(r => ({
                        thread_id: threadId,
                        remind_at: new Date(r.value).toISOString(),
                        reminder_sent: false,
                    }))
                );
                if (insertError) throw insertError;
            }
            setRemindPanel(null);
            refetch(true);
        } catch (e: any) {
            alert('リマインドの保存に失敗しました: ' + e.message);
        } finally {
            setRemindSaving(false);
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
            // Update parent thread updated_at to bump it to top
            await supabase.from('threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);

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
                const pendingId = Math.random().toString(36).substring(7);
                const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
                
                // Add to local pending state
                setReplyPendingFiles(prev => ({
                    ...prev,
                    [threadId]: [...(prev[threadId] || []), { id: pendingId, file, previewUrl }]
                }));

                try {
                    const uploaded = await uploadFile(file);
                    if (uploaded) newAtts.push(uploaded);
                } finally {
                    // Remove from local pending state
                    setReplyPendingFiles(prev => ({
                        ...prev,
                        [threadId]: (prev[threadId] || []).filter(p => p.id !== pendingId)
                    }));
                    if (previewUrl) URL.revokeObjectURL(previewUrl);
                }
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
        // 2. If not, attempt login (which opens popup)

        if (isAuthenticated) {
            const fileInput = document.querySelector(`input[data-reply-thread="${threadId}"]`) as HTMLInputElement;
            fileInput?.click();
        } else {
            // Trigger login directly on click to avoid "popup blocked" issues caused by async delays or window.confirm
            // The login function itself handles the popup
            const account = await login();
            if (account) {
                // If login successful, auto-click the file input
                const fileInput = document.querySelector(`input[data-reply-thread="${threadId}"]`) as HTMLInputElement;
                fileInput?.click();
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
                    const isImageFile = (name?: string, type?: string) => {
                        const imgExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
                        return (type?.startsWith('image/')) || (name && imgExtensions.some(ext => name.toLowerCase().endsWith(ext)));
                    };
                    const isImage = isImageFile(att.name, att.type);
                    return (
                        <div key={idx} className="attachment-group" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                            <div className="attachment-wrapper" style={{ position: 'relative' }}>
                                <div
                                    onClick={async () => {
                                        if (isImage) {
                                            // Prefer direct link for <img> tag. If only webUrl exists, wait for refresh.
                                            const isDirectLink = (url: string) => url && (url.includes('download.aspx') || url.includes('content.office.net') || url.includes('public.blob.core.windows.net'));
                                            const initialUrl = isDirectLink(att.downloadUrl) ? att.downloadUrl : (isDirectLink(att.thumbnailUrl) ? att.thumbnailUrl : null);
                                            
                                            setPreviewAttId(att.id);
                                            setPreviewImageUrl(initialUrl);

                                            // Always attempt to refresh on click to get the high-res direct link
                                            if (att.id) {
                                                const fresh = await getFreshAttachmentMetadata(att.id, att.driveId);
                                                if (fresh) {
                                                    setPreviewImageUrl(fresh.downloadUrl || fresh.thumbnailUrl);
                                                } else if (!isAuthenticated) {
                                                    // Request login without confirmation for direct feedback
                                                    const account = await login();
                                                    if (account) {
                                                        const freshAfter = await getFreshAttachmentMetadata(att.id, att.driveId);
                                                        if (freshAfter) setPreviewImageUrl(freshAfter.downloadUrl || freshAfter.thumbnailUrl);
                                                    }
                                                }
                                            }
                                        } else {
                                            if (att.id) {
                                                downloadFileFromOneDrive(att.id, att.name, att.driveId);
                                            } else {
                                                window.open(att.url, '_blank');
                                            }
                                        }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                >
                                    {isImage ? (
                                        <ThreadImage 
                                            att={att} 
                                            getFreshMetadata={getFreshAttachmentMetadata} 
                                            isAuthenticated={isAuthenticated}
                                            onLogin={login}
                                        />
                                    ) : (
                                        <div className="attachment-file-icon" style={{ width: '60px', height: '60px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            📄
                                        </div>
                                    )}
                                </div>
                                <div className="attachment-name" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {att.name}
                                </div>
                            </div>
                            {isOneDrive && (
                                <button
                                    className="btn-download-icon"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        downloadFileFromOneDrive(att.id || att.url, att.name, att.driveId);
                                    }}
                                    title="OneDriveからダウンロード"
                                    style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginTop: '4px' }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        <div
            className="feed-list"
            ref={threadListRef}
            style={{ overflowY: 'auto', height: '100%' }}
            onScroll={handleScroll}
        >
            {/* Desktop Header (Original UI) */}
            <div className="feed-header-sticky desktop-only">
                <div className="feed-header-left">
                    <CustomSelect
                        options={[
                            { value: 'all', label: 'すべて表示' },
                            { value: 'pending', label: '未完了' },
                            { value: 'completed', label: '完了済み' },
                            { value: 'mentions', label: '自分宛て' },
                            { value: 'myposts', label: '自分の投稿' }
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
                    <button className="btn-sort-toggle" onClick={onToggleSort} style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                    }}>
                        {sortAscending ? 'チャット形式 (最新が下)' : 'ニュース形式 (最新が上)'}
                    </button>
                </div>
            </div>

            {/* Mobile Header (New Integrated Sticky UI) */}
            <div className="mobile-only mobile-header-fixed">
                <div className="mobile-header-top-row">
                    <div className="mobile-team-name">
                        {currentTeamName}
                    </div>
                    <button className="sort-minimal-btn" onClick={onToggleSort}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"></polyline>
                            <polyline points="16 7 22 7 22 13"></polyline>
                        </svg>
                        {sortAscending ? '昇' : '降'}
                    </button>
                    <div className="mobile-thread-count">
                        {threads.length}件
                    </div>
                </div>
                <div className="filter-chips-container">
                    {[
                        { value: 'all', label: 'すべて表示' },
                        { value: 'pending', label: '未完了' },
                        { value: 'completed', label: '完了済み' },
                        { value: 'mentions', label: '自分宛て' },
                        { value: 'myposts', label: '自分の投稿' }
                    ].map(opt => (
                        <div
                            key={opt.value}
                            className={`filter-chip ${statusFilter === opt.value ? 'active' : ''}`}
                            onClick={() => onStatusChange(opt.value as any)}
                        >
                            {opt.label}
                        </div>
                    ))}
                </div>
            </div>

            {/* Load More Trigger / Loading Indicator could go here */}
            {sortAscending && threadsLoading && threads.length > 0 && (
                <div style={{ padding: '10px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    読み込み中...
                </div>
            )}

            {displayThreads
                .filter(thread => {
                    if (statusFilter === 'pending') return thread.status === 'pending';
                    if (statusFilter === 'completed') return thread.status === 'completed';
                    if (statusFilter === 'mentions') {
                        return hasMention(thread.content, currentProfile, user?.email || null) ||
                            (thread.replies || []).some((r: any) => hasMention(r.content, currentProfile, user?.email || null));
                    }
                    if (statusFilter === 'myposts') {
                        return thread.user_id === user?.id;
                    }
                    return true;
                })
                .length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    表示する投稿がありません。
                </div>
            ) : (
                displayThreads
                    .filter(thread => {
                        if (statusFilter === 'pending') return thread.status === 'pending';
                        if (statusFilter === 'completed') return thread.status === 'completed';
                        if (statusFilter === 'mentions') {
                            return hasMention(thread.content, currentProfile, user?.email || null) ||
                                (thread.replies || []).some((r: any) => hasMention(r.content, currentProfile, user?.email || null));
                        }
                        if (statusFilter === 'myposts') {
                            return thread.user_id === user?.id;
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
                                className={`task-card ${thread.is_pinned ? 'is-pinned' : ''} ${thread.status === 'completed' ? 'is-completed' : ''} ${openMenuId === thread.id ? 'has-open-menu' : ''}`}
                                style={{ position: 'relative', paddingBottom: '50px' }}
                            >
                                {thread.is_pinned && <div className="pinned-badge">重要</div>}
                                {currentTeamId === null && (
                                    <div className="team-badge">
                                        {teams.find(t => t.id === thread.team_id)?.name || 'Unknown'}
                                    </div>
                                )}

                                <div className="dot-menu-container">
                                    <div className="dot-menu-trigger" onClick={(e) => { e.stopPropagation(); setOpenMenuId(prev => prev === thread.id ? null : thread.id); }}>⋮</div>
                                    <div className={`dot-menu${openMenuId === thread.id ? ' dot-menu-open' : ''}`} onClick={(e) => e.stopPropagation()}>
                                        {(user?.id === thread.user_id || ['Admin', 'Manager'].includes(currentProfile?.role || '')) && (
                                            <>
                                                {user?.id === thread.user_id && (
                                                    <div className="menu-item" onClick={() => {
                                                        setOpenMenuId(null);
                                                        setEditingThreadId(thread.id);
                                                    }}>
                                                        <span className="menu-icon">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                            </svg>
                                                        </span> 編集
                                                    </div>
                                                )}
                                                <div className="menu-item menu-item-delete" onClick={() => { setOpenMenuId(null); handleDeleteThread(thread.id); }}>
                                                    <span className="menu-icon">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <polyline points="3 6 5 6 21 6"></polyline>
                                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                            <line x1="10" y1="11" x2="10" y2="17"></line>
                                                            <line x1="14" y1="11" x2="14" y2="17"></line>
                                                        </svg>
                                                    </span> 削除
                                                </div>
                                                <div className="menu-item" onClick={() => {
                                                    setOpenMenuId(null);
                                                    openRemindPanel(thread.id);
                                                }}>
                                                    <span className="menu-icon">
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <circle cx="12" cy="12" r="10"></circle>
                                                            <polyline points="12 6 12 12 16 14"></polyline>
                                                        </svg>
                                                    </span> リマインド編集
                                                </div>
                                                {['Admin'].includes(currentProfile?.role || '') && (
                                                    <div className="menu-item move-team-item" onClick={(e) => e.stopPropagation()}>
                                                        <span className="menu-icon">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                                                            </svg>
                                                        </span> チーム移動
                                                        <div className="submenu" onClick={(e) => e.stopPropagation()}>
                                                            {teams.filter(t => t.id !== thread.team_id).map(t => (
                                                                <div key={t.id} className="menu-item" onClick={async (e) => {
                                                                    e.stopPropagation();
                                                                    setOpenMenuId(null);
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
                                        <div className="task-author-info" style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: '8px' }}>
                                            <span className="author-name">{thread.author}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {formatDate(thread.created_at)}
                                            </span>
                                            {(() => {
                                                const now = new Date().toISOString();
                                                const upcoming = (thread.reminders || [])
                                                    .filter((r: any) => r.remind_at > now)
                                                    .sort((a: any, b: any) => a.remind_at.localeCompare(b.remind_at));
                                                return upcoming.map((r: any) => (
                                                    <span key={r.id} style={{ fontSize: '0.72rem', color: 'var(--accent)', background: 'rgba(0,210,255,0.07)', border: '1px solid rgba(0,210,255,0.2)', borderRadius: '4px', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                                        </svg>
                                                        {new Date(r.remind_at).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                ));
                                            })()}
                                        </div>
                                    </div>
                                </div>


                                {remindPanel && remindPanel.threadId === thread.id && (
                                    <div style={{ padding: '10px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                            </svg>
                                            リマインド設定
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {remindPanel.rows.map((row, idx) => (
                                                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <WaterDateTimePicker
                                                        value={row.value}
                                                        onChange={(v) => setRemindPanel(prev => prev ? {
                                                            ...prev,
                                                            rows: prev.rows.map((r, i) => i === idx ? { ...r, value: v } : r)
                                                        } : null)}
                                                        disabled={remindSaving}
                                                        title={`リマインド ${idx + 1}`}
                                                    />
                                                    {remindPanel.rows.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setRemindPanel(prev => prev ? {
                                                                ...prev,
                                                                rows: prev.rows.filter((_, i) => i !== idx)
                                                            } : null)}
                                                            style={{ background: 'none', border: 'none', color: 'rgba(255,100,100,0.7)', cursor: 'pointer', fontSize: '16px', padding: '0 2px' }}
                                                            title="削除"
                                                        >×</button>
                                                    )}
                                                </div>
                                            ))}
                                            {/* ➕ 枠付きボタン */}
                                            <button
                                                type="button"
                                                onClick={() => setRemindPanel(prev => prev ? { ...prev, rows: [...prev.rows, { id: null, value: '' }] } : null)}
                                                style={{
                                                    background: 'rgba(100,180,255,0.1)',
                                                    border: '1px solid rgba(100,180,255,0.35)',
                                                    borderRadius: '6px',
                                                    color: 'rgba(150,210,255,0.9)',
                                                    cursor: 'pointer',
                                                    fontSize: '14px',
                                                    padding: '3px 10px',
                                                    alignSelf: 'flex-start',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                }}
                                                title="リマインドを追加"
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                                </svg>
                                                追加
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
                                            <button className="btn btn-primary" style={{ padding: '4px 14px', fontSize: '0.8rem' }} onClick={handleSaveRemindPanel} disabled={remindSaving}>
                                                {remindSaving ? '保存中...' : '保存'}
                                            </button>
                                            <button className="btn btn-secondary" style={{ padding: '4px 14px', fontSize: '0.8rem' }} onClick={() => setRemindPanel(null)} disabled={remindSaving}>
                                                キャンセル
                                            </button>
                                        </div>
                                    </div>
                                )}

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
                                                handleKeyDown(e, thread.id, e.currentTarget);
                                                if (isOpen && targetThreadId === thread.id) {
                                                    // Handle other mention keys if needed
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
                                                    top: mentionCoords.top + (mentionPosition === 'top' ? -5 : 5),
                                                    left: mentionCoords.left,
                                                    position: 'fixed',
                                                    transform: mentionPosition === 'top' ? 'translateY(-100%)' : 'none'
                                                }}
                                            />
                                        )}
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button className="btn btn-sm" onClick={() => setEditingThreadId(null)}>キャンセル</button>
                                            <button className="btn btn-sm btn-primary" onClick={() => handleUpdateThread(thread.id)}>保存</button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div className={`thread-expandable-wrapper ${expandedThreads.has(thread.id) ? 'expanded' : (needsExpandMap[thread.id] ? 'collapsed' : 'none')}`}>
                                            <div
                                                ref={(el) => { if (el) measureRefs.current[thread.id] = el; }}
                                                data-measure-id={thread.id}
                                                className="task-content"
                                                dangerouslySetInnerHTML={{ __html: highlightMentions(thread.content, mentionOptions) }}
                                                style={{ whiteSpace: 'pre-wrap' }}
                                            />

                                            <div className="link-previews">
                                                {extractUrls(thread.content).map((url, idx) => (
                                                    <LinkPreview key={idx} url={url} />
                                                ))}
                                            </div>

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
                                                            const hasAttachments = reply.attachments && reply.attachments.length > 0;
                                                            const needsReplyExpandByHeight = needsExpandMap[`reply-${reply.id}`];
                                                            const needsReplyExpand = hasAttachments || needsReplyExpandByHeight;

                                                            return (
                                                                <div key={reply.id} className="reply-item" style={{ position: 'relative' }}>
                                                                    <div className="dot-menu-container" style={{ top: '2px', right: '2px', transform: 'scale(0.8)' }}>
                                                                        <div className="dot-menu-trigger" onClick={(e) => { e.stopPropagation(); setOpenMenuId(prev => prev === reply.id ? null : reply.id); }}>⋮</div>
                                                                        <div className={`dot-menu${openMenuId === reply.id ? ' dot-menu-open' : ''}`} onClick={(e) => e.stopPropagation()}>
                                                                            {(user?.id === reply.user_id || ['Admin', 'Manager'].includes(currentProfile?.role || '')) && (
                                                                                <>
                                                                                    {user?.id === reply.user_id && (
                                                                                        <div className="menu-item" onClick={() => { setOpenMenuId(null); setEditingReplyId(reply.id); }}>
                                                                                            <span className="menu-icon">
                                                                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                                                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                                                                                </svg>
                                                                                            </span> 編集
                                                                                        </div>
                                                                                    )}
                                                                                    <div className="menu-item menu-item-delete" onClick={() => { setOpenMenuId(null); handleDeleteReply(reply.id); }}>
                                                                                        <span className="menu-icon">
                                                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                                                <polyline points="3 6 5 6 21 6"></polyline>
                                                                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                                                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                                                                                <line x1="14" y1="11" x2="14" y2="17"></line>
                                                                                            </svg>
                                                                                        </span> 削除
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
                                                                                        handleKeyDown(e, reply.id, e.currentTarget);
                                                                                    }}
                                                                                />
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                                <button className="btn btn-sm" onClick={() => setEditingReplyId(null)}>キャンセル</button>
                                                                                <button className="btn btn-sm btn-primary" onClick={() => handleUpdateReply(reply.id)}>保存</button>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="reply-body-container">
                                                                            <div className={`reply-expandable-wrapper ${(needsReplyExpand && !expandedThreads.has(reply.id)) ? 'collapsed' : 'expanded'}`}>
                                                                                <div
                                                                                    ref={(el) => { if (el) measureRefs.current[`reply-${reply.id}`] = el; }}
                                                                                    data-measure-id={`reply-${reply.id}`}
                                                                                    className="reply-content"
                                                                                    dangerouslySetInnerHTML={{ __html: highlightMentions(reply.content, mentionOptions) }}
                                                                                />
                                                                                <div className="link-previews">
                                                                                    {extractUrls(reply.content).map((url, idx) => (
                                                                                        <LinkPreview key={idx} url={url} />
                                                                                    ))}
                                                                                </div>
                                                                                {renderAttachments(reply.attachments)}
                                                                            </div>

                                                                            {needsReplyExpand && (
                                                                                <button
                                                                                    className={`expand-btn ${expandedThreads.has(reply.id) ? 'active' : ''}`}
                                                                                    onClick={() => toggleExpand(reply.id)}
                                                                                >
                                                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                                                        <polyline points="6 9 12 15 18 9"></polyline>
                                                                                    </svg>
                                                                                    {expandedThreads.has(reply.id) ? '閉じる' : (hasAttachments ? '詳細/ファイルを表示' : '詳細を表示')}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
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
                                            </div>
                                        </div>

                                        {needsExpandMap[thread.id] && (
                                            <button
                                                className={`expand-btn thread-main-expand-btn ${expandedThreads.has(thread.id) ? 'active' : ''}`}
                                                onClick={() => toggleExpand(thread.id)}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                </svg>
                                                {expandedThreads.has(thread.id) ? 'スレッドを閉じる' : 'スレッド全文/返信を表示'}
                                            </button>
                                        )}

                                        {thread.status !== 'completed' && (
                                            <div className="reply-form" style={{ display: 'flex', gap: '15px', alignItems: 'flex-start', marginTop: '10px' }}>
                                                <div style={{ flex: 1, position: 'relative' }}>
                                                    <div
                                                        ref={(el) => { if (el) replyRefs.current[thread.id] = el; }}
                                                        contentEditable
                                                        className="input-field btn-sm rich-editor"
                                                        style={{ minHeight: '38px', marginTop: 0, padding: '8px' }}
                                                        onInput={(e: React.FormEvent<HTMLDivElement>) => {
                                                            handleInput(e, thread.id);
                                                        }}
                                                        onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
                                                            handleKeyDown(e, thread.id, e.currentTarget);
                                                            if (isOpen && targetThreadId === thread.id) {
                                                                if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
                                                                    return;
                                                                }
                                                            }
                                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                                e.preventDefault();
                                                                handleAddReply(thread.id);
                                                            }
                                                        }}
                                                        onPaste={async (e: React.ClipboardEvent) => {
                                                            const items = e.clipboardData.items;
                                                            let hasImage = false;

                                                            for (let i = 0; i < items.length; i++) {
                                                                if (items[i].type.indexOf('image') !== -1) {
                                                                    const blob = items[i].getAsFile();
                                                                    if (blob && user) {
                                                                        hasImage = true;
                                                                        setReplyUploading(prev => ({ ...prev, [thread.id]: true }));
                                                                        try {
                                                                            const uploaded = await uploadFile(blob);
                                                                            if (uploaded) {
                                                                                setReplyAttachments(prev => ({
                                                                                    ...prev,
                                                                                    [thread.id]: [...(prev[thread.id] || []), uploaded]
                                                                                }));
                                                                            }
                                                                        } finally {
                                                                            setReplyUploading(prev => ({ ...prev, [thread.id]: false }));
                                                                        }
                                                                    }
                                                                }
                                                            }

                                                            if (hasImage) {
                                                                e.preventDefault();
                                                            } else {
                                                                e.preventDefault();
                                                                const text = e.clipboardData.getData('text/plain');
                                                                document.execCommand('insertText', false, text);
                                                            }
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
                                                                top: mentionCoords.top + (mentionPosition === 'top' ? -5 : 5),
                                                                left: mentionCoords.left,
                                                                position: 'fixed',
                                                                transform: mentionPosition === 'top' ? 'translateY(-100%)' : 'none',
                                                                zIndex: 10000
                                                            }}
                                                        />
                                                    )}
                                                    {((replyAttachments[thread.id]?.length || 0) > 0 || (replyPendingFiles[thread.id]?.length || 0) > 0) && (
                                                        <div className="attachment-preview-area" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                                            {/* すでにアップロード済みのファイル */}
                                                            {(replyAttachments[thread.id] || []).map((att, idx) => (
                                                                <div key={`att-${idx}`} className="attachment-item" style={{ position: 'relative', width: '80px', height: '80px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }} onClick={() => setSelectedPreviewUrl(att.downloadUrl || att.thumbnailUrl || null)}>
                                                                    {att.type.startsWith('image/') ? (
                                                                        <img src={att.downloadUrl || att.thumbnailUrl || ''} alt={att.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} title="クリックで拡大表示" />
                                                                    ) : (
                                                                        <span style={{ fontSize: '14px' }}>📄</span>
                                                                    )}
                                                                    <div
                                                                        className="attachment-remove"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            removeReplyAttachment(thread.id, idx);
                                                                        }}
                                                                        style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.5)', color: 'white', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '12px', zIndex: 2 }}
                                                                    >
                                                                        ×
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {/* アップロード中のファイル (即時プレビュー) */}
                                                            {(replyPendingFiles[thread.id] || []).map((pf) => (
                                                                <div key={`pending-${pf.id}`} className="attachment-item uploading" style={{ position: 'relative', width: '80px', height: '80px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--primary-light)', cursor: 'pointer' }} onClick={() => setSelectedPreviewUrl(pf.previewUrl)}>
                                                                    {pf.file.type.startsWith('image/') ? (
                                                                        <img src={pf.previewUrl} alt={pf.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} title="クリックで拡大表示" />
                                                                    ) : (
                                                                        <span style={{ fontSize: '14px', opacity: 0.6 }}>📄</span>
                                                                    )}
                                                                    <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1 }}>
                                                                        <div className="spinner-small" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', gap: '5px', marginTop: '0px' }}>
                                                    <button
                                                        className="btn-sm btn-clip-yellow"
                                                        style={{ padding: 0, width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                                                        onClick={() => handleReplyAttachClick(thread.id)}
                                                        disabled={replyUploading[thread.id]}
                                                    >
                                                        {replyUploading[thread.id] ? (
                                                            <div className="spinner-small" style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                                        ) : (
                                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                                                            width: '40px',
                                                            height: '40px',
                                                            padding: 0,
                                                            flexShrink: 0,
                                                            cursor: 'pointer',
                                                            borderRadius: '50%',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
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
                                                className={`btn btn-sm btn-status ${thread.status === 'completed' ? 'btn-revert' : 'btn-complete'}`}
                                                title={thread.status === 'completed' ? '未完了に戻す' : '完了にする'}
                                                style={{ width: '40px', height: '40px' }}
                                                onClick={() => handleToggleStatus(thread.id, thread.status)}
                                            >
                                                {thread.status === 'completed' ? (
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                                                ) : (
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                                                )}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })
            )}

            {
                !sortAscending && (
                    <div style={{ padding: '20px', display: 'flex', justifyContent: 'center' }}>
                        <button
                            onClick={onLoadMore}
                            className="btn-load-more"
                        >
                            以前の投稿を読み込む (現在 {threads.length} 件表示)
                        </button>
                    </div>
                )
            }
            <div ref={bottomAnchorRef} style={{ height: '1px' }} />

            {/* Image Preview Modal */}
            {previewImageUrl && (
                <div
                    className="image-preview-overlay"
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        background: 'rgba(0,0,0,0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 20000,
                        cursor: 'zoom-out',
                        backdropFilter: 'blur(5px)'
                    }}
                    onClick={() => setPreviewImageUrl(null)}
                >
                    <div
                        style={{
                            position: 'relative',
                            maxWidth: '90%',
                            maxHeight: '90%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                         {previewImageUrl ? (
                            <img
                                src={previewImageUrl}
                                alt="Preview"
                                onError={async () => {
                                    if (previewAttId) {
                                        console.log("[Preview] Image failed, refreshing metadata...");
                                        const fresh = await getFreshAttachmentMetadata(previewAttId);
                                        if (fresh) {
                                            setPreviewImageUrl(fresh.downloadUrl || fresh.thumbnailUrl);
                                        }
                                    }
                                }}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    borderRadius: '12px',
                                    boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}
                            />
                        ) : (
                            <div style={{ color: 'white', textAlign: 'center' }}>
                                <div className="spinner" style={{ marginBottom: '10px' }}></div>
                                <p>読み込み中...</p>
                                {!isAuthenticated && (
                                    <button 
                                        className="btn btn-sm btn-primary" 
                                        style={{ marginTop: '10px' }}
                                        onClick={() => login()}
                                    >
                                        Microsoft にログインして表示
                                    </button>
                                )}
                            </div>
                        )}
                        <button
                            onClick={() => setPreviewImageUrl(null)}
                            style={{
                                position: 'absolute',
                                top: '-40px',
                                right: '-40px',
                                background: 'white',
                                color: 'black',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 'bold',
                                boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
                            }}
                        >
                            ×
                        </button>
                        <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
                            <button
                                className="btn btn-sm btn-primary"
                                onClick={() => window.open(previewImageUrl, '_blank')}
                            >
                                元のサイズで表示
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Image Preview Overlay Modal */}
            {selectedPreviewUrl && (
                <div 
                    className="preview-overlay" 
                    style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.92)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
                    onClick={() => setSelectedPreviewUrl(null)}
                >
                    <div style={{ position: 'relative', width: '75vw', height: '75vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img 
                            src={selectedPreviewUrl} 
                            alt="Full Preview" 
                            style={{ 
                                maxWidth: '100%', 
                                maxHeight: '100%', 
                                objectFit: 'contain', 
                                borderRadius: '4px', 
                                boxShadow: '0 0 50px rgba(0,0,0,0.8)',
                                imageRendering: 'auto',
                                transform: 'translate3d(0,0,0)',
                                backfaceVisibility: 'hidden'
                            }} 
                        />
                        <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedPreviewUrl(null); }}
                            style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'var(--brand-primary, #00d2ff)', color: 'black', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', zIndex: 10001 }}
                            title="閉じる"
                        >
                            ×
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
