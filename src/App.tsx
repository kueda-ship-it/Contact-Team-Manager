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
import { useThreads, useTeams } from './hooks/useSupabase';

function App() {
  const { user, profile, loading: authLoading } = useAuth();
  const [currentTeamId, setCurrentTeamId] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'feed' | 'dashboard'>('feed');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'mentions'>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { threads, loading: threadsLoading, error: threadsError, refetch } = useThreads(currentTeamId as any);
  const { teams } = useTeams();

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
        <div className="logo">
          <img src="/favicon-v2.png" alt="Logo" style={{ width: '32px', height: '32px', borderRadius: '8px', objectFit: 'cover' }} />
          <span>Contact Team Manager</span>
        </div>
        <div className="header-search-container">
          <input type="text" className="input-field search-input" placeholder="検索 (CTRL+E)" />
        </div>
        <div className="user-profile">
          <button
            className="btn-icon"
            title="設定"
            onClick={() => setIsSettingsOpen(true)}
            style={{ marginRight: '10px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
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
        </div>
      </header>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentTeamId={currentTeamId as any}
        currentTeamName={currentTeamName}
        initialTab="profile" // Default
      />

      <div className="main-wrapper">
        <aside className="teams-sidebar">
          <div className="teams-list">
            <TeamsSidebar
              currentTeamId={currentTeamId as any}
              onSelectTeam={(id) => {
                setCurrentTeamId(id);
                // ALWAYS switch to feed when clicking a team in the sidebar
                setViewMode('feed');
              }}
              viewMode={viewMode}
              onSelectDashboard={() => setViewMode('dashboard')}
              statusFilter={statusFilter}
              onSelectStatus={setStatusFilter}
              onEditTeam={(teamId) => {
                setCurrentTeamId(teamId); // Ensure team is selected
                setIsSettingsOpen(true);
              }}
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
                onSelectTeam={(id) => setCurrentTeamId(id as number | null)}
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
