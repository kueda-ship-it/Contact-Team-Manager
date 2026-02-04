import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useMentions } from '../../hooks/useMentions';
import { useProfiles, useTags } from '../../hooks/useSupabase';
import { useOneDriveUpload } from '../../hooks/useOneDriveUpload';
import { MentionList } from '../common/MentionList';

interface PostFormProps {
    teamId: number | string | null;
    onSuccess?: () => void;
}

export const PostForm: React.FC<PostFormProps> = ({ teamId, onSuccess }) => {
    const { user, profile } = useAuth();
    const [title, setTitle] = useState('');
    const [loading, setLoading] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    const { profiles } = useProfiles();
    const { tags } = useTags();
    const { attachments, uploading, uploadFile, removeFile, clearFiles } = useOneDriveUpload();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const {
        isOpen,
        candidates,
        activeIndex,
        mentionPosition,
        mentionCoords,
        handleInput,
        handleKeyDown,
        insertMention,
    } = useMentions({ profiles, tags, currentTeamId: teamId });

    const handleSubmit = async () => {
        if (!title.trim() || !contentRef.current?.innerText.trim()) {
            alert('タイトルと内容を入力してください。');
            return;
        }

        if (!user) return;
        if (uploading) return;

        setLoading(true);
        try {
            const authorName = profile?.display_name || user.email || 'Unknown';

            const { error } = await supabase.from('threads').insert([
                {
                    title,
                    content: contentRef.current.innerHTML,
                    author: authorName,
                    user_id: user.id,
                    team_id: teamId,
                    status: 'pending',
                    attachments: attachments.length > 0 ? attachments : null
                }
            ]);

            if (error) throw error;

            setTitle('');
            if (contentRef.current) contentRef.current.innerHTML = '';
            clearFiles();
            if (onSuccess) onSuccess();

        } catch (error: any) {
            alert('投稿に失敗しました: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        for (const file of files) {
            await uploadFile(file);
        }

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className="static-form-container">
            <section className="form-container compact-form" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input
                        type="text"
                        className="input-field"
                        placeholder="件名..."
                        style={{ marginTop: 0, flex: 1 }}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={loading}
                    />
                    <button
                        type="button"
                        className="btn btn-outline"
                        title="ファイル添付"
                        style={{ padding: 0, width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        disabled={loading || uploading}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        {uploading ? (
                            <div className="spinner-small" style={{ width: '16px', height: '16px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                            </svg>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            multiple
                            onChange={handleFileChange}
                            disabled={loading || uploading}
                        />
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <div
                            ref={contentRef}
                            contentEditable
                            className="input-field rich-editor"
                            style={{
                                marginTop: 0,
                                minHeight: '50px',
                                width: '100%',
                                border: '1px solid rgba(255, 255, 255, 0.5)',
                                background: 'rgba(0, 0, 0, 0.2)',
                                color: 'white',
                                borderRadius: '4px',
                                padding: '8px 12px'
                            }}
                            onInput={(e) => {
                                handleInput(e, 'post-form');
                                if (!e.currentTarget.innerText.trim() && !e.currentTarget.innerHTML) {
                                    // Fallback
                                }
                            }}
                            onKeyDown={(e) => {
                                if (isOpen) {
                                    handleKeyDown(e, 'post-form', e.currentTarget);
                                    if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
                                        return;
                                    }
                                }
                            }}
                        />
                        {attachments.length > 0 && (
                            <div className="attachment-preview-area" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                {attachments.map((att, index) => (
                                    <div key={index} className="attachment-item" style={{ position: 'relative', width: '60px', height: '60px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {att.type.startsWith('image/') ? (
                                            <img src={att.url} alt={att.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        ) : (
                                            <span style={{ fontSize: '20px' }}>📄</span>
                                        )}
                                        <div
                                            className="attachment-remove"
                                            onClick={() => removeFile(index)}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                right: 0,
                                                background: 'rgba(0,0,0,0.5)',
                                                color: 'white',
                                                width: '18px',
                                                height: '18px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                cursor: 'pointer',
                                                fontSize: '12px'
                                            }}
                                        >
                                            ×
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {isOpen && (
                            <MentionList
                                candidates={candidates}
                                activeIndex={activeIndex}
                                onSelect={(c) => {
                                    if (contentRef.current) insertMention(c, contentRef.current);
                                }}
                                style={{
                                    top: mentionPosition === 'top' ? mentionCoords.top - 205 : mentionCoords.top + 5,
                                    left: mentionCoords.left,
                                    position: 'fixed'
                                }}
                            />
                        )}
                    </div>
                    <button
                        type="button"
                        className="btn-send-minimal"
                        title="投稿"
                        style={{
                            background: 'none',
                            border: 'none',
                            color: 'white',
                            padding: 0,
                            width: '38px',
                            height: '38px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            cursor: 'pointer',
                            transition: 'color 0.2s ease',
                            marginTop: '0px',
                            alignSelf: 'flex-start'
                        }}
                        onClick={handleSubmit}
                        disabled={loading || uploading}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'white')}
                    >
                        {loading ? '...' : (
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        )}
                    </button>
                </div>
            </section>
        </div>
    );
};
