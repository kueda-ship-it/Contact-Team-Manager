import React, { useState } from 'react';

interface ReactionPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '😊', '🎉', '👏', '🔥', '✅', '💯'];

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onSelect, onClose }) => {
    return (
        <div
            className="reaction-picker"
            style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                background: 'var(--bg-elevated, #2b2d31)', // Solid background
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                gap: '4px',
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
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
                        fontSize: '20px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        transition: 'background 0.2s'
                    }}
                    onClick={() => {
                        onSelect(emoji);
                        onClose();
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--hover-bg)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    {emoji}
                </button>
            ))}
        </div>
    );
};

interface ReactionBarProps {
    reactions: Array<{
        id: string;
        emoji: string;
        user_id: string;
    }>;
    profiles: any[];
    currentUserId?: string;
    onAdd: (emoji: string) => void;
    onRemove: (reactionId: string) => void;
    style?: React.CSSProperties;
}

export const ReactionBar: React.FC<ReactionBarProps> = ({
    reactions,
    profiles,
    currentUserId,
    onAdd,
    onRemove,
    style
}) => {
    const [showPicker, setShowPicker] = useState(false);

    // Group reactions by emoji
    const groupedReactions = reactions.reduce((acc, reaction) => {
        if (!acc[reaction.emoji]) {
            acc[reaction.emoji] = [];
        }
        acc[reaction.emoji].push(reaction);
        return acc;
    }, {} as Record<string, typeof reactions>);

    const handleReactionClick = (emoji: string, reactionsByEmoji: typeof reactions) => {
        const userReaction = reactionsByEmoji.find(r => r.user_id === currentUserId);
        if (userReaction) {
            onRemove(userReaction.id);
        } else {
            onAdd(emoji);
        }
    };

    const getReactionTooltip = (reactionList: typeof reactions) => {
        return reactionList.map(r => {
            const profile = profiles.find(p => p.id === r.user_id);
            return profile?.display_name || profile?.email || 'Unknown';
        }).join(', ');
    };

    return (
        <div
            className="reaction-bar"
            style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', position: 'relative', ...style }}
            onMouseLeave={() => setShowPicker(false)}
        >
            {Object.entries(groupedReactions).map(([emoji, reactionList]) => {
                const hasUserReacted = reactionList.some(r => r.user_id === currentUserId);
                const tooltipNames = getReactionTooltip(reactionList);

                return (
                    <button
                        key={emoji}
                        className={`reaction-bubble ${hasUserReacted ? 'user-reacted' : ''}`}
                        style={{
                            background: hasUserReacted ? '#004578' : 'var(--bg-tertiary)',
                            border: `1.5px solid ${hasUserReacted ? '#0078D4' : 'var(--border-color)'}`,
                            boxShadow: hasUserReacted ? '0 0 10px rgba(0, 120, 212, 0.4)' : 'none',
                            borderRadius: '12px',
                            padding: '2px 8px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            transition: 'all 0.2s',
                            color: hasUserReacted ? '#fff' : 'var(--text-main)'
                        }}
                        onClick={() => handleReactionClick(emoji, reactionList)}
                        title={tooltipNames}
                    >
                        <span>{emoji}</span>
                        <span style={{ fontSize: '11px', color: hasUserReacted ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)' }}>
                            {reactionList.length}
                        </span>
                    </button>
                );
            })}

            <div style={{ position: 'relative' }}>
                <button
                    className="add-reaction-btn"
                    style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        fontSize: '14px',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        transition: 'all 0.2s',
                        display: 'grid',
                        placeItems: 'center',
                        lineHeight: '1',
                        padding: '0'
                    }}
                    onClick={() => setShowPicker(!showPicker)}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--accent)';
                        e.currentTarget.style.color = 'var(--accent)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                        e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                >
                    +
                </button>
                {showPicker && (
                    <ReactionPicker
                        onSelect={onAdd}
                        onClose={() => setShowPicker(false)}
                    />
                )}
            </div>
        </div>
    );
};
