import React, { useState, useEffect } from 'react';
import { useTeams, useUserMemberships } from '../../hooks/useSupabase';
import { useAuth } from '../../hooks/useAuth';

export interface TeamsSidebarProps {
    currentTeamId: number | string | null;
    onSelectTeam: (id: number | string | null) => void;
    viewMode: 'feed' | 'dashboard';
    onSelectDashboard: () => void;
    statusFilter: 'all' | 'pending' | 'completed' | 'mentions' | 'myposts';
    onSelectStatus: (status: 'all' | 'pending' | 'completed' | 'mentions' | 'myposts') => void;
    onEditTeam: (teamId: number) => void;
    unreadTeams?: Set<string>;
}

export const TeamsSidebar: React.FC<TeamsSidebarProps> = ({
    currentTeamId,
    onSelectTeam,
    viewMode,
    onSelectDashboard,
    statusFilter,
    onSelectStatus,
    onEditTeam,
    unreadTeams = new Set()
}) => {
    const { profile } = useAuth();
    const { teams: rawTeams, loading } = useTeams();
    const { user } = useAuth();
    const { memberships } = useUserMemberships(user?.id);
    const [sortedTeams, setSortedTeams] = useState<typeof rawTeams>([]);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

    // Toggle team expansion
    const toggleTeam = (teamId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedTeams(prev => {
            const next = new Set(prev);
            if (next.has(teamId)) {
                next.delete(teamId);
            } else {
                next.add(teamId);
            }
            return next;
        });
    };

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


    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
    };



    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (draggedId === null || String(draggedId) === String(targetId) || !user) {
            setDraggedId(null);
            return;
        }

        console.log(`[TeamsSidebar] Dropping ${draggedId} on ${targetId}`);

        const oldIndex = sortedTeams.findIndex(t => String(t.id) === String(draggedId));
        const newIndex = sortedTeams.findIndex(t => String(t.id) === String(targetId));

        if (oldIndex > -1 && newIndex > -1) {
            // Determine if drop was on top or bottom half of the HEADER area
            const header = e.currentTarget.querySelector('.team-item-header');
            const rect = header ? header.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
            const offsetY = e.clientY - rect.top;

            // Simpler splice:
            const resultOrder = [...sortedTeams];
            const [removed] = resultOrder.splice(oldIndex, 1);

            // Re-calculate newIndex if oldIndex was before it
            const adjustedNewIndex = resultOrder.findIndex(t => String(t.id) === String(targetId));
            const targetPos = (offsetY < rect.height / 2) ? adjustedNewIndex : adjustedNewIndex + 1;

            resultOrder.splice(targetPos, 0, removed);

            console.log(`[TeamsSidebar] Reordering: old=${oldIndex}, targetPos=${targetPos}`);

            setSortedTeams(resultOrder);

            const idOrder = resultOrder.map(t => String(t.id));
            localStorage.setItem(`team_order_${user.id}`, JSON.stringify(idOrder));
        }
        setDraggedId(null);
    };

    if (loading) {
        return <div style={{ padding: '20px', color: 'var(--text-muted)' }}>Loading teams...</div>;
    }

    const renderTeamIcon = (team: any) => {
        if (team.avatar_url) {
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
        <div className="teams-sidebar">
            <div className="teams-list">
                {/* Dashboard Link - All Users */}
                {profile && (
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
                )}

                {profile && <div className="sidebar-divider"></div>}

                {/* Global (All Teams) - Admin Only */}
                {profile?.role === 'Admin' && (
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
                )}

                {profile?.role === 'Admin' && <div className="sidebar-divider"></div>}

                {/* Tree Rendering */}
                {(() => {
                    const isAdmin = profile?.role === 'Admin';
                    const myTeamIds = memberships.map(m => m.team_id);
                    const visibleTeamIds = new Set(myTeamIds);
                    if (!isAdmin) {
                        myTeamIds.forEach(id => {
                            const team = rawTeams.find(t => t.id === id);
                            if (team && team.parent_id) {
                                visibleTeamIds.add(team.parent_id);
                            }
                        });
                    }

                    const visibleTeams = sortedTeams.filter(t => isAdmin || visibleTeamIds.has(String(t.id)));

                    const roots = visibleTeams.filter(t => !t.parent_id);
                    const childrenMap: { [parentId: string]: any[] } = {};
                    visibleTeams.forEach(t => {
                        if (t.parent_id) {
                            if (!childrenMap[String(t.parent_id)]) childrenMap[String(t.parent_id)] = [];
                            childrenMap[String(t.parent_id)].push(t);
                        }
                    });

                    const renderTeamItem = (team: any, isChannel = false) => {
                        const hasChildren = childrenMap[String(team.id)]?.length > 0;
                        // Expand if explicitly in expandedTeams OR if this team is currently selected
                        const isExpanded = expandedTeams.has(String(team.id)) || (!isChannel && currentTeamId === team.id);

                        return (
                            <div
                                key={team.id}
                                className={`team-list-item ${currentTeamId === team.id ? 'active' : ''}`}
                                title={team.name}
                                draggable={true}
                                onDragStart={(e) => {
                                    e.stopPropagation();
                                    handleDragStart(e, team.id);
                                }}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.dataTransfer.dropEffect = 'move';

                                    const header = e.currentTarget.querySelector('.team-item-header');
                                    if (!header) return;

                                    const rect = header.getBoundingClientRect();
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
                                    e.stopPropagation();
                                    e.currentTarget.style.borderTop = 'none';
                                    e.currentTarget.style.borderBottom = 'none';
                                    handleDrop(e, team.id);
                                }}
                                style={{
                                    opacity: draggedId === team.id ? 0.5 : 1,
                                    transition: 'border 0.1s',
                                    borderTop: '2px solid transparent',
                                    borderBottom: '2px solid transparent',
                                    position: 'relative',
                                    paddingLeft: 0
                                }}
                            >
                                <div className="team-item-header" onClick={(e) => {
                                    if (hasChildren) {
                                        toggleTeam(team.id, e);
                                    } else if (!isChannel && currentTeamId === team.id) {
                                        toggleTeam(team.id, e);
                                    } else if (!isChannel) {
                                        if (!isExpanded) toggleTeam(team.id, e);
                                        onSelectTeam(team.id);
                                    } else {
                                        onSelectTeam(team.id);
                                    }
                                }}>
                                    {!isChannel && renderTeamIcon(team)}
                                    <span className="team-name-label" style={{
                                        flex: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        fontSize: isChannel ? '0.9rem' : '0.9rem',
                                        color: (isChannel || hasChildren) ? 'var(--text-muted)' : 'var(--text-main)',
                                        fontWeight: (isChannel && unreadTeams.has(String(team.id))) ? 700 : (isChannel ? 400 : 600),
                                        whiteSpace: 'nowrap',
                                        paddingLeft: isChannel ? '16px' : '0'
                                    }}>
                                        {isChannel ? `# ${team.name}` : team.name}
                                    </span>

                                    {(hasChildren || (!isChannel && currentTeamId === team.id)) && (
                                        <div
                                            className="team-expand-chevron"
                                            style={{
                                                marginRight: '8px',
                                                transition: 'transform 0.2s',
                                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                                color: 'var(--text-muted)',
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="9 18 15 12 9 6"></polyline>
                                            </svg>
                                        </div>
                                    )}

                                    {isManagerOrAdmin && (
                                        <div
                                            className="team-settings-icon"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onEditTeam(team.id);
                                            }}
                                            title="設定"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <circle cx="12" cy="12" r="3"></circle>
                                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                                            </svg>
                                        </div>
                                    )}
                                </div>

                                {isExpanded && (
                                    <div className="sidebar-submenu-container">
                                        {currentTeamId === team.id && !isChannel && (
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

                                        {childrenMap[String(team.id)] && (
                                            <div className="sidebar-submenu children-list">
                                                {childrenMap[String(team.id)].map(child => renderTeamItem(child, true))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    };

                    return roots.map(root => renderTeamItem(root));
                })()}

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

                <a
                    href="https://kueda-ship-it.github.io/totalling-data/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="team-list-item"
                    title="Log Analysis Dashboard"
                    style={{ textDecoration: 'none' }}
                >
                    <div className="team-item-header">
                        <div className="team-icon" style={{ background: '#2B2D31', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                        </div>
                        <span className="team-name-label">Log Analysis Dashboard</span>
                    </div>
                </a>
            </div>
        </div>
    );
};
