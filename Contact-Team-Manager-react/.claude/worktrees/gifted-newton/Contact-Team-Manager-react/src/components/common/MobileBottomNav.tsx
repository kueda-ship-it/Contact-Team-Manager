import React from 'react';

interface MobileBottomNavProps {
    activeTab: string;
    onTabChange: (tab: 'teams' | 'feed' | 'pending') => void;
    unreadCount?: number;
    pendingCount?: number;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
    activeTab,
    onTabChange,
    unreadCount = 0,
    pendingCount = 0
}) => {
    return (
        <nav className="mobile-bottom-nav">
            <button
                className={`nav-item ${activeTab === 'teams' ? 'active' : ''}`}
                onClick={() => onTabChange('teams')}
            >
                <div className="nav-icon-wrapper">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    {unreadCount > 0 && <span className="nav-badge">{unreadCount}</span>}
                </div>
                <span>チーム</span>
            </button>

            <button
                className={`nav-item ${activeTab === 'feed' ? 'active' : ''}`}
                onClick={() => onTabChange('feed')}
            >
                <div className="nav-icon-wrapper">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                    </svg>
                </div>
                <span>フィード</span>
            </button>

            <button
                className={`nav-item ${activeTab === 'pending' ? 'active' : ''}`}
                onClick={() => onTabChange('pending')}
            >
                <div className="nav-icon-wrapper">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 11 12 14 22 4"></polyline>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                    </svg>
                    {pendingCount > 0 && <span className="nav-badge danger">{pendingCount}</span>}
                </div>
                <span>未完了</span>
            </button>
        </nav>
    );
};
