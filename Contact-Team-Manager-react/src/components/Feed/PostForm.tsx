import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useMentions } from '../../hooks/useMentions';
import { useProfiles, useTags, useTeams, useTeamMembers } from '../../hooks/useSupabase';
import { useOneDriveUpload } from '../../hooks/useOneDriveUpload';
import { MentionList } from '../common/MentionList';

import { initializeMsal } from '../../lib/microsoftGraph';

interface PostFormProps {
    teamId: number | string | null;
    onSuccess?: () => void;
    onCancel?: () => void;
}

export const PostForm: React.FC<PostFormProps> = ({ teamId, onSuccess, onCancel }) => {
    const { user, profile } = useAuth();
    const [title, setTitle] = useState('');
    const [remindAt, setRemindAt] = useState('');
    const [loading, setLoading] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);

    const { profiles } = useProfiles();
    const { tags } = useTags();
    const { teams } = useTeams();

    // New hook interface
    const {
        attachments,
        uploading,
        statusMessage,
        uploadFile,
        removeFile,
        clearFiles,
        isAuthenticated,
        login,
        pendingFiles
    } = useOneDriveUpload();

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingPastes, setPendingPastes] = useState<File[]>([]);

    const { members: teamMembers } = useTeamMembers(teamId);
    const memberIds = React.useMemo(() => 
        teamId ? teamMembers.map(m => m.user_id) : undefined
    , [teamMembers, teamId]);

    const {
        isOpen,
        candidates,
        activeIndex,
        mentionPosition,
        mentionCoords,
        handleInput,
        handleKeyDown,
        insertMention,
    } = useMentions({ profiles, tags, currentTeamId: teamId, teams, memberIds });

    // Ensure MSAL is initialized on mount so we can check it synchronously later
    React.useEffect(() => {
        initializeMsal().catch(console.error);
    }, []);

    // Auto-upload pending pastes after login
    React.useEffect(() => {
        if (isAuthenticated && pendingPastes.length > 0) {
            const uploadPending = async () => {
                const files = [...pendingPastes];
                setPendingPastes([]);
                for (const file of files) {
                    await uploadFile(file);
                }
            };
            uploadPending();
        }
    }, [isAuthenticated, pendingPastes, uploadFile]);

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
                    attachments: attachments.length > 0 ? attachments : null,
                    remind_at: remindAt ? new Date(remindAt).toISOString() : null
                }
            ]).select();

            if (error) throw error;

            setTitle('');
            setRemindAt('');
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

        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const [isLoggingIn, setIsLoggingIn] = React.useState(false);
    const [selectedPreviewUrl, setSelectedPreviewUrl] = React.useState<string | null>(null);

    const handleAttachClick = async () => {
        if (isAuthenticated) {
            fileInputRef.current?.click();
        } else {
            setIsLoggingIn(true);
            try {
                const account = await login();
                if (account) {
                    fileInputRef.current?.click();
                }
            } finally {
                setIsLoggingIn(false);
            }
        }
    };

    return (
        <div className="static-form-container">
            <section className="form-container compact-form" style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                {/* 左側: 入力エリア */}
                <div className="post-form-main-wrapper" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* 1行目: 件名とリマインド */}
                    <div className="post-form-row-1" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="text"
                            className="input-field post-subject-input"
                            placeholder="件名を追加してください"
                            style={{ margin: 0, flex: 1 }}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={loading}
                        />
                        <div className="post-remind-container" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <input
                                type="datetime-local"
                                value={remindAt}
                                onChange={(e) => setRemindAt(e.target.value)}
                                className="input-field"
                                style={{
                                    margin: 0,
                                    padding: '0 8px',
                                    height: '36px',
                                    fontSize: '0.8rem',
                                    flex: 1,
                                    color: remindAt ? 'var(--text-main)' : 'var(--text-muted)'
                                }}
                                title="リマインド日時を設定"
                                disabled={loading}
                            />
                            {remindAt && (
                                <button
                                    type="button"
                                    onClick={() => setRemindAt('')}
                                    title="リマインドをリセット"
                                    style={{
                                        background: 'rgba(255,255,255,0.06)',
                                        border: '1px solid rgba(255,255,255,0.15)',
                                        color: 'var(--text-muted)',
                                        borderRadius: '6px',
                                        width: '36px',
                                        height: '36px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        flexShrink: 0
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="1 4 1 10 7 10"></polyline>
                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
                                    </svg>
                                </button>
                            )}
                        </div>

                        {/* Clip Button moved here */}
                        <div className="post-clip-container" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            {uploading && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', animation: 'fadeIn 0.2s' }}>
                                    {statusMessage}
                                </span>
                            )}
                            <button
                                type="button"
                                className="btn btn-clip-yellow"
                                title="ファイル添付"
                                style={{
                                    padding: 0,
                                    width: '32px',
                                    height: '32px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    opacity: uploading ? 0.7 : 1,
                                    cursor: uploading ? 'default' : 'pointer',
                                    borderRadius: '50%'
                                }}
                                disabled={loading || uploading}
                                onClick={handleAttachClick}
                            >
                                {uploading ? (
                                    <div className="spinner-small" style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                ) : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* 2行目: 本文入力エリアと送信ボタン */}
                    <div className="post-form-row-2" style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flex: 1 }}>
                        <div className="post-content-container" style={{ position: 'relative', flex: 1 }}>
                            <div
                                ref={contentRef}
                                contentEditable
                                className="input-field rich-editor"
                                data-placeholder="新しい会話を開始します。@ を入力して、誰かにメンションしてください。"
                                style={{
                                    marginTop: 0,
                                    minHeight: '80px',
                                    width: '100%',
                                    border: '1px solid rgba(255, 255, 255, 0.5)',
                                    background: 'rgba(0, 0, 0, 0.2)',
                                    color: 'white',
                                    borderRadius: '4px',
                                    padding: '8px 12px'
                                }}
                                onInput={(e) => {
                                    handleInput(e, 'post-form');
                                }}
                                onKeyDown={(e) => {
                                    handleKeyDown(e, 'post-form', e.currentTarget);
                                    if (isOpen) {
                                        if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(e.key)) {
                                            return;
                                        }
                                    }
                                }}
                                onPaste={(e: React.ClipboardEvent) => {
                                    const items = e.clipboardData.items;
                                    let hasImage = false;

                                    for (let i = 0; i < items.length; i++) {
                                        if (items[i].type.indexOf('image') !== -1) {
                                            const blob = items[i].getAsFile();
                                            if (blob) {
                                                if (isAuthenticated) {
                                                    uploadFile(blob);
                                                } else {
                                                    setPendingPastes(prev => [...prev, blob]);
                                                }
                                                hasImage = true;
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
                            {pendingPastes.length > 0 && !isAuthenticated && (
                                <div style={{ 
                                    marginTop: '8px', 
                                    padding: '10px', 
                                    background: 'rgba(255, 193, 7, 0.1)', 
                                    border: '1px solid rgba(255, 193, 7, 0.3)', 
                                    borderRadius: '8px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
                                }}>
                                    <span style={{ fontSize: '0.85rem', color: '#ffc107' }}>
                                        画像がペーストされました。アップロードを完了するには Microsoft 連携が必要です。
                                    </span>
                                    <button 
                                        type="button" 
                                        className="btn btn-sm" 
                                        style={{ background: '#ffc107', color: 'black' }}
                                        onClick={() => login()}
                                    >
                                        ログインしてアップロード
                                    </button>
                                </div>
                            )}

                            {(attachments.length > 0 || pendingFiles.length > 0) && (
                                <div className="attachment-preview-area" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
                                    {/* Uploaded files */}
                                    {attachments.map((att, index) => (
                                        <div key={`att-${index}`} className="attachment-item" style={{ position: 'relative', width: '200px', height: '150px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer' }} onClick={() => setSelectedPreviewUrl(att.downloadUrl || att.thumbnailUrl || null)}>
                                            {att.type.startsWith('image/') ? (
                                                <img src={att.thumbnailUrl || att.downloadUrl} alt={att.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} title="クリックで拡大表示" />
                                            ) : (
                                                <span style={{ fontSize: '20px' }}>📄</span>
                                            )}
                                            <div
                                                className="attachment-remove"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeFile(index);
                                                }}
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
                                                    fontSize: '12px',
                                                    zIndex: 2
                                                }}
                                            >
                                                ×
                                            </div>
                                        </div>
                                    ))}
                                    {/* Pending files (uploading) */}
                                    {pendingFiles.map((pf) => (
                                        <div key={`pending-${pf.id}`} className="attachment-item uploading" style={{ position: 'relative', width: '200px', height: '150px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--primary-light)', cursor: 'pointer' }} onClick={() => setSelectedPreviewUrl(pf.previewUrl)}>
                                            {pf.file.type.startsWith('image/') ? (
                                                <img src={pf.previewUrl} alt={pf.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} title="クリックで拡大表示" />
                                            ) : (
                                                <span style={{ fontSize: '20px', opacity: 0.6 }}>📄</span>
                                            )}
                                            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 1 }}>
                                                <div className="spinner-small" style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                            </div>
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.4)', color: 'white', fontSize: '0.6rem', padding: '2px', textAlign: 'center' }}>
                                                アップロード中...
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
                                        top: mentionCoords.top + (mentionPosition === 'top' ? -5 : 5),
                                        left: mentionCoords.left,
                                        position: 'fixed',
                                        transform: mentionPosition === 'top' ? 'translateY(-100%)' : 'none'
                                    }}
                                />
                            )}
                        </div>

                        {/* Send button (Airplane) moved here */}
                        <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '4px' }}>
                            <button
                                type="button"
                                className="btn-send-blue"
                                title="投稿"
                                style={{
                                    padding: 0,
                                    width: '32px',
                                    height: '32px',
                                    flexShrink: 0,
                                    cursor: 'pointer',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                onClick={handleSubmit}
                                disabled={loading || uploading}
                            >
                                {loading ? '...' : (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="22" y1="2" x2="11" y2="13"></line>
                                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* 下部: キャンセルボタン（必要な場合のみ） */}
                    {onCancel && (
                        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: '4px' }}>
                            <button type="button" className="btn btn-secondary" onClick={onCancel} style={{ padding: '6px 16px', borderRadius: '4px', fontSize: '0.8rem', border: '1px solid rgba(255,255,255,0.2)', backgroundColor: 'transparent', color: 'white', cursor: 'pointer' }}>
                                キャンセル
                            </button>
                        </div>
                    )}
                </div>

                <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    multiple
                    onChange={handleFileChange}
                    disabled={loading || uploading}
                />

                {/* Login Overlay */}
                {isLoggingIn && (
                    <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        backdropFilter: 'blur(5px)'
                    }}>
                        <div className="spinner-large" style={{
                            width: '50px',
                            height: '50px',
                            border: '4px solid rgba(255,255,255,0.3)',
                            borderTopColor: '#0078d4',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginBottom: '20px'
                        }}></div>
                        <h3 style={{ color: 'white', marginBottom: '10px' }}>Microsoftへログイン中...</h3>
                        <p style={{ color: 'rgba(255,255,255,0.8)' }}>ポップアップウィンドウでログインしてください</p>
                    </div>
                )}
            </section>
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
