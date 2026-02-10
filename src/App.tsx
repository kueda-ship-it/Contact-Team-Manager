import { useState, useEffect } from 'react';
import { TeamsSidebar } from './components/Sidebar/TeamsSidebar';
import { RightSidebar } from './components/Sidebar/RightSidebar';
import { ThreadList } from './components/Feed/ThreadList';
import { PostForm } from './components/Feed/PostForm';
import { SettingsModal } from './components/Settings/SettingsModal';
import { Dashboard } from './components/Dashboard/Dashboard';
import { Login } from './components/Login';
import { useAuth } from './hooks/useAuth';
import { useThreads, useTeams, useUserMemberships, useUnreadCounts } from './hooks/useSupabase';
import { useNotifications } from './hooks/useNotifications';
import './styles/style.css';

import { initializeMsal } from './lib/microsoftGraph';

function App() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  useNotifications(); // Initialize notifications


  const [currentTeamId, setCurrentTeamId] = useState<number | string | null>(null);
  const [viewMode, setViewMode] = useState<'feed' | 'dashboard'>('feed');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'mentions' | 'myposts'>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [threadsLimit, setThreadsLimit] = useState(50);
  const [sortAscending, setSortAscending] = useState(true);
  const [scrollToThreadId, setScrollToThreadId] = useState<string | null>(null);

  const { teams } = useTeams();
  // Ensure we fetch ALL pending items if that filter is active, regardless of default limit
  const fetchLimit = (statusFilter === 'pending' || statusFilter === 'mentions' || searchQuery) ? 2000 : threadsLimit;
  // Pass searchQuery to useThreads for server-side filtering
  const threadsData = useThreads(currentTeamId, fetchLimit, sortAscending, statusFilter, searchQuery);
  const { threads: rawThreads, loading: threadsLoading, error: threadsError, refetch } = threadsData;
  const { memberships, loading: membershipsLoading, updateLastRead } = useUserMemberships(user?.id);
  const { unreadTeams } = useUnreadCounts(user?.id, memberships);

  // Client-side filtering removed in favor of server-side search
  const filteredThreads = rawThreads;

  const threadsDataFiltered = {
    threads: filteredThreads,
    loading: threadsLoading,
    error: threadsError,
    refetch
  };

  // Redirect non-admins to their first team if no team is selected
  useEffect(() => {
    if (!authLoading && !membershipsLoading && user && profile?.role !== 'Admin' && currentTeamId === null) {
      if (memberships.length > 0) {
        console.log('Redirecting non-admin to first team:', memberships[0].team_id);
        setCurrentTeamId(memberships[0].team_id);
      }
    }
  }, [user, profile, memberships, membershipsLoading, authLoading, currentTeamId]);

  // Initialize MSAL explicitly on mount
  useEffect(() => {
    initializeMsal().catch(console.error);
  }, []);

  // Clear hash from URL behavior removed to prevent conflict with MSAL popup handling
  // MSAL handles hash processing and clearing automatically.

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

  // Helper to get current team name
  const currentTeam = teams.find(t => String(t.id) === String(currentTeamId));
  const currentTeamName = currentTeam?.name || 'チーム未選択';

  const handleSidebarThreadClick = (threadId: string) => {
    // 1. Ensure we are in feed mode
    setViewMode('feed');
    // 2. Ensure we can see the thread (switch to all or pending? 'all' is safest)
    setStatusFilter('all');

    // 3. Check if thread is currently loaded
    const isLoaded = rawThreads.some(t => t.id === threadId);
    if (!isLoaded) {
      // Expand limit if not loaded (temporary expansion to ensure we find it)
      // Check if 500 is enough? Maybe 1000?
      if (threadsLimit < 500) {
        setThreadsLimit(500);
      }
    }

    // 4. Set target to scroll
    setScrollToThreadId(threadId);
  };

  if (authLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--bg-dark)'
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
      <header>
        <div className="logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ background: 'rgba(0,183,195,0.1)', padding: '4px', borderRadius: '4px' }}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          Contact Team Manager
        </div>

        <div className="header-search-container">
          <input
            type="text"
            className="search-input"
            placeholder="検索 (CTRL+E)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="user-profile">
          <button
            className="btn icon-btn gear-btn-unified"
            onClick={() => setIsSettingsOpen(true)}
            title="設定"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {profile?.avatar_url && (
              <img
                src={profile.avatar_url}
                alt={profile.display_name}
                style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{profile?.display_name || user.email}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>{profile?.role || 'User'}</span>
            </div>
          </div>

          <button
            id="logout-btn"
            className="btn"
            onClick={() => signOut()}
            title="ログアウト"
            style={{
              padding: '6px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: '1px solid rgba(232, 17, 35, 0.4)',
              color: '#FF6666',
              borderRadius: '6px',
              cursor: 'pointer',
              width: '34px',
              height: '34px',
              transition: 'all 0.2s'
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
          </button>
        </div>
      </header>

      <div className="main-wrapper">
        <TeamsSidebar
          currentTeamId={currentTeamId}
          onSelectTeam={(id) => {
            setCurrentTeamId(id);
            setViewMode('feed');
          }}
          viewMode={viewMode}
          onSelectDashboard={() => setViewMode('dashboard')}
          statusFilter={statusFilter}
          onSelectStatus={(status) => {
            setStatusFilter(status);
            setViewMode('feed');
          }}
          onEditTeam={() => setIsSettingsOpen(true)}
          unreadTeams={unreadTeams}
        />

        <div className="dashboard-layout">
          <main className="main-feed-area">
            {viewMode === 'feed' && (
              <div
                className="feed-list-flex-container"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  overflow: 'hidden'
                }}
              >
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <ThreadList
                    currentTeamId={currentTeamId}
                    threadsData={threadsDataFiltered}
                    statusFilter={statusFilter}
                    onStatusChange={setStatusFilter}
                    sortAscending={sortAscending}
                    onToggleSort={() => setSortAscending(prev => !prev)}
                    onLoadMore={() => setThreadsLimit(prev => prev + 50)}
                    scrollToThreadId={scrollToThreadId}
                    onScrollComplete={() => setScrollToThreadId(null)}
                  />
                </div>
                <div style={{ flexShrink: 0 }}>
                  <PostForm
                    teamId={currentTeamId}
                    onSuccess={() => refetch(true)}
                  />
                </div>
              </div>
            )}
            {viewMode === 'dashboard' && (
              <Dashboard
                currentTeamId={currentTeamId}
                onSelectTeam={setCurrentTeamId}
                onSelectStatus={(status) => {
                  setStatusFilter(status as any);
                  setViewMode('feed');
                }}
              />
            )}
          </main>

          <RightSidebar
            currentTeamId={currentTeamId}
            threadsData={threadsData}
            onThreadClick={handleSidebarThreadClick}
          />
        </div>
      </div>

      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentTeamId={currentTeamId ? String(currentTeamId) : null}
          currentTeamName={currentTeamName}
        />
      )}
    </div>
  );
}

export default App;
