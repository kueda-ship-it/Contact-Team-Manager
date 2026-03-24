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
import { supabase } from './lib/supabase';
import { useTheme } from './context/ThemeContext';
import { useNotifications } from './hooks/useNotifications';
import { MobileBottomNav } from './components/common/MobileBottomNav';
import './styles/style.css';

import { initializeMsal, ssoLogin, setExternalAccessToken } from './lib/microsoftGraph';

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="btn icon-btn gear-btn-unified theme-toggle-btn"
      title={theme === 'dark' ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
      style={{ marginRight: '8px' }}
    >
      {theme === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      )}
    </button>
  );
};

function App() {
  const { user, profile, session, loading: authLoading, signOut } = useAuth();
  useNotifications(); // Initialize notifications


  const [currentTeamId, setCurrentTeamId] = useState<number | string | null>(null);
  const [viewMode, setViewMode] = useState<'feed' | 'dashboard'>('feed');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'mentions' | 'myposts'>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<'profile' | 'team' | 'admin' | 'team-mgmt' | 'history'>('profile');
  const [searchQuery, setSearchQuery] = useState('');
  const [threadsLimit, setThreadsLimit] = useState(50);
  const [sortAscending, setSortAscending] = useState(true);
  const [scrollToThreadId, setScrollToThreadId] = useState<string | null>(null);
  const [activeMobileTab, setActiveMobileTab] = useState<'teams' | 'feed' | 'pending'>('feed');
  const [isMobilePostFormOpen, setIsMobilePostFormOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
  // Mobile UI improvement (2026-03-03): If no team is selected initially, force the 'teams' tab to open
  useEffect(() => {
    if (!authLoading && !membershipsLoading && user && currentTeamId === null) {
      // Switch tab to 'teams' to enforce team selection first on mobile
      setActiveMobileTab('teams');

      if (profile?.role !== 'Admin' && memberships.length > 0) {
        console.log('Redirecting non-admin to first team:', memberships[0].team_id);
        setCurrentTeamId(memberships[0].team_id);
      }
    }
  }, [user, profile, memberships, membershipsLoading, authLoading, currentTeamId]);

  // Initialize MSAL explicitly on mount
  useEffect(() => {
    initializeMsal().catch(console.error);
  }, []);

  // Auto-login to Microsoft Graph (OneDrive) when Supabase user is available
  useEffect(() => {
    const provider = session?.user?.app_metadata?.provider;
    const isMicrosoftUser = provider === 'azure';

    if (session?.provider_token) {
      console.log('[App] Reusing Supabase provider token for Microsoft Graph.');
      setExternalAccessToken(session.provider_token);
    }
    // ssoSilentはMicrosoftログインユーザーのみ試行（email/passユーザーではタイムアウトする）
    if (isMicrosoftUser && user?.email) {
      ssoLogin(user.email).catch(err => {
        console.warn('[App] MSAL auto-login failed (non-critical):', err);
      });
    }
  }, [user?.id, session?.provider_token]);

  // Clear hash from URL behavior removed to prevent conflict with MSAL popup handling
  // MSAL handles hash processing and clearing automatically.

  // Update last_read_at when currentTeamId changes
  useEffect(() => {
    if (currentTeamId) {
      updateLastRead(String(currentTeamId));
    }
  }, [currentTeamId]);

  // Handle ?thread=ID query parameter from notifications
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const threadId = params.get('thread');
    if (threadId && !authLoading && user) {
      // Find the thread and its team
      const findAndNavigate = async () => {
        // If thread is already in rawThreads, we can find its team_id
        const loadedThread = rawThreads.find(t => t.id === threadId);
        if (loadedThread) {
          if (String(loadedThread.team_id) !== String(currentTeamId)) {
            setCurrentTeamId(loadedThread.team_id);
          }
          handleSidebarThreadClick(threadId);
          // Clear param from URL to avoid repeated navigation
          const newUrl = window.location.pathname + window.location.hash;
          window.history.replaceState({}, '', newUrl);
        } else {
          // If not loaded, we might need to fetch it to know the team
          const { data } = await supabase.from('threads').select('team_id').eq('id', threadId).single();
          if (data) {
            if (String(data.team_id) !== String(currentTeamId)) {
              setCurrentTeamId(data.team_id);
            }
            // Give it a moment to load threads for the new team
            setTimeout(() => {
              handleSidebarThreadClick(threadId);
              const newUrl = window.location.pathname + window.location.hash;
              window.history.replaceState({}, '', newUrl);
            }, 500);
          }
        }
      };
      findAndNavigate();
    }
  }, [authLoading, user, rawThreads]);

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

  const handleSidebarThreadClick = async (threadId: string) => {
    // 1. Find thread to get its team_id
    let targetTeamId = currentTeamId;
    const thread = (rawThreads || []).find(t => t.id === threadId);
    
    if (thread) {
      targetTeamId = thread.team_id;
    } else {
      // If not in current rawThreads, fetch from DB
      const { data } = await supabase.from('threads').select('team_id').eq('id', threadId).single();
      if (data) targetTeamId = data.team_id;
    }

    // 2. Ensure we are in feed mode
    setViewMode('feed');
    // 3. Ensure we can see the thread
    setStatusFilter('all');

    // 4. Switch team if necessary
    if (String(targetTeamId) !== String(currentTeamId)) {
      setCurrentTeamId(targetTeamId);
    }

    // 5. Set target to scroll
    setScrollToThreadId(threadId);
  };

  if (authLoading) {
    return null;
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
          <span className="logo-text">Contact Team Manager</span>
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
          <ThemeToggle />
          <button
            className="btn icon-btn gear-btn-unified"
            onClick={() => setIsSettingsOpen(true)}
            title="設定"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l-.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
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

      <div className={`main-wrapper mobile-tab-${activeMobileTab}`}>
        <TeamsSidebar
          currentTeamId={currentTeamId}
          onSelectTeam={(id) => {
            setCurrentTeamId(id);
            setViewMode('feed');
            setActiveMobileTab('feed');
          }}
          viewMode={viewMode}
          onSelectDashboard={() => {
            setViewMode('dashboard');
            setActiveMobileTab('feed');
          }}
          statusFilter={statusFilter}
          onSelectStatus={(status) => {
            setStatusFilter(status);
            setViewMode('feed');
            setActiveMobileTab('feed');
          }}
          onEditTeam={() => {
            setSettingsInitialTab('team');
            setIsSettingsOpen(true);
          }}
          onAddTeam={() => {
            setSettingsInitialTab('team-mgmt');
            setIsSettingsOpen(true);
          }}
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
                {/* Desktop: Show PostForm inline at bottom */}
                <div className="desktop-only-postform" style={{ flexShrink: 0 }}>
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
                onThreadClick={handleSidebarThreadClick}
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

      {/* Mobile Post FAB (Only show when active tab is feed or teams, and form is not open) */}
      {!isMobilePostFormOpen && (activeMobileTab === 'feed' || activeMobileTab === 'teams') && viewMode !== 'dashboard' && (
        <button
          className="mobile-fab"
          onClick={() => setIsMobilePostFormOpen(true)}
          title="新規投稿"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
        </button>
      )}

      {/* Mobile Post Form Modal - Premium Redesign */}
      {isMobilePostFormOpen && (
        <div className="mobile-post-modal">
          <div className="mobile-post-modal-header">
            <div className="modal-title-area">
              <span className="modal-title">新規投稿</span>
              <span className="modal-subtitle">{currentTeamName || 'チーム未選択'}</span>
            </div>
            <button
              className="mobile-post-close-btn"
              onClick={() => setIsMobilePostFormOpen(false)}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
          <div className="mobile-post-modal-content">
            <PostForm
              teamId={currentTeamId}
              onSuccess={() => {
                refetch(true);
                setIsMobilePostFormOpen(false);
              }}
              onCancel={() => setIsMobilePostFormOpen(false)}
            />
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <>
          {console.log('[App] Opening SettingsModal. currentTeamId:', currentTeamId)}
          <SettingsModal
            isOpen={isSettingsOpen}
            initialTab={settingsInitialTab}
            onClose={() => setIsSettingsOpen(false)}
            currentTeamId={currentTeamId ? String(currentTeamId) : null}
            currentTeamName={currentTeamName}
          />
        </>
      )}

      {isMobile && (
        <MobileBottomNav
          activeTab={activeMobileTab}
          onTabChange={(tab) => {
            setActiveMobileTab(tab);
            if (tab === 'feed' || tab === 'pending') {
              setViewMode('feed');
            }
          }}
          unreadCount={unreadTeams.size}
          pendingCount={0}
        />
      )}
    </div>
  );
}

export default App;
