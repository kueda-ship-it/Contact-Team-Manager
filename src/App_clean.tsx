import { useState } from 'react';
import './styles/style.css';
import { TeamsSidebar } from './components/Sidebar/TeamsSidebar';
import { RightSidebar } from './components/Sidebar/RightSidebar';
import { ThreadList } from './components/Feed/ThreadList';
import { PostForm } from './components/Feed/PostForm';
import { SettingsModal } from './components/Settings/SettingsModal';
import { Dashboard } from './components/Dashboard/Dashboard';
import { Login } from './components/Login';
import { useAuth } from './hooks/useAuth';
import { useThreads, useTeams, useUserMemberships, useUnreadCounts } from './hooks/useSupabase';
import { useEffect } from 'react';

function App() {
    const { user, profile, loading: authLoading, signOut } = useAuth();

    const [currentTeamId, setCurrentTeamId] = useState<number | string | null>(null);
    const [viewMode, setViewMode] = useState<'feed' | 'dashboard'>('feed');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'mentions'>('all');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { threads, loading: threadsLoading, error: threadsError, refetch } = useThreads(currentTeamId as any);
    const { teams } = useTeams();
    const { memberships, loading: membershipsLoading, updateLastRead } = useUserMemberships(user?.id);
    const { unreadTeams } = useUnreadCounts(user?.id, memberships);

    // Redirect non-admins to their first team if no team is selected
    useEffect(() => {
        if (!authLoading && !membershipsLoading && user && profile?.role !== 'Admin' && currentTeamId === null) {
            if (memberships.length > 0) {
                console.log('Redirecting non-admin to first team:', memberships[0].team_id);
                setCurrentTeamId(memberships[0].team_id);
            }
        }
    }, [user, profile, memberships, membershipsLoading, authLoading, currentTeamId]);

    // Update last_read_at when currentTeamId changes
    useEffect(() => {
        if (currentTeamId) {
            updateLastRead(String(currentTeamId));
        }
    }, [currentTeamId]);

    // Title flashing for unread messages
    useEffect(() => {
        let interval: any;
        if (unreadTeams.size > 0) {
            const originalTitle = document.title;
            let showUnread = true;
            interval = setInterval(() => {
                document.title = showUnread ? `(${unreadTeams.size}) 新着メッセージあり` : originalTitle;
                showUnread = !showUnread;
            }, 1000);
        } else {
            document.title = 'Contact Team Manager';
        }
        return () => {
            if (interval) clearInterval(interval);
            document.title = 'Contact Team Manager';
        };
    }, [unreadTeams]);

    console.log('App state:', { currentTeamId, viewMode, threadsCount: threads.length });

    // Helper to get current team name
    const currentTeam = teams.find(t => String(t.id) === String(currentTeamId));
    const currentTeamName = currentTeam?.name || 'チーム未選択';

    if (authLoading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100vh',
                background: 'var(--bg-primary)'
            }}>
                <div style={{ color: 'var(--text-main)' }}>Loading...</div>
            </div>
        );
    }

    if (!user) {
        return <Login />;
    }

    return (
        <div className="app-container">
            <TeamsSidebar
                teams={teams}
                memberships={memberships}
                currentTeamId={currentTeamId}
                onSelectTeam={setCurrentTeamId}
                onOpenSettings={() => setIsSettingsOpen(true)}
                unreadTeams={unreadTeams}
            />
            <main className="main-content">
                {viewMode === 'feed' && (
                    <>
                        <PostForm
                            teamId={currentTeamId}
                            onSuccess={() => refetch(true)}
                        />
                        <div style={{ padding: '0 15px 10px 15px' }}>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                <button
                                    className={statusFilter === 'all' ? 'filter-btn active' : 'filter-btn'}
                                    onClick={() => setStatusFilter('all')}
                                >
                                    すべて
                                </button>
                                <button
                                    className={statusFilter === 'pending' ? 'filter-btn active' : 'filter-btn'}
                                    onClick={() => setStatusFilter('pending')}
                                >
                                    未完了
                                </button>
                                <button
                                    className={statusFilter === 'completed' ? 'filter-btn active' : 'filter-btn'}
                                    onClick={() => setStatusFilter('completed')}
                                >
                                    完了
                                </button>
                                <button
                                    className={statusFilter === 'mentions' ? 'filter-btn active' : 'filter-btn'}
                                    onClick={() => setStatusFilter('mentions')}
                                >
                                    メンション
                                </button>
                            </div>
                        </div>
                        <ThreadList
                            currentTeamId={currentTeamId}
                            threads={threads}
                            loading={threadsLoading}
                            error={threadsError}
                            refetch={refetch}
                            statusFilter={statusFilter}
                        />
                    </>
                )}
                {viewMode === 'dashboard' && (
                    <Dashboard selectedTeamId={currentTeamId} />
                )}
            </main>
            <RightSidebar
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                currentTeamName={currentTeamName}
            />
            {isSettingsOpen && (
                <SettingsModal onClose={() => setIsSettingsOpen(false)} />
            )}
        </div>
    );
}

export default App;
