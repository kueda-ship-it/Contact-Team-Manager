import React, { useState, useEffect } from 'react';
import { useTeams } from '../../hooks/useSupabase';
import { useAuth } from '../../hooks/useAuth';

interface TeamsSidebarProps {
    currentTeamId: number | null;
    onSelectTeam: (id: number | null) => void;
    viewMode: 'feed' | 'dashboard';
    onSelectDashboard: () => void;
    statusFilter: 'all' | 'pending' | 'completed' | 'mentions';
    onSelectStatus: (status: 'all' | 'pending' | 'completed' | 'mentions') => void;
    onEditTeam: (teamId: number) => void;
}

export const TeamsSidebar: React.FC<TeamsSidebarProps> = ({
    currentTeamId,
    onSelectTeam,
    viewMode,
    onSelectDashboard,
    statusFilter,
    onSelectStatus,
    onEditTeam
}) => {
    const { teams: rawTeams, loading } = useTeams();
    const { user, profile } = useAuth();
    const [sortedTeams, setSortedTeams] = useState<typeof rawTeams>([]);
    const [draggedId, setDraggedId] = useState<number | null>(null);

    // Initial Sort based on LocalStorage
    useEffect(() => {
        if (!user || rawTeams.length === 0) {
            setSortedTeams(rawTeams);
            return;
        }

        const savedOrderStr = localStorage.getItem(`team_order_${user.id}`);
        if (savedOrderStr) {
            try {
                const savedOrder: string[] = JSON.parse(savedOrderStr);
                const sorted = [...rawTeams].sort((a, b) => {
                    const idxA = savedOrder.indexOf(String(a.id));
                    const idxB = savedOrder.indexOf(String(b.id));

                    if (idxA === -1 && idxB === -1) return 0;
                    if (idxA === -1) return 1;
                    if (idxB === -1) return -1;
                    return idxA - idxB;
                });
                setSortedTeams(sorted);
            } catch (e) {
                console.error("Failed to parse team order", e);
                setSortedTeams(rawTeams);
            }
        } else {
            setSortedTeams(rawTeams);
        }
    }, [rawTeams, user]);


    const handleDragStart = (e: React.DragEvent, id: number) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
        // Optional: set custom drag image
    };



    const handleDrop = (e: React.DragEvent, targetId: number) => {
        e.preventDefault();
        if (draggedId === null || draggedId === targetId || !user) return;

        const oldIndex = sortedTeams.findIndex(t => t.id === draggedId);
        const newIndex = sortedTeams.findIndex(t => t.id === targetId);

        if (oldIndex > -1 && newIndex > -1) {
            const newOrder = [...sortedTeams];
            // Remove dragged item
            const [movedItem] = newOrder.splice(oldIndex, 1);
            // Insert at new position
            newOrder.splice(newIndex, 0, movedItem);

            setSortedTeams(newOrder);

            // Save to LocalStorage
            const idOrder = newOrder.map(t => String(t.id));
            localStorage.setItem(`team_order_${user.id}`, JSON.stringify(idOrder));
        }
        setDraggedId(null);
    };

    if (loading) {
        return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading teams...</div>;
    }

    const renderTeamIcon = (team: any) => {
        if (team.avatar_url) {
            // Check if it's Base64 or URL
            return (
                <div className="team-icon" style={{ padding: 0, overflow: 'hidden', background: 'transparent' }}>
                    <img
                        src={team.avatar_url}
                        alt={team.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                </div>
            );
        }
        return (
            <div className="team-icon" style={{ background: team.icon_color || '#313338' }}>
                {team.icon || team.name.charAt(0).toUpperCase()}
            </div>
        );
    };

    const isManagerOrAdmin = profile?.role === 'Admin' || profile?.role === 'Manager';

    return (
        <>
            {/* Dashboard Link */}
            <div
                className={`team-list-item ${viewMode === 'dashboard' ? 'active' : ''}`}
                title="ダッシュボード"
                onClick={onSelectDashboard}
            >
                <div className="team-item-header">
                    <div className="team-icon" style={{ background: '#2B2D31', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="7" height="9"></rect>
                            <rect x="14" y="3" width="7" height="5"></rect>
                            <rect x="14" y="12" width="7" height="9"></rect>
                            <rect x="3" y="16" width="7" height="5"></rect>
                        </svg>
                    </div>
                    <span className="team-name-label">ダッシュボード</span>
                </div>
            </div>

            <div className="sidebar-divider"></div>

            {/* Global (All Teams) */}
            <div
                className={`team-list-item ${currentTeamId === null ? 'active' : ''}`}
                title="すべてのチーム"
                onClick={() => onSelectTeam(null)}
            >
                <div className="team-item-header">
                    <div className="team-icon" style={{ background: 'linear-gradient(135deg, #FF6B6B, #FF8E53)', color: 'white' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                    </div>
                    <span className="team-name-label">すべてのチーム</span>
                </div>
            </div>

            <div className="sidebar-divider"></div>

            {sortedTeams.map(team => (
                <div
                    key={team.id}
                    className={`team-list-item ${currentTeamId === team.id ? 'active' : ''}`}
                    title={team.name}
                    draggable
                    onDragStart={(e) => handleDragStart(e, team.id)}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        const rect = e.currentTarget.getBoundingClientRect();
                        const offsetY = e.clientY - rect.top;
                        if (offsetY < rect.height / 2) {
                            e.currentTarget.style.borderTop = '2px solid var(--accent)';
                            e.currentTarget.style.borderBottom = 'none';
                        } else {
                            e.currentTarget.style.borderBottom = '2px solid var(--accent)';
                            e.currentTarget.style.borderTop = 'none';
                        }
                    }}
                    onDragLeave={(e) => {
                        e.currentTarget.style.borderTop = 'none';
                        e.currentTarget.style.borderBottom = 'none';
                    }}
                    onDrop={(e) => {
                        e.currentTarget.style.borderTop = 'none';
                        e.currentTarget.style.borderBottom = 'none';
                        handleDrop(e, team.id);
                    }}
                    style={{ opacity: draggedId === team.id ? 0.5 : 1, transition: 'all 0.2s', borderTop: '2px solid transparent', borderBottom: '2px solid transparent', position: 'relative' }}
                >
                    <div className="team-item-header" onClick={() => onSelectTeam(team.id)}>
                        {renderTeamIcon(team)}
                        <span className="team-name-label" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</span>
                        {isManagerOrAdmin && (
                            <div
                                className="team-settings-icon"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEditTeam(team.id);
                                }}
                                title="チーム設定"
                                style={{
                                    opacity: 0.5,
                                    cursor: 'pointer',
                                    marginLeft: 'auto',
                                    padding: '2px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="3"></circle>
                                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                </svg>
                            </div>
                        )}
                    </div>

                    {currentTeamId === team.id && (
                        <div className="sidebar-submenu">
                            <div
                                className={`sidebar-submenu-item ${statusFilter === 'all' ? 'active' : ''}`}
                                onClick={() => onSelectStatus('all')}
                            >
                                <span># 一般</span>
                            </div>
                            <div
                                className={`sidebar-submenu-item ${statusFilter === 'pending' ? 'active' : ''}`}
                                onClick={() => onSelectStatus('pending')}
                            >
                                <span># 未完了</span>
                            </div>
                            <div
                                className={`sidebar-submenu-item ${statusFilter === 'mentions' ? 'active' : ''}`}
                                onClick={() => onSelectStatus('mentions')}
                            >
                                <span># 自分宛て</span>
                            </div>
                        </div>
                    )}
                </div>
            ))}

            <div className="sidebar-divider"></div>

            <div className="team-list-item" title="チームを追加">
                <div className="team-item-header">
                    <div className="team-icon" style={{ border: '2px dashed #555', background: 'transparent', color: '#777' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </div>
                    <span className="team-name-label">チームを追加</span>
                </div>
            </div>

            <div className="sidebar-divider"></div>

            <a
                href="https://kueda-ship-it.github.io/Knowledge/"
                target="_blank"
                rel="noopener noreferrer"
                className="team-list-item"
                title="Knowledge"
                style={{ textDecoration: 'none' }}
            >
                <div className="team-item-header">
                    <div className="team-icon" style={{ background: '#2B2D31', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                        </svg>
                    </div>
                    <span className="team-name-label">Knowledge</span>
                </div>
            </a>
        </>
    );
};
