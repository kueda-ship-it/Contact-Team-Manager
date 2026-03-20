import React, { useState } from 'react';
import { CustomSelect } from '../common/CustomSelect';
import { useProfiles, useUserMemberships, useTeams, useThreads } from '../../hooks/useSupabase';
import { useAuth } from '../../hooks/useAuth';

interface DashboardProps {
    currentTeamId: number | string | null;
    onSelectTeam: (id: number | string | null) => void;
    onThreadClick?: (threadId: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
    currentTeamId,
    onSelectTeam,
    onThreadClick
}) => {
    const { teams } = useTeams();
    const { user, profile } = useAuth();
    const { memberships } = useUserMemberships(user?.id);
    // Fetch more threads for accurate dashboard stats (limit 1000)
    // useThreads(teamId, limit, ascending)
    const { threads, loading: threadsLoading } = useThreads(currentTeamId, 1000, false);
    const { profiles } = useProfiles();
    const [period, setPeriod] = useState<'all' | 'year' | 'month' | 'week' | 'day' | 'custom'>('all');
    // User Activity Stats State - Moved up to avoid hook order errors
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
    const [selectedReplyCount, setSelectedReplyCount] = useState<string | null>(null);
    const [replyChartType, setReplyChartType] = useState<'bar' | 'pie'>('bar');

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

    const userStats: { [key: string]: { name: string; count: number; completedCount: number; avgTime: string; completionRate: number; dailySpan: string; totalRepliesInCompleted: number; avgReplies: number } } = {};

    displayThreads.forEach(t => {
        const author = t.author_name || t.author || 'Unknown';
        if (!userStats[author]) {
            userStats[author] = { name: author, count: 0, completedCount: 0, avgTime: 'N/A', completionRate: 0, dailySpan: 'N/A', totalRepliesInCompleted: 0, avgReplies: 0 };
        }
        userStats[author].count++;

        if (t.status === 'completed') {
            const completerProfile = t.completed_by ? (profiles.find((p: any) => p.id === t.completed_by)) : null;
            const completerName = completerProfile?.display_name || completerProfile?.email || t.author_name || t.author || 'Unknown';

            if (!userStats[completerName]) {
                userStats[completerName] = { name: completerName, count: 0, completedCount: 0, avgTime: 'N/A', completionRate: 0, dailySpan: 'N/A', totalRepliesInCompleted: 0, avgReplies: 0 };
            }
            userStats[completerName].completedCount++;
            userStats[completerName].totalRepliesInCompleted += (t.replies?.length || 0);
        }
    });

    // --- New Reply Analytics ---
    const threadsWithReplies = displayThreads.filter(t => (t.replies?.length || 0) > 0);
    const threadsWithoutReplies = displayThreads.filter(t => (t.replies?.length || 0) === 0);
    const replyRate = totalThreads > 0 ? Math.round((threadsWithReplies.length / totalThreads) * 100) : 0;
    const totalReplies = displayThreads.reduce((acc, t) => acc + (t.replies?.length || 0), 0);
    const avgRepliesPerThread = threadsWithReplies.length > 0 ? (totalReplies / threadsWithReplies.length).toFixed(1) : '0';

    const avgTimeWithReplies = calculateAvgTime(threadsWithReplies);
    const avgTimeWithoutReplies = calculateAvgTime(threadsWithoutReplies);

    // Reply Distribution Analysis
    const replyCountDist: { [key: string]: number } = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
    const replyCountAvgTime: { [key: string]: string } = {};
    const replyCountThreads: { [key: string]: any[] } = { '1': [], '2': [], '3': [], '4': [], '5+': [] };

    threadsWithReplies.forEach(t => {
        const count = t.replies?.length || 0;
        const key = count >= 5 ? '5+' : String(count);
        replyCountDist[key]++;
        replyCountThreads[key].push(t);
    });

    Object.keys(replyCountThreads).forEach(key => {
        replyCountAvgTime[key] = calculateAvgTime(replyCountThreads[key]);
    });

    // Longest Completion Ranking (Top 100)
    const longestThreads = displayThreads
        .filter(t => t.status === 'completed' && t.completed_at && t.created_at)
        .map(t => {
            const durationMs = new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime();
            return { ...t, durationMs };
        })
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 100);

    const formatDuration = (ms: number) => {
        const days = Math.floor(ms / (1000 * 60 * 60 * 24));
        const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        if (days > 0) return `${days}日 ${hours}時間`;
        if (hours > 0) return `${hours}時間 ${mins}分`;
        return `${mins}分`;
    };

    Object.keys(userStats).forEach(userName => {
        const stats = userStats[userName];
        const userThreadsAsAuthor = displayThreads.filter(t => (t.author_name || t.author || 'Unknown') === userName);
        const myThreadsCompleted = userThreadsAsAuthor.filter(t => t.status === 'completed').length;
        stats.completionRate = stats.count > 0 ? Math.round((myThreadsCompleted / stats.count) * 100) : 0;
        stats.avgTime = calculateAvgTime(userThreadsAsAuthor);
        stats.dailySpan = calculateDailyActivitySpan(userThreadsAsAuthor);
        stats.avgReplies = stats.completedCount > 0 ? Number((stats.totalRepliesInCompleted / stats.completedCount).toFixed(1)) : 0;
    });

    const completerStats: { [name: string]: number } = {};
    displayThreads.forEach(t => {
        if (t.status === 'completed') {
            const completerProfile = t.completed_by ? (profiles.find((p: any) => p.id === t.completed_by)) : null;
            const completerName = completerProfile?.display_name || completerProfile?.email || t.author_name || t.author || 'Unknown';
            completerStats[completerName] = (completerStats[completerName] || 0) + 1;
        }
    });

    const sortedUserStats = Object.values(userStats).sort((a, b) => b.completedCount - a.completedCount);
    const maxCompletions = Math.max(...sortedUserStats.map(s => s.completedCount), 1);

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
                        <div className="task-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '25px', background: 'linear-gradient(145deg, rgba(220, 38, 38, 0.05), rgba(220, 38, 38, 0.02))' }}>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>返信ありの割合</div>
                            <div style={{ fontSize: '2.8rem', fontWeight: 800, color: 'var(--danger)' }}>{replyRate}%</div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px', marginBottom: '30px' }}>
                        <div className="task-card" style={{ padding: '25px', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-muted)' }}>返信数の分布</h3>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                        onClick={() => setReplyChartType('bar')}
                                        style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', opacity: replyChartType === 'bar' ? 1 : 0.3, color: 'var(--text-main)', transition: 'opacity 0.2s' }}
                                        title="棒グラフ"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                                    </button>
                                    <button 
                                        onClick={() => setReplyChartType('pie')}
                                        style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', opacity: replyChartType === 'pie' ? 1 : 0.3, color: 'var(--text-main)', transition: 'opacity 0.2s' }}
                                        title="円グラフ"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
                                    </button>
                                </div>
                            </div>
                            
                            {replyChartType === 'bar' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    {Object.entries(replyCountDist).map(([count, total]) => (
                                        <div key={count}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.9rem' }}>
                                                <span style={{ fontWeight: 600 }}>{count} 件の返信</span>
                                                <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{total} スレッド <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>({Math.round(threadsWithReplies.length > 0 ? (total / threadsWithReplies.length) * 100 : 0)}%)</span></span>
                                            </div>
                                            <div 
                                                style={{ height: '14px', background: 'rgba(255,255,255,0.05)', borderRadius: '7px', overflow: 'hidden', cursor: 'pointer' }}
                                                onClick={() => setSelectedReplyCount(count)}
                                                title="クリックして詳細分析を表示"
                                            >
                                                <div
                                                    style={{
                                                        height: '100%',
                                                        width: `${threadsWithReplies.length > 0 ? (total / threadsWithReplies.length) * 100 : 0}%`,
                                                        background: 'var(--danger)',
                                                        transition: 'width 1s ease-out',
                                                        position: 'relative',
                                                        minWidth: '30px'
                                                    }}
                                                >
                                                    <div style={{ position: 'absolute', right: '5px', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', color: 'white', fontWeight: 800, whiteSpace: 'nowrap' }}>
                                                        {replyCountAvgTime[count]}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '20px', minHeight: '180px' }}>
                                    <div style={{ position: 'relative' }}>
                                        <svg width="140" height="140" viewBox="0 0 100 100">
                                            {(() => {
                                                let currentPercent = 0;
                                                const colors = ['#ff4d4d', '#ff8080', '#ffb3b3', '#ffe6e6', '#ffffff'];
                                                return Object.entries(replyCountDist).map(([count, total], i) => {
                                                    const percent = threadsWithReplies.length > 0 ? (total / threadsWithReplies.length) * 100 : 0;
                                                    const startPercent = currentPercent;
                                                    currentPercent += percent;
                                                    
                                                    if (percent === 0) return null;

                                                    const radius = 35;
                                                    const circumference = 2 * Math.PI * radius;
                                                    const offset = circumference - (percent / 100) * circumference;
                                                    const rotation = (startPercent / 100) * 360 - 90;

                                                    return (
                                                        <circle
                                                            key={count}
                                                            cx="50"
                                                            cy="50"
                                                            r={radius}
                                                            fill="transparent"
                                                            stroke={colors[i % colors.length]}
                                                            strokeWidth="15"
                                                            strokeDasharray={circumference}
                                                            strokeDashoffset={offset}
                                                            strokeLinecap="butt"
                                                            transform={`rotate(${rotation} 50 50)`}
                                                            style={{ transition: 'all 0.5s ease', cursor: 'pointer' }}
                                                            onClick={() => setSelectedReplyCount(count)}
                                                        >
                                                            <title>{count}件の返信: {total}スレッド ({Math.round(percent)}%)</title>
                                                        </circle>
                                                    );
                                                });
                                            })()}
                                            <text x="50" y="50" textAnchor="middle" dy=".3em" fill="var(--text-main)" fontSize="7" fontWeight="bold">返信数</text>
                                        </svg>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {(() => {
                                            const colors = ['#ff4d4d', '#ff8080', '#ffb3b3', '#ffe6e6', '#ffffff'];
                                            return Object.entries(replyCountDist).map(([count, total], i) => (
                                                <div key={count} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', opacity: total > 0 ? 1 : 0.3 }} onClick={() => setSelectedReplyCount(count)}>
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: colors[i % colors.length] }}></div>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{count}件:</span>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-main)', fontWeight: 700 }}>{Math.round(threadsWithReplies.length > 0 ? (total / threadsWithReplies.length) * 100 : 0)}%</span>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                </div>
                            )}

                            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>総返信数</span>
                                <span style={{ fontWeight: 700 }}>{totalReplies} 件 (平均 {avgRepliesPerThread} 件)</span>
                            </div>
                        </div>

                        <div className="task-card" style={{ padding: '25px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-muted)' }}>返信有無による完了時間の比較</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', justifyContent: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ width: '12px', height: '40px', background: 'var(--danger)', borderRadius: '6px' }}></div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>返信ありのスレッド</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{avgTimeWithReplies}</div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                    <div style={{ width: '12px', height: '40px', background: 'var(--text-muted)', borderRadius: '6px' }}></div>
                                    <div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>返信なしのスレッド</div>
                                        <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{avgTimeWithoutReplies}</div>
                                    </div>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '10px' }}>
                                    ※返信が多いほど複雑な案件である可能性が高く、解決まで時間を要する傾向にあります。
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                        <div className="card glass-panel" style={{ padding: '25px', overflow: 'hidden' }}>
                            <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                                メンバー分析 (対応実積)
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 80px 80px', gap: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', paddingBottom: '5px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 600 }}>
                                    <div>メンバー</div>
                                    <div style={{ textAlign: 'right' }}>完了数</div>
                                    <div style={{ textAlign: 'right' }}>平均返信</div>
                                    <div style={{ textAlign: 'right' }}>平均時間</div>
                                </div>
                                {sortedUserStats.filter(s => s.completedCount > 0).slice(0, 8).map((stat) => (
                                    <div key={stat.name} style={{ cursor: 'pointer' }} onClick={() => setSelectedUser(stat.name)}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                                            <span style={{ fontWeight: 600 }}>{stat.name}</span>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <span style={{ fontWeight: 700, width: '40px', textAlign: 'right' }}>{stat.completedCount}件</span>
                                                <span style={{ color: stat.avgReplies > 2.5 ? 'var(--danger)' : 'var(--text-main)', fontWeight: 700, width: '60px', textAlign: 'right' }}>{stat.avgReplies}件</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', width: '70px', textAlign: 'right' }}>{stat.avgTime}</span>
                                            </div>
                                        </div>
                                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div
                                                style={{
                                                    height: '100%',
                                                    width: `${(stat.completedCount / maxCompletions) * 100}%`,
                                                    background: stat.avgReplies > 2.5 ? 'linear-gradient(90deg, var(--danger), #ff8080)' : 'linear-gradient(90deg, var(--primary), var(--accent))',
                                                    borderRadius: '3px',
                                                    transition: 'width 1s ease-out'
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="card glass-panel" style={{ padding: '25px' }}>
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
                    <div className="task-card" style={{ padding: '25px', marginTop: '20px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-muted)' }}>解決まで時間を要したスレッド (Top 100)</h3>
                        <div style={{ overflowX: 'auto', maxHeight: '500px' }} className="custom-scrollbar">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-main)', zIndex: 1 }}>
                                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)' }}>
                                        <th style={{ padding: '10px', textAlign: 'left' }}>スレッドタイトル</th>
                                        <th style={{ padding: '10px', textAlign: 'center' }}>返信数</th>
                                        <th style={{ padding: '10px', textAlign: 'center' }}>対応者</th>
                                        <th style={{ padding: '10px', textAlign: 'right' }}>所要時間</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {longestThreads.length === 0 ? (
                                        <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>データなし</td></tr>
                                    ) : (
                                        longestThreads.map(t => {
                                            const completerProfile = t.completed_by ? (profiles.find((p: any) => p.id === t.completed_by)) : null;
                                            const completerName = completerProfile?.display_name || completerProfile?.email || t.author_name || t.author || 'Unknown';
                                            
                                            return (
                                                <tr 
                                                    key={t.id} 
                                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        onThreadClick && onThreadClick(t.id);
                                                    }}
                                                    className="dashboard-ranking-row"
                                                >
                                                    <td style={{ padding: '12px 10px', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        <span style={{ fontWeight: 600, color: 'var(--accent)', marginRight: '8px' }}>#{t.title.split(' ')[0]}</span>
                                                        <span style={{ color: 'var(--text-main)' }}>{t.title.split(' ').slice(1).join(' ') || t.title}</span>
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                        <span style={{ padding: '2px 8px', borderRadius: '12px', background: 'rgba(255,255,255,0.05)', fontSize: '0.8rem' }}>
                                                            {t.replies?.length || 0}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'center', fontSize: '0.85rem' }}>
                                                        {completerName}
                                                    </td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>
                                                        {formatDuration(t.durationMs)}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {selectedReplyCount && (
                <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }} onClick={() => setSelectedReplyCount(null)}>
                    <div className="modal glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px', width: '90%', animation: 'modalFadeIn 0.3s ease-out', padding: '30px', maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--glass-border)', boxShadow: '0 15px 50px rgba(0,0,0,0.6)', position: 'relative', zIndex: 100001 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>返信数 {selectedReplyCount} 件の分析</h3>
                                <p style={{ margin: '5px 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>該当スレッド: {replyCountDist[selectedReplyCount]} 件</p>
                            </div>
                            <button className="btn btn-sm btn-outline" onClick={() => setSelectedReplyCount(null)} style={{ padding: '0 8px', height: '32px' }}>✕</button>
                        </div>
                        
                        <div style={{ display: 'grid', gap: '20px' }}>
                            <div style={{ background: 'rgba(220, 38, 38, 0.1)', padding: '20px', borderRadius: '15px', border: '1px solid rgba(220, 38, 38, 0.2)', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '10px' }}>このカテゴリの平均完了時間</div>
                                <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--danger)' }}>{replyCountAvgTime[selectedReplyCount]}</div>
                            </div>

                            <div>
                                <h4 style={{ fontSize: '0.9rem', marginBottom: '15px', color: 'var(--text-muted)' }}>解決まで時間がかかったスレッド (ワースト)</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {replyCountThreads[selectedReplyCount]
                                        .filter(t => t.status === 'completed' && t.completed_at)
                                        .map(t => ({ ...t, durationMs: new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime() }))
                                        .sort((a, b) => b.durationMs - a.durationMs)
                                        .slice(0, 5)
                                        .map(t => (
                                            <div 
                                                key={t.id} 
                                                style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 15px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onThreadClick && onThreadClick(t.id);
                                                    setSelectedReplyCount(null);
                                                }}
                                            >
                                                <div style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.title}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>対応者: {profiles.find((p: any) => p.id === t.completed_by)?.display_name || 'Unknown'}</div>
                                                </div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--danger)' }}>{formatDuration(t.durationMs)}</div>
                                            </div>
                                        ))
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {selectedUser && (
                <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }} onClick={() => setSelectedUser(null)}>
                    <div className="modal glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', width: '90%', animation: 'modalFadeIn 0.3s ease-out', padding: '30px', border: '1px solid var(--glass-border)', boxShadow: '0 15px 50px rgba(0,0,0,0.6)', position: 'relative', zIndex: 100001 }}>
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
                .dashboard-ranking-row:hover { background: rgba(255,255,255,0.03); }
                .dashboard-ranking-row:hover td { color: var(--accent); }
            `}</style>
        </div>
    );
};
