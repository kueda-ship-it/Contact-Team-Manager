import React, { useState } from 'react';
import { CustomSelect } from '../common/CustomSelect';
import { useProfiles, useUserMemberships, useTeams, useThreads, useUnreadCounts } from '../../hooks/useSupabase';
import { useAuth } from '../../hooks/useAuth';

interface DashboardProps {
    currentTeamId: number | string | null;
    onSelectTeam: (id: number | string | null) => void;
    onSelectStatus: (status: string | null) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
    currentTeamId,
    onSelectTeam,
    onSelectStatus
}) => {
    const { teams } = useTeams();
    const { user, profile } = useAuth();
    const { memberships } = useUserMemberships(user?.id);
    // Fetch more threads for accurate dashboard stats (limit 1000)
    // useThreads(teamId, limit, ascending)
    const { threads, loading: threadsLoading, error, refetch } = useThreads(currentTeamId, 1000, false);
    const { profiles } = useProfiles();
    const [period, setPeriod] = useState<'all' | 'year' | 'month' | 'week' | 'day' | 'custom'>('all');
    // User Activity Stats State - Moved up to avoid hook order errors
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);

    if (threadsLoading) return <div style={{ padding: '20px', color: 'var(--text-main)' }}>統計データを読み込み中...</div>;

    const getFilteredThreads = () => {
        if (period === 'all') return threads;
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        return threads.filter(t => {
            const date = new Date(t.completed_at || t.created_at).getTime();
            const d = new Date(date);

            if (period === 'year') {
                return d.getFullYear() === selectedYear;
            }
            if (period === 'month') {
                return d.getFullYear() === selectedYear && (d.getMonth() + 1) === selectedMonth;
            }
            if (period === 'week') {
                const oneWeekAgo = startOfDay - (7 * 24 * 60 * 60 * 1000);
                return date >= oneWeekAgo;
            }
            if (period === 'day') {
                return date >= startOfDay;
            }
            if (period === 'custom' && startDate && endDate) {
                const start = new Date(startDate).getTime();
                const end = new Date(endDate).getTime() + (24 * 60 * 60 * 1000) - 1; // End of selected day
                return date >= start && date <= end;
            }
            return true;
        });
    };

    const displayThreads = getFilteredThreads();

    // Generate Year Options (current year +/- 5)
    const currentYear = new Date().getFullYear();
    const yearOptions = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
    const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

    const totalThreads = displayThreads.length;
    const completedThreads = displayThreads.filter(t => t.status === 'completed').length;

    const completionRate = totalThreads > 0 ? Math.round((completedThreads / totalThreads) * 100) : 0;

    // User Activity Stats
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

    const calculateDailyActivitySpan = (userThreads: any[]) => {
        if (userThreads.length === 0) return 'N/A';

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

    const overallAvgTime = calculateAvgTime(displayThreads);

    const userStats: { [key: string]: { name: string; count: number; completedCount: number; avgTime: string; completionRate: number; dailySpan: string } } = {};

    displayThreads.forEach(t => {
        const author = t.author_name || t.author || 'Unknown';
        if (!userStats[author]) {
            userStats[author] = { name: author, count: 0, completedCount: 0, avgTime: 'N/A', completionRate: 0, dailySpan: 'N/A' };
        }
        userStats[author].count++;

        if (t.status === 'completed') {
            const completerProfile = t.completed_by ? (profiles.find((p: any) => p.id === t.completed_by)) : null;
            const completerName = completerProfile?.display_name || completerProfile?.email || t.author_name || t.author || 'Unknown';

            if (!userStats[completerName]) {
                userStats[completerName] = { name: completerName, count: 0, completedCount: 0, avgTime: 'N/A', completionRate: 0, dailySpan: 'N/A' };
            }
            userStats[completerName].completedCount++;
        }
    });

    Object.keys(userStats).forEach(userName => {
        const stats = userStats[userName];
        const userThreadsAsAuthor = displayThreads.filter(t => (t.author_name || t.author || 'Unknown') === userName);
        const myThreadsCompleted = userThreadsAsAuthor.filter(t => t.status === 'completed').length;
        stats.completionRate = stats.count > 0 ? Math.round((myThreadsCompleted / stats.count) * 100) : 0;
        stats.avgTime = calculateAvgTime(userThreadsAsAuthor);
        stats.dailySpan = calculateDailyActivitySpan(userThreadsAsAuthor);
    });

    const completerStats: { [name: string]: number } = {};
    displayThreads.forEach(t => {
        if (t.status === 'completed') {
            const completerProfile = t.completed_by ? (profiles.find((p: any) => p.id === t.completed_by)) : null;
            const completerName = completerProfile?.display_name || completerProfile?.email || t.author_name || t.author || 'Unknown';
            completerStats[completerName] = (completerStats[completerName] || 0) + 1;
        }
    });

    const sortedUserStats = Object.values(userStats).sort((a, b) => b.count - a.count);
    const sortedByCompletions = Object.entries(completerStats)
        .map(([name, count]) => ({ name, completedCount: count }))
        .sort((a, b) => b.completedCount - a.completedCount);
    const maxCompletions = Math.max(...sortedByCompletions.map(s => s.completedCount), 1);

    const teamStats: { [key: string]: { id: number | string; name: string; completedCount: number } } = {};
    displayThreads.forEach(t => {
        if (t.status === 'completed') {
            const tId = t.team_id || 'no-team';
            const teamIdStr = String(tId);
            if (!teamStats[teamIdStr]) {
                const team = teams.find(tm => String(tm.id) === teamIdStr);
                teamStats[teamIdStr] = {
                    id: tId,
                    name: team?.name || (tId === 'no-team' ? 'チームなし' : '不明なチーム'),
                    completedCount: 0
                };
            }
            teamStats[teamIdStr].completedCount++;
        }
    });
    const sortedTeamStats = Object.values(teamStats).sort((a, b) => b.completedCount - a.completedCount);
    const maxTeamCompletions = Math.max(...sortedTeamStats.map(s => s.completedCount), 1);

    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (completionRate / 100) * circumference;

    if (threadsLoading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div className="loading-spinner" style={{ marginBottom: '20px' }}></div>
                データ読み込み中...
            </div>
        );
    }

    const currentTeam = teams && Array.isArray(teams) && currentTeamId
        ? teams.find(t => String(t.id) === String(currentTeamId))
        : null;
    // ... (Render part)

    return (
        <div style={{ padding: '20px', color: 'var(--text-main)', height: '100%', overflowY: 'auto', position: 'relative', animation: 'fadeIn 0.3s ease-in-out' }}>
            <div style={{ marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>ダッシュボード</h2>
                    {currentTeam?.avatar_url && (
                        <img src={currentTeam.avatar_url} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.08)', padding: '4px 12px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>期間:</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {[
                                { id: 'all', label: 'すべて' },
                                { id: 'year', label: '年' },
                                { id: 'month', label: '月' },
                                { id: 'week', label: '週' },
                                { id: 'day', label: '日' },
                                { id: 'custom', label: '期間指定' }
                            ].map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setPeriod(p.id as any)}
                                    style={{
                                        padding: '4px 10px',
                                        fontSize: '0.75rem',
                                        borderRadius: '15px',
                                        border: 'none',
                                        cursor: 'pointer',
                                        background: period === p.id ? 'var(--primary)' : 'transparent',
                                        color: period === p.id ? 'white' : 'var(--text-muted)',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {period === 'year' && (
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(Number(e.target.value))}
                                style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(0,0,0,0.2)',
                                    color: 'white',
                                    fontSize: '0.8rem',
                                    marginLeft: '10px'
                                }}
                            >
                                {yearOptions.map(y => <option key={y} value={y} style={{ color: 'black' }}>{y}年</option>)}
                            </select>
                        )}

                        {period === 'month' && (
                            <div style={{ display: 'flex', gap: '5px', marginLeft: '10px' }}>
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'rgba(0,0,0,0.2)',
                                        color: 'white',
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    {yearOptions.map(y => <option key={y} value={y} style={{ color: 'black' }}>{y}年</option>)}
                                </select>
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'rgba(0,0,0,0.2)',
                                        color: 'white',
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    {monthOptions.map(m => <option key={m} value={m} style={{ color: 'black' }}>{m}月</option>)}
                                </select>
                            </div>
                        )}

                        {period === 'custom' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '10px' }}>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'rgba(0,0,0,0.2)',
                                        color: 'white',
                                        fontSize: '0.8rem'
                                    }}
                                />
                                <span style={{ color: 'var(--text-muted)' }}>~</span>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(255,255,255,0.2)',
                                        background: 'rgba(0,0,0,0.2)',
                                        color: 'white',
                                        fontSize: '0.8rem'
                                    }}
                                />
                            </div>
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
                        <CustomSelect
                            options={(() => {
                                const isAdmin = profile?.role === 'Admin';
                                const myTeamIds = memberships.map(m => m.team_id);
                                const visibleTeams = teams.filter(t => isAdmin || myTeamIds.includes(t.id));

                                return [
                                    ...(isAdmin ? [{ value: '', label: 'すべてのチーム' }] : []),
                                    ...visibleTeams.map(t => ({ value: t.id, label: t.name }))
                                ];
                            })()}
                            value={currentTeamId || ''}
                            onChange={(val: string | number) => onSelectTeam(val || null)}
                            style={{
                                width: '200px',
                                background: 'transparent',
                                border: 'none',
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Team Balance / Ratios Header Display */}
            <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                {(() => {
                    const totalPosts = displayThreads.length;
                    const totalCompletions = displayThreads.filter(t => t.status === 'completed').length;
                    const totalActivity = totalPosts + totalCompletions;

                    if (totalActivity === 0) return null;

                    const postRatio = Math.round((totalPosts / totalActivity) * 100);
                    const completionRatio = Math.round((totalCompletions / totalActivity) * 100);

                    // Determine Team Type based on majority
                    let teamType = 'バランス型';
                    if (postRatio >= 60) teamType = 'FCベース (投稿主体)';
                    if (completionRatio >= 60) teamType = '連絡ベース (完了主体)';

                    return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', background: 'rgba(255,255,255,0.05)', padding: '10px 20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>チーム傾向</span>
                                <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{teamType}</span>
                            </div>
                            <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.1)' }}></div>
                            <div style={{ display: 'flex', gap: '15px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>投稿 (FC)</span>
                                    <span style={{ fontWeight: 700, color: 'var(--success)' }}>{postRatio}%</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>完了 (連絡)</span>
                                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{completionRatio}%</span>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {threads.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', color: 'var(--text-muted)' }}>
                    <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3, marginBottom: '20px' }}>
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="9" x2="15" y2="9"></line>
                        <line x1="9" y1="13" x2="15" y2="13"></line>
                        <line x1="9" y1="17" x2="13" y2="17"></line>
                    </svg>
                    <p>この期間内のデータはありません。</p>
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

                        <div className="task-card" style={{ padding: '25px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-muted)' }}>完了数（チーム別）</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {sortedTeamStats.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>データなし</div>
                                ) : (
                                    sortedTeamStats.slice(0, 5).map((stat) => (
                                        <div key={String(stat.id)}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                                                <span style={{ fontWeight: 600 }}>{stat.name}</span>
                                                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{stat.completedCount}件</span>
                                            </div>
                                            <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div
                                                    style={{
                                                        height: '100%',
                                                        width: `${(stat.completedCount / maxTeamCompletions) * 100}%`,
                                                        background: 'var(--accent)',
                                                        transition: 'width 1s ease-out'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

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

                    <div className="task-card" style={{ padding: '25px', marginTop: '20px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-muted)' }}>チームバランス分析 (活動タイプと目標)</h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>メンバー</th>
                                        <th style={{ padding: '10px', textAlign: 'center' }}>タイプ</th>
                                        <th style={{ padding: '10px', textAlign: 'center' }}>総活動量</th>
                                        <th style={{ padding: '10px', textAlign: 'right' }}>投稿 (実績/目標)</th>
                                        <th style={{ padding: '10px', textAlign: 'right' }}>完了 (実績/目標)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const activeUserCount = sortedUserStats.length;
                                        if (activeUserCount === 0) return <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>データなし</td></tr>;

                                        const totalPosts = displayThreads.length;
                                        const totalCompletions = displayThreads.filter(t => t.status === 'completed').length;

                                        const totalActivity = totalPosts + totalCompletions;
                                        const teamPostRatio = totalActivity > 0 ? totalPosts / totalActivity : 0;
                                        const teamCompletionRatio = totalActivity > 0 ? totalCompletions / totalActivity : 0;

                                        return sortedUserStats.map(stat => {
                                            const userActivity = stat.count + stat.completedCount;

                                            // Base Quota
                                            let postQuota = userActivity * teamPostRatio;
                                            let completionQuota = userActivity * teamCompletionRatio;

                                            const isContactBase = stat.completedCount >= stat.count;

                                            let typeLabel = 'Unknown';
                                            let typeColor = 'var(--text-muted)';

                                            if (isContactBase) {
                                                typeLabel = '連絡ベース';
                                                typeColor = 'var(--accent)';
                                                // Contact Base: High Completion capability.
                                                // "FC goal (Post Goal) should be fewer".
                                                postQuota = postQuota * 0.6;
                                            } else {
                                                typeLabel = 'FCベース';
                                                typeColor = 'var(--success)';
                                                // FC Base: High Post capability.
                                                // "Contact goal (Completion Goal) should be fewer".
                                                completionQuota = completionQuota * 0.6;
                                            }

                                            const postDiff = stat.count - postQuota;
                                            const completionDiff = stat.completedCount - completionQuota;

                                            return (
                                                <tr key={stat.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '12px 10px', fontWeight: 600 }}>{stat.name}</td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                        <span style={{
                                                            fontSize: '0.75rem',
                                                            padding: '4px 8px',
                                                            borderRadius: '4px',
                                                            background: `${typeColor}20`,
                                                            color: typeColor,
                                                            border: `1px solid ${typeColor}40`
                                                        }}>
                                                            {typeLabel}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 600 }}>
                                                        {userActivity}
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span>{stat.count} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>/ {postQuota.toFixed(1)}</span></span>
                                                            <span style={{ fontSize: '0.75rem', color: postDiff >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                                {postDiff > 0 ? '+' : ''}{postDiff.toFixed(1)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span>{stat.completedCount} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>/ {completionQuota.toFixed(1)}</span></span>
                                                            <span style={{ fontSize: '0.75rem', color: completionDiff >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                                {completionDiff > 0 ? '+' : ''}{completionDiff.toFixed(1)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                                ※ 達成目標は「個人の総活動量 × チーム全体の比率」が基準です。<br />
                                ※ タイプに応じて、非注力分野（連絡ベースなら投稿、FCベースなら完了）の目標値は緩和（60%）されています。
                            </div>
                        </div>
                    </div>
                </>
            )}

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
