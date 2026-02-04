import React from 'react';


interface DashboardProps {
    currentTeamId: number | null;
    threads: any[];
    teams: any[];
    onSelectTeam: (id: number | null) => void;
    isLoading: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({ currentTeamId, threads, teams, onSelectTeam, isLoading }) => {
    console.log('Dashboard Render:', { currentTeamId, threadsCount: threads.length, isLoading });

    // Filter threads if needed (though passed threads are usually already filtered by App/useThreads)
    // Actually App passes threads from useThreads(currentTeamId), so 'threads' here are already filtered.
    // However, if currentTeamId is null (All Teams), we might want to aggregate overall stats.

    const totalThreads = threads.length;
    const completedThreads = threads.filter(t => t.status === 'completed').length;
    // const pendingThreads = threads.filter(t => t.status !== 'completed').length; // or 'pending'

    const completionRate = totalThreads > 0 ? Math.round((completedThreads / totalThreads) * 100) : 0;

    // User Activity Stats
    // Time Metrics & User Details
    const [selectedUser, setSelectedUser] = React.useState<string | null>(null);

    const calculateAvgTime = (userThreads: any[]) => {
        const completed = userThreads.filter(t => t.status === 'completed' && t.completed_at && t.created_at);
        if (completed.length === 0) return 'N/A';

        const totalMs = completed.reduce((acc, t) => {
            const start = new Date(t.created_at).getTime();
            const end = new Date(t.completed_at).getTime();
            if (isNaN(start) || isNaN(end)) return acc;
            return acc + (end - start);
        }, 0);

        const avgMs = totalMs / completed.length;
        if (isNaN(avgMs)) return 'N/A';

        const days = Math.floor(avgMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((avgMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        return `${days}日 ${hours}時間`;
    };

    /**
     * Estimates daily activity duration (span from first action to last action each day)
     */
    const calculateDailyActivitySpan = (userThreads: any[]) => {
        if (userThreads.length === 0) return 'N/A';

        // Group by date
        const byDate: { [date: string]: number[] } = {};
        userThreads.forEach(t => {
            const dates = [t.created_at, t.completed_at].filter(Boolean);
            dates.forEach(d => {
                const dateKey = new Date(d).toLocaleDateString();
                if (!byDate[dateKey]) byDate[dateKey] = [];
                byDate[dateKey].push(new Date(d).getTime());
            });
        });

        const dailySpans = Object.values(byDate).map(times => {
            const min = Math.min(...times);
            const max = Math.max(...times);
            return max - min;
        }).filter(span => span > 0);

        if (dailySpans.length === 0) return 'N/A';

        const avgMs = dailySpans.reduce((a, b) => a + b, 0) / dailySpans.length;
        const hours = Math.floor(avgMs / (1000 * 60 * 60));
        const mins = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}時間 ${mins}分`;
    };

    const overallAvgTime = calculateAvgTime(threads);

    const userStats: { [key: string]: { name: string; count: number; completedCount: number; avgTime: string; completionRate: number; dailySpan: string } } = {};

    threads.forEach(t => {
        const author = t.author_name || t.author || 'Unknown'; // Ensure we have a display name preferably
        if (!userStats[author]) {
            userStats[author] = { name: author, count: 0, completedCount: 0, avgTime: 'N/A', completionRate: 0, dailySpan: 'N/A' };
        }
        userStats[author].count++;
        if (t.status === 'completed') {
            userStats[author].completedCount++;
        }
    });

    // Calculate derived stats for each user
    Object.keys(userStats).forEach(author => {
        const stats = userStats[author];
        const userThreads = threads.filter(t => (t.author_name || t.author || 'Unknown') === author);
        stats.completionRate = stats.count > 0 ? Math.round((stats.completedCount / stats.count) * 100) : 0;
        stats.avgTime = calculateAvgTime(userThreads);
        stats.dailySpan = calculateDailyActivitySpan(userThreads);
    });

    const sortedUserStats = Object.values(userStats).sort((a, b) => b.count - a.count);
    const sortedByCompletions = [...Object.values(userStats)].sort((a, b) => b.completedCount - a.completedCount);
    const maxCompletions = Math.max(...sortedByCompletions.map(s => s.completedCount), 1);

    // Calculate Dash Offset for SVG Pie/Circle Chart
    // Circumference = 2 * PI * r
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (completionRate / 100) * circumference;

    if (isLoading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="loading-spinner" style={{ marginBottom: '20px' }}></div>
                データ読み込み中...
            </div>
        );
    }

    // Safer team lookup
    const currentTeam = teams && Array.isArray(teams) && currentTeamId
        ? teams.find(t => String(t.id) === String(currentTeamId))
        : null;

    return (
        <div style={{ padding: '20px', color: 'var(--text-main)', height: '100%', overflowY: 'auto', position: 'relative', animation: 'fadeIn 0.3s ease-in-out' }}>
            <div style={{ marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>ダッシュボード</h2>
                    {currentTeam?.avatar_url && (
                        <img src={currentTeam.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(255,255,255,0.08)', padding: '8px 20px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>表示チーム:</span>
                    </div>
                    <select
                        value={currentTeamId || ''}
                        onChange={(e) => {
                            const val = e.target.value;
                            console.log('Dashboard Selection Change:', val);
                            onSelectTeam(val ? Number(val) : null);
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-main)',
                            fontSize: '1rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            outline: 'none',
                            padding: '2px 5px',
                            minWidth: '160px',
                            textOverflow: 'ellipsis'
                        }}
                    >
                        <option value="" style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)' }}>すべてのチーム</option>
                        {teams.map(team => (
                            <option key={team.id} value={team.id} style={{ background: 'var(--bg-secondary)', color: 'var(--text-main)' }}>{team.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {threads.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: 'var(--text-muted)' }}>
                    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3, marginBottom: '20px' }}>
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="9" x2="15" y2="9"></line>
                        <line x1="9" y1="13" x2="15" y2="13"></line>
                        <line x1="9" y1="17" x2="13" y2="17"></line>
                    </svg>
                    <p>このチームにはまだ投稿がありません。</p>
                </div>
            ) : (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                        <div className="task-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '25px', background: 'linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>総投稿数</div>
                            <div style={{ fontSize: '2.8rem', fontWeight: 800 }}>{totalThreads}</div>
                        </div>
                        <div className="task-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '25px', background: 'linear-gradient(145deg, rgba(67, 181, 129, 0.1), rgba(67, 181, 129, 0.05))' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>完了数</div>
                            <div style={{ fontSize: '2.8rem', fontWeight: 800, color: 'var(--success)' }}>{completedThreads}</div>
                        </div>
                        <div className="task-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '25px', background: 'linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>平均完了時間</div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-main)', textAlign: 'center' }}>{overallAvgTime}</div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                        {/* Task Progress (Completions) Chart */}
                        <div className="task-card" style={{ padding: '25px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-muted)' }}>完了数（メンバー別）</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {sortedByCompletions.slice(0, 5).map((stat) => (
                                    <div key={stat.name}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                                            <span style={{ fontWeight: 600 }}>{stat.name}</span>
                                            <span style={{ color: 'var(--success)', fontWeight: 700 }}>{stat.completedCount}件</span>
                                        </div>
                                        <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div
                                                style={{
                                                    height: '100%',
                                                    width: `${(stat.completedCount / maxCompletions) * 100}%`,
                                                    background: 'var(--success)',
                                                    transition: 'width 1s ease-out'
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Completion Rate Chart */}
                        <div className="task-card" style={{ padding: '25px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '25px', width: '100%', color: 'var(--text-muted)' }}>全体の完了率</h3>
                            <div style={{ position: 'relative', width: '160px', height: '160px' }}>
                                <svg width="160" height="160" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r={radius}
                                        fill="transparent"
                                        stroke="rgba(255,255,255,0.05)"
                                        strokeWidth="8"
                                    />
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r={radius}
                                        fill="transparent"
                                        stroke="var(--primary)"
                                        strokeWidth="8"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={offset}
                                        strokeLinecap="round"
                                        style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                                    />
                                </svg>
                                <div style={{ position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ fontSize: '2rem', fontWeight: 800 }}>{completionRate}%</div>
                                </div>
                            </div>
                        </div>

                        {/* User Activity List */}
                        <div className="task-card" style={{ padding: '25px', gridColumn: 'span 1' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-muted)' }}>活動ユーザー一覧</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }} className="custom-scrollbar">
                                {sortedUserStats.map((stat, index) => (
                                    <div
                                        key={stat.name}
                                        onClick={() => setSelectedUser(stat.name)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '12px 15px',
                                            background: 'rgba(255,255,255,0.03)',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            border: '1px solid transparent'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                                            e.currentTarget.style.borderColor = 'transparent';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '15px' }}>{index + 1}</span>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{stat.name}</div>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>平均稼働: {stat.dailySpan}</div>
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{stat.count} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>件</span></div>
                                            <div style={{ fontSize: '0.75rem', color: stat.completionRate > 80 ? 'var(--success)' : 'var(--text-muted)' }}>{stat.completionRate}% 完了</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Member Detail Modal */}
            {selectedUser && (
                <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setSelectedUser(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%', animation: 'modalFadeIn 0.3s ease-out' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{selectedUser} の詳細統計</h3>
                            <button className="btn btn-sm btn-outline" onClick={() => setSelectedUser(null)} style={{ padding: '0 8px', height: '32px' }}>✕</button>
                        </div>
                        {userStats[selectedUser] && (
                            <div style={{ display: 'grid', gap: '12px' }}>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>1日の平均稼働（活動）時間</div>
                                        <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary)' }}>{userStats[selectedUser].dailySpan}</div>
                                    </div>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.5 }}>
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <polyline points="12 6 12 12 16 14"></polyline>
                                    </svg>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>総投稿数</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{userStats[selectedUser].count}</div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>完了数 / 完了率</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--success)' }}>
                                        {userStats[selectedUser].completedCount} <span style={{ fontSize: '1rem', fontWeight: 400, color: 'var(--text-muted)' }}>({userStats[selectedUser].completionRate}%)</span>
                                    </div>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>平均完了までにかかる時間</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{userStats[selectedUser].avgTime}</div>
                                </div>
                            </div>
                        )}
                        <div style={{ marginTop: '20px', fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            ※稼働時間は、各日の最初の活動から最後の活動までの間隔の平均です。
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes modalFadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .custom-scrollbar::-webkit-scrollbar { width: 5px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); borderRadius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
        </div>
    );
};

