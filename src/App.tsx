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
    <>
      <header>
        <div
          className="logo"
          onClick={() => setViewMode('feed')}
          style={{ cursor: 'pointer' }}
          title="フィードに戻る"
        >
          <img src={`${import.meta.env.BASE_URL}favicon-v2.png`} alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }} />
          <span>Contact Team Manager</span>
        </div>
        <div className="header-search-container">
          <input type="text" className="input-field search-input" placeholder="検索 (CTRL+E)" />
        </div>
        <div className="user-profile">
          <button
            className="btn-icon settings-btn"
            title="設定"
            onClick={() => setIsSettingsOpen(true)}
            style={{
              marginRight: '10px',
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              transition: 'all 0.2s ease'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l-.15-.09a2 2 0 0 0-.73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          </button>
          <div className="avatar" style={{ width: '28px', height: '28px' }}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} /> : (profile?.display_name || user.email)?.[0]}
          </div>
          <div>
            <span className="username" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600 }}>
              {profile?.display_name || user.email}
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--accent)' }}>{profile?.role || 'User'}</span>
          </div>
          <button
            className="btn-icon logout-btn"
            title="ログアウト"
            onClick={async () => {
              if (window.confirm('ログアウトしますか？')) {
                await signOut();
              }
            }}
            style={{
              marginLeft: '12px',
              background: 'transparent',
              border: '1px solid rgba(196, 49, 75, 0.6)',
              borderRadius: '6px',
              cursor: 'pointer',
              color: 'var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              opacity: 0.8,
              transition: 'all 0.2s ease'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </header>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTeamId={currentTeamId !== null ? String(currentTeamId) : null}
        currentTeamName={currentTeamName}
        initialTab="profile" // Default
      />

      <div className="main-wrapper">
        <aside className="teams-sidebar">
          <div className="teams-list">
            <TeamsSidebar
              currentTeamId={currentTeamId as string | null}
              onSelectTeam={(id) => {
                setCurrentTeamId(id);
                // ALWAYS switch to feed when clicking a team in the sidebar
                setViewMode('feed');
              }}
              viewMode={viewMode}
              onSelectDashboard={() => setViewMode('dashboard')}
              statusFilter={statusFilter}
              onSelectStatus={(status) => {
                setStatusFilter(status);
                setViewMode('feed');
              }}
              onEditTeam={(teamId) => {
                setCurrentTeamId(teamId); // Ensure team is selected
                setIsSettingsOpen(true);
              }}
              unreadTeams={unreadTeams}
            />
          </div>
        </aside>

        <div className="dashboard-layout">
          <main className="main-feed-area">
            {viewMode === 'dashboard' ? (
              <Dashboard
                currentTeamId={currentTeamId}
                threads={threads}
                teams={teams}
                onSelectTeam={(id) => setCurrentTeamId(id)}
                isLoading={threadsLoading}
              />
            ) : (
              <>
                <div className="feed-list">
                  <ThreadList
                    currentTeamId={currentTeamId}
                    threadsData={{ threads, loading: threadsLoading, error: threadsError, refetch }}
                    statusFilter={statusFilter}
                    onStatusChange={setStatusFilter}
                  />
                </div>
                <PostForm
                  teamId={currentTeamId}
                  onSuccess={() => refetch(true)}
                />
              </>
            )}
          </main>

          <RightSidebar
            currentTeamId={currentTeamId}
            threadsData={{ threads, loading: threadsLoading, error: threadsError, refetch }}
          />
        </div>
      </div>
    </>
  );
}

export default App;
