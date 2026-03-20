import React, { useState } from 'react';
import { useTagMembers } from '../../hooks/useSupabase';
import { CustomSelect } from '../common/CustomSelect';

interface TagMemberEditorProps {
    tagId: string | number;
    tagName: string;
    profiles: any[];
    onDelete: () => void;
}

export const TagMemberEditor: React.FC<TagMemberEditorProps> = ({ tagId, tagName, profiles, onDelete }) => {
    const { tagMembers, loading, addTagMember, removeTagMember } = useTagMembers(tagId);
    const [isExpanded, setIsExpanded] = useState(false);

    const memberUserIds = new Set(tagMembers.map(m => m.profile_id));
    const availableProfiles = profiles.filter(p => !memberUserIds.has(p.id));

    return (
        <div style={{
            borderRadius: '8px',
            border: '1px solid rgba(0,183,189,0.2)',
            background: 'rgba(0,183,189,0.05)',
            overflow: 'hidden',
            marginBottom: '8px'
        }}>
            {/* Tag Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    userSelect: 'none'
                }}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: '0.9rem' }}>#{tagName}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        ({tagMembers.length}人)
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', transition: 'transform 0.2s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                        ▶
                    </span>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px 6px', fontSize: '0.8rem' }}
                    title="タグを削除"
                >✕</button>
            </div>

            {/* Expanded Members Panel */}
            {isExpanded && (
                <div style={{ padding: '0 12px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* Add Member */}
                    <div style={{ marginTop: '10px', marginBottom: '10px' }}>
                        <CustomSelect
                            placeholder="メンバーを追加..."
                            options={[
                                { value: '', label: 'メンバーを追加...' },
                                ...availableProfiles.map(p => ({ value: p.id, label: p.display_name || p.email }))
                            ]}
                            value=""
                            onChange={async (val: string | number) => {
                                if (val) {
                                    try {
                                        await addTagMember(String(val));
                                    } catch (err: any) {
                                        alert('メンバーの追加に失敗しました: ' + err.message);
                                    }
                                }
                            }}
                            style={{ height: '32px' }}
                        />
                    </div>

                    {/* Member List */}
                    {loading ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>読み込み中...</div>
                    ) : tagMembers.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>メンバーがまだ追加されていません</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {tagMembers.map((m: any) => (
                                <div key={m.profile_id} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '4px 8px',
                                    background: 'rgba(255,255,255,0.03)',
                                    borderRadius: '4px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {m.profile?.avatar_url ? (
                                            <img src={m.profile.avatar_url} alt="" style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover' }} />
                                        ) : (
                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(0,183,189,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'var(--accent)' }}>
                                                {(m.profile?.display_name || '?')[0]}
                                            </div>
                                        )}
                                        <span style={{ fontSize: '0.85rem' }}>{m.profile?.display_name || 'Unknown'}</span>
                                    </div>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await removeTagMember(m.profile_id);
                                            } catch (err: any) {
                                                alert('メンバーの削除に失敗しました: ' + err.message);
                                            }
                                        }}
                                        style={{ background: 'none', border: 'none', color: 'var(--danger, #ff4444)', cursor: 'pointer', padding: '0 4px', fontSize: '0.8rem' }}
                                    >✕</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
