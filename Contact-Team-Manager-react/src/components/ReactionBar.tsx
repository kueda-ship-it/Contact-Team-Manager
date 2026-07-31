import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ReactionPickerProps {
    anchorRef: React.RefObject<HTMLElement | null>;
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '🎉', '🔥', '😂', '😢', '😮', '🙏', '💪', '✅', '👀', '🫡'];

// 返信は overflow-y:auto の .reply-scroll-area 内にあり、絶対配置だと
// スクロール枠でピッカーが切れるため、DotMenu と同じ Portal + fixed で描画する。
export const ReactionPicker: React.FC<ReactionPickerProps> = ({ anchorRef, onSelect, onClose }) => {
    const pickerRef = useRef<HTMLDivElement | null>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    const calcPosition = useCallback(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        const w = pickerRef.current?.offsetWidth || 250;
        const h = pickerRef.current?.offsetHeight || 100;
        const openDown = rect.top < h + 12;
        const top = openDown ? rect.bottom + 6 : rect.top - h - 6;
        const left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left));
        setPos(prev => (prev && prev.top === top && prev.left === left) ? prev : { top, left });
    }, [anchorRef]);

    useLayoutEffect(() => {
        calcPosition();
    }, [calcPosition]);

    useEffect(() => {
        const onPointerDown = (e: PointerEvent | MouseEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            if (pickerRef.current?.contains(target)) return;
            if (anchorRef.current?.contains(target)) return;
            onClose();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        const onReposition = () => calcPosition();

        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', onReposition);
        window.addEventListener('scroll', onReposition, true);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
        };
    }, [calcPosition, onClose, anchorRef]);

    return createPortal(
        <div
            ref={pickerRef}
            className="reaction-picker"
            style={{
                position: 'fixed',
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                background: '#1F1E1D',
                border: '1px solid rgba(232, 81, 255, 0.3)',
                borderRadius: '8px',
                padding: '6px',
                display: 'grid',
                gridTemplateColumns: 'repeat(6, 1fr)',
                gap: '4px',
                zIndex: 100000,
                boxShadow: '0 4px 15px rgba(232, 81, 255, 0.2)'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {COMMON_EMOJIS.map(emoji => (
                <button
                    key={emoji}
                    className="emoji-btn"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#e851ff',
                        cursor: 'pointer',
                        padding: '8px',
                        borderRadius: '6px',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    onClick={() => {
                        onSelect(emoji);
                        onClose();
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(232, 81, 255, 0.1)';
                        e.currentTarget.style.transform = 'scale(1.1)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.transform = 'scale(1)';
                    }}
                >
                    <span style={{ fontSize: '20px' }}>{emoji}</span>
                </button>
            ))}
        </div>,
        document.body
    );
};

interface ReactionBarProps {
    reactions: Array<{
        id: string;
        emoji: string;
        profile_id: string;
    }>;
    profiles: any[];
    currentUserId?: string;
    currentProfile?: any;
    onAdd: (emoji: string) => void;
    onRemove: (reactionId: string) => void;
    style?: React.CSSProperties;
}

export const ReactionBar: React.FC<ReactionBarProps> = (props) => {
    const {
        reactions,
        profiles,
        currentUserId,
        currentProfile,
        onAdd,
        onRemove,
        style
    } = props;
    const [showPicker, setShowPicker] = useState(false);
    const plusBtnRef = useRef<HTMLButtonElement | null>(null);

    const groupedReactions = reactions.reduce((acc, reaction) => {
        if (!acc[reaction.emoji]) {
            acc[reaction.emoji] = [];
        }
        acc[reaction.emoji].push(reaction);
        return acc;
    }, {} as Record<string, typeof reactions>);

    const handleReactionClick = (emoji: string, reactionsByEmoji: typeof reactions) => {
        const userReaction = reactionsByEmoji.find(r => r.profile_id === currentUserId);
        if (userReaction) {
            onRemove(userReaction.id);
        } else {
            onAdd(emoji);
        }
    };

    const getReactionTooltip = (reactionList: typeof reactions) => {
        return reactionList.map(r => {
            const profile = profiles.find(p => p.id === r.profile_id);
            if (profile) return profile.display_name || profile.email;
            if (currentUserId && r.profile_id === currentUserId && currentProfile) {
                return currentProfile.display_name || currentProfile.email || 'You';
            }
            return 'Unknown';
        }).join(', ');
    };

    return (
        <div
            className="reaction-bar"
            style={Object.assign({ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', position: 'relative' }, style || {})}
        >
            {Object.entries(groupedReactions).map(([emoji, reactionList]) => {
                const hasUserReacted = reactionList.some(r => r.profile_id === currentUserId);
                const tooltipNames = getReactionTooltip(reactionList);

                return (
                    <button
                        key={emoji}
                        className={`reaction-bubble ${hasUserReacted ? 'user-reacted' : ''}`}
                        style={{
                            borderRadius: '20px',
                            padding: '4px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            transformOrigin: 'center'
                        }}
                        onClick={() => handleReactionClick(emoji, reactionList)}
                        title={tooltipNames}
                    >
                        <span style={{ display: 'flex', alignItems: 'center', fontSize: '14px' }}>
                            {emoji}
                        </span>
                        <span style={{
                            fontSize: '11px',
                            fontWeight: '700'
                        }}>
                            {reactionList.length}
                        </span>
                    </button>
                );
            })}

            <button
                ref={plusBtnRef}
                className="reaction-bubble"
                style={{
                    borderRadius: '20px',
                    width: '32px',
                    height: '24px',
                    cursor: 'pointer',
                    display: 'grid',
                    placeItems: 'center',
                    padding: '0',
                    opacity: 0.8
                }}
                onClick={() => setShowPicker(!showPicker)}
            >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
            </button>
            {showPicker && (
                <ReactionPicker
                    anchorRef={plusBtnRef}
                    onSelect={onAdd}
                    onClose={() => setShowPicker(false)}
                />
            )}
        </div>
    );
};
