import React, { useState } from 'react';
import { CustomSelect } from '../common/CustomSelect';
import { useProfiles, useUserMemberships, useTeams, useThreads } from '../../hooks/useSupabase';
import { useAuth } from '../../hooks/useAuth';

interface DashboardProps {
    currentTeamId: number | string | null;
    onSelectTeam: (id: number | string | null) => void;
    onThreadClick?: (threadId: string) => void;
}

// 同一人物の表記ゆれ・別アカウントを統計上ひとりに統合する
const USER_ALIASES: { [alias: string]: string } = {
    'ビルグーン': 'ボルドバートル・ビルグーン',
    '上田　晃平': '上田晃平',
    'k_oya@fts.co.jp': '大家光世',
};
const normalizeUserName = (name: string) => USER_ALIASES[name] || name;

export const Dashboard: React.FC<DashboardProps> = ({
    currentTeamId,
    onSelectTeam,
    onThreadClick
}) => {
    const { teams } = useTeams();
    const { user, profile } = useAuth();
    const { memberships } = useUserMemberships(user?.id);
    // ダッシュボード統計は全件対象。limit 0 = useThreads 側で 1000 行ずつページングして全件取得
    const { threads, loading: threadsLoading } = useThreads(currentTeamId, 0, false);
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
    const [selectedThread, setSelectedThread] = useState<any | null>(null);
    const [graphUser, setGraphUser] = useState<string | null>(null);
    const [graphMetric, setGraphMetric] = useState<'posts' | 'completions' | 'replies'>('completions');

    if (threadsLoading && threads.length === 0) return null;

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

    // 投稿作成・完了操作・返信投稿のすべてを「活動」として稼働時間に含める
    const calculateDailyActivitySpan = (timestamps: string[]) => {
        if (timestamps.length === 0) return 'N/A';

        const byDate: { [date: string]: number[] } = {};
        timestamps.forEach(d => {
            const dateKey = new Date(d).toLocaleDateString();
            if (!byDate[dateKey]) byDate[dateKey] = [];
            byDate[dateKey].push(new Date(d).getTime());
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

    const userStats: { [key: string]: { name: string; count: number; replyCount: number; completedCount: number; avgTime: string; completionRate: number; dailySpan: string; totalRepliesInCompleted: number; avgReplies: number } } = {};
    const getUserStat = (name: string) => {
        if (!userStats[name]) {
            userStats[name] = { name, count: 0, replyCount: 0, completedCount: 0, avgTime: 'N/A', completionRate: 0, dailySpan: 'N/A', totalRepliesInCompleted: 0, avgReplies: 0 };
        }
        return userStats[name];
    };

    // ユーザーごとの活動時刻(投稿・完了・返信)。稼働時間の算出に使う
    const userActivityTimes: { [name: string]: string[] } = {};
    const pushActivityTime = (name: string, ts?: string | null) => {
        if (!ts) return;
        if (!userActivityTimes[name]) userActivityTimes[name] = [];
        userActivityTimes[name].push(ts);
    };

    // 完了者の表示名(統合済み)を返す
    const getCompleterName = (t: any) => {
        const completerProfile = t.completed_by ? (profiles.find((p: any) => p.id === t.completed_by)) : null;
        return normalizeUserName(completerProfile?.display_name || completerProfile?.email || t.author_name || t.author || 'Unknown');
    };

    displayThreads.forEach(t => {
        const author = normalizeUserName(t.author_name || t.author || 'Unknown');
        getUserStat(author).count++;
        pushActivityTime(author, t.created_at);

        // 投稿(FC)しないメンバーも返信を活動としてカウントする
        (t.replies || []).forEach((r: any) => {
            const replyAuthor = normalizeUserName(r.author || 'Unknown');
            getUserStat(replyAuthor).replyCount++;
            pushActivityTime(replyAuthor, r.created_at);
        });

        if (t.status === 'completed') {
            const completerName = getCompleterName(t);
            const completerStat = getUserStat(completerName);
            completerStat.completedCount++;
            completerStat.totalRepliesInCompleted += (t.replies?.length || 0);
            pushActivityTime(completerName, t.completed_at);
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
        const userThreadsAsAuthor = displayThreads.filter(t => normalizeUserName(t.author_name || t.author || 'Unknown') === userName);
        const myThreadsCompleted = userThreadsAsAuthor.filter(t => t.status === 'completed').length;
        stats.completionRate = stats.count > 0 ? Math.round((myThreadsCompleted / stats.count) * 100) : 0;
        stats.avgTime = calculateAvgTime(userThreadsAsAuthor);
        stats.dailySpan = calculateDailyActivitySpan(userActivityTimes[userName] || []);
        stats.avgReplies = stats.completedCount > 0 ? Number((stats.totalRepliesInCompleted / stats.completedCount).toFixed(1)) : 0;
    });

    const completerStats: { [name: string]: number } = {};
    displayThreads.forEach(t => {
        if (t.status === 'completed') {
            const completerName = getCompleterName(t);
            completerStats[completerName] = (completerStats[completerName] || 0) + 1;
        }
    });

    const sortedUserStats = Object.values(userStats).sort((a, b) => b.completedCount - a.completedCount);
    const maxCompletions = Math.max(...sortedUserStats.map(s => s.completedCount), 1);

    // 活動ユーザー一覧は投稿+返信+完了の総活動量で並べる(返信のみのメンバーも含む)
    const sortedActivityStats = Object.values(userStats).sort((a, b) =>
        (b.count + b.replyCount + b.completedCount) - (a.count + a.replyCount + a.completedCount));

    // チームバランス分析: 実績-目標の差分(±)を事前計算(表と改善ヒントで共用)
    const balanceRows = (() => {
        const totalPosts = displayThreads.length;
        const totalCompletions = displayThreads.filter(t => t.status === 'completed').length;
        const totalActivity = totalPosts + totalCompletions;
        const teamPostRatio = totalActivity > 0 ? totalPosts / totalActivity : 0;
        const teamCompletionRatio = totalActivity > 0 ? totalCompletions / totalActivity : 0;

        return sortedUserStats.map(stat => {
            const userActivity = stat.count + stat.completedCount;
            let postQuota = userActivity * teamPostRatio;
            let completionQuota = userActivity * teamCompletionRatio;
            const isContactBase = stat.completedCount >= stat.count;
            if (isContactBase) {
                postQuota = postQuota * 0.6;
            } else {
                completionQuota = completionQuota * 0.6;
            }
            return {
                stat,
                typeLabel: isContactBase ? '連絡ベース' : 'FCベース',
                typeColor: isContactBase ? 'var(--accent)' : 'var(--success)',
                userActivity,
                postQuota,
                completionQuota,
                postDiff: stat.count - postQuota,
                completionDiff: stat.completedCount - completionQuota,
            };
        });
    })();

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

    if (threadsLoading && threads.length === 0) {
        return null;
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
                                    ...visibleTeams
                                        .map(t => {
                                            const parentName = t.parent_id ? teams.find(p => p.id === t.parent_id)?.name : null;
                                            return { team: t, parentName, sortKey: parentName ? `${parentName} / ${t.name}` : t.name };
                                        })
                                        .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'ja'))
                                        .map(({ team: t, parentName }) => ({
                                            value: t.id,
                                            label: (
                                                <>
                                                    {parentName && (
                                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.78em', whiteSpace: 'nowrap' }}>
                                                            {parentName} /&nbsp;
                                                        </span>
                                                    )}
                                                    {t.name}
                                                </>
                                            )
                                        }))
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
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-muted)' }}>完了数（チーム別）/ 全体の完了率</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '25px', flexWrap: 'wrap' }}>
                                <div style={{ position: 'relative', width: '140px', height: '140px', flexShrink: 0 }}>
                                    <svg width="140" height="140" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
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
                                        <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{completionRate}%</div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>全体完了率</div>
                                    </div>
                                </div>
                                <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
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
                        </div>

                        <div className="task-card" style={{ padding: '25px', gridColumn: 'span 1' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-muted)' }}>活動ユーザー一覧</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '350px', overflowY: 'auto' }} className="custom-scrollbar">
                                {sortedActivityStats.map((stat, index) => (
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
                                            <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{stat.count + stat.replyCount + stat.completedCount} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>件</span></div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>投稿{stat.count}・返信{stat.replyCount}・完了{stat.completedCount}</div>
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
                                    {balanceRows.length === 0 ? (
                                        <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>データなし</td></tr>
                                    ) : (
                                        balanceRows.map(({ stat, typeLabel, typeColor, userActivity, postQuota, completionQuota, postDiff, completionDiff }) => (
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
                                        ))
                                    )}
                                </tbody>
                            </table>
                            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                                ※ 達成目標は「個人の総活動量 × チーム全体の比率」が基準です。<br />
                                ※ タイプに応じて、非注力分野（連絡ベースなら投稿、FCベースなら完了）の目標値は緩和（60%）されています。
                            </div>

                            {(() => {
                                // 表を眺めただけでは分からない構造的な偏りだけを抽出する。
                                // 閾値未満のときは何も出さない(わかりきった内容は表示しない)
                                const insights: string[] = [];
                                const completedList = displayThreads.filter(t => t.status === 'completed');

                                // 1) 起票者→完了者ペアの偏り(誰が誰の案件を閉じているか)
                                const pairCounts: { [k: string]: number } = {};
                                const completerTotals: { [name: string]: number } = {};
                                completedList.forEach(t => {
                                    const author = normalizeUserName(t.author_name || t.author || 'Unknown');
                                    const completer = getCompleterName(t);
                                    completerTotals[completer] = (completerTotals[completer] || 0) + 1;
                                    if (author !== completer) {
                                        const k = `${author}→${completer}`;
                                        pairCounts[k] = (pairCounts[k] || 0) + 1;
                                    }
                                });
                                Object.entries(pairCounts)
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 2)
                                    .forEach(([k, n]) => {
                                        const [author, completer] = k.split('→');
                                        const pct = Math.round((n / (completerTotals[completer] || 1)) * 100);
                                        if (n >= 10 && pct >= 25) {
                                            insights.push(`${completer}さんの完了実績の${pct}%(${n}件)は${author}さんの起票分。${author}さんが自分の起票を完了まで担当すると、両者の±が同時に0へ近づきます`);
                                        }
                                    });

                                // 2) 自己完結率(自分の起票を自分で完了する率)
                                const selfStats: { [name: string]: { self: number; total: number } } = {};
                                completedList.forEach(t => {
                                    const author = normalizeUserName(t.author_name || t.author || 'Unknown');
                                    if (!selfStats[author]) selfStats[author] = { self: 0, total: 0 };
                                    selfStats[author].total++;
                                    if (getCompleterName(t) === author) selfStats[author].self++;
                                });
                                const selfRates = Object.entries(selfStats)
                                    .filter(([, v]) => v.total >= 10)
                                    .map(([name, v]) => ({ name, rate: Math.round((v.self / v.total) * 100) }));
                                if (selfRates.length >= 2) {
                                    const teamAvg = Math.round(selfRates.reduce((a, r) => a + r.rate, 0) / selfRates.length);
                                    const lowest = [...selfRates].sort((a, b) => a.rate - b.rate)[0];
                                    if (lowest.rate < teamAvg - 20) {
                                        insights.push(`「自分の起票を自分で完了する率」はチーム平均${teamAvg}%に対し、${lowest.name}さんは${lowest.rate}%。起票と完了の分業がここに集中しており、±乖離の構造的な原因になっています`);
                                    }
                                }

                                // 3) 完了ボタンと実対応のズレ(最終返信者 ≠ 完了者)
                                const mismatch: { [completer: string]: { total: number; mism: number; by: { [n: string]: number } } } = {};
                                completedList.forEach(t => {
                                    const replies = t.replies || [];
                                    if (replies.length === 0) return;
                                    const last = [...replies].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[replies.length - 1];
                                    const lastAuthor = normalizeUserName(last.author || 'Unknown');
                                    const completer = getCompleterName(t);
                                    if (!mismatch[completer]) mismatch[completer] = { total: 0, mism: 0, by: {} };
                                    mismatch[completer].total++;
                                    if (lastAuthor !== completer) {
                                        mismatch[completer].mism++;
                                        mismatch[completer].by[lastAuthor] = (mismatch[completer].by[lastAuthor] || 0) + 1;
                                    }
                                });
                                Object.entries(mismatch).forEach(([completer, v]) => {
                                    if (v.total >= 15 && v.mism / v.total >= 0.5) {
                                        const top = Object.entries(v.by).sort((a, b) => b[1] - a[1])[0];
                                        insights.push(`${completer}さんが完了にした${v.total}件のうち${v.mism}件は、最後に返信(実対応)したのが別メンバー(最多: ${top[0]}さん ${top[1]}件)。完了ボタンを実対応者が押す運用にすると、完了実績が実態に近づきます`);
                                    }
                                });

                                // 4) 直近30日の改善傾向(不足側の比率が上がっている人)
                                const monthAgoIso = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString(); })();
                                balanceRows.filter(r => r.userActivity >= 20).forEach(r => {
                                    const name = r.stat.name;
                                    const recentPosts = displayThreads.filter(t => normalizeUserName(t.author_name || t.author || 'Unknown') === name && t.created_at >= monthAgoIso).length;
                                    const recentComps = completedList.filter(t => getCompleterName(t) === name && (t.completed_at || '') >= monthAgoIso).length;
                                    const recentTotal = recentPosts + recentComps;
                                    if (recentTotal < 8) return;
                                    const allCompShare = r.stat.completedCount / Math.max(1, r.stat.count + r.stat.completedCount);
                                    const recentCompShare = recentComps / recentTotal;
                                    const diffPt = Math.round((recentCompShare - allCompShare) * 100);
                                    if (r.completionDiff < 0 && diffPt >= 15) {
                                        insights.push(`${name}さんは直近30日、完了の比率が全期間${Math.round(allCompShare * 100)}%→${Math.round(recentCompShare * 100)}%に上昇。不足していた完了側が改善傾向です`);
                                    }
                                    if (r.postDiff < 0 && diffPt <= -15) {
                                        insights.push(`${name}さんは直近30日、投稿の比率が全期間${Math.round((1 - allCompShare) * 100)}%→${Math.round((1 - recentCompShare) * 100)}%に上昇。不足していた投稿側が改善傾向です`);
                                    }
                                });

                                const shown = insights.slice(0, 5);
                                if (shown.length === 0) return null;

                                return (
                                    <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px' }}>🔍 データからの気づき</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            {shown.map((s, i) => (
                                                <div key={i} style={{ fontSize: '0.82rem', lineHeight: 1.7, display: 'flex', gap: '8px' }}>
                                                    <span style={{ color: 'var(--accent)', flexShrink: 0 }}>•</span>
                                                    <span>{s}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                    <div className="task-card" style={{ padding: '25px', marginTop: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--text-muted)' }}>メンバー別 月次推移（直近6か月）</h3>
                            <CustomSelect
                                options={[
                                    { value: '__all__', label: 'すべてのメンバー（一覧）' },
                                    ...sortedActivityStats.map(s => ({ value: s.name, label: s.name }))
                                ]}
                                value={graphUser || sortedActivityStats[0]?.name || ''}
                                onChange={(v) => setGraphUser(String(v))}
                                style={{ width: '240px' }}
                            />
                        </div>
                        {(() => {
                            const target = graphUser || sortedActivityStats[0]?.name;
                            if (!target) return <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>データなし</div>;

                            const monthKey = (d: string) => { const dt = new Date(d); return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}`; };
                            const now = new Date();
                            const months: string[] = [];
                            for (let i = 5; i >= 0; i--) {
                                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                                months.push(`${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
                            }

                            const calcMonthly = (name: string) => months.map(m => {
                                let posts = 0, completions = 0, replies = 0;
                                threads.forEach(t => {
                                    if (normalizeUserName(t.author_name || t.author || 'Unknown') === name && monthKey(t.created_at) === m) posts++;
                                    if (t.status === 'completed' && t.completed_at && getCompleterName(t) === name && monthKey(t.completed_at) === m) completions++;
                                    (t.replies || []).forEach((r: any) => {
                                        if (normalizeUserName(r.author || 'Unknown') === name && monthKey(r.created_at) === m) replies++;
                                    });
                                });
                                return { m, posts, completions, replies };
                            });

                            const SERIES = [
                                { key: 'posts' as const, label: '投稿', color: 'var(--success)' },
                                { key: 'completions' as const, label: '完了', color: 'var(--accent)' },
                                { key: 'replies' as const, label: '返信', color: '#8B8CC7' },
                            ];

                            const legend = (
                                <div style={{ display: 'flex', gap: '14px', marginBottom: '12px' }}>
                                    {SERIES.map(s => (
                                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: s.color, display: 'inline-block' }}></span>
                                            {s.label}
                                        </div>
                                    ))}
                                </div>
                            );

                            const renderChart = (data: ReturnType<typeof calcMonthly>) => {
                                const maxVal = Math.max(1, ...data.flatMap(d => [d.posts, d.completions, d.replies]));
                                return (
                                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${months.length}, 1fr)`, gap: '10px', alignItems: 'end' }}>
                                        {data.map(d => (
                                            <div key={d.m} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '150px' }}>
                                                    {SERIES.map(s => (
                                                        <div key={s.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${d.m} ${s.label}: ${d[s.key]}件`}>
                                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{d[s.key] > 0 ? d[s.key] : ''}</span>
                                                            <div style={{ width: '16px', height: `${(d[s.key] / maxVal) * 120}px`, minHeight: d[s.key] > 0 ? '3px' : '0px', background: s.color, borderRadius: '3px 3px 0 0', transition: 'height 0.6s ease-out' }}></div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{d.m}</span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            };

                            // 全員を1つの折れ線グラフに重ね描き(指標はチップで切替)
                            const renderAllLines = () => {
                                // 1パスで member×month を集計(メンバーごとに threads を舐めない)
                                const map: { [name: string]: { [m: string]: { posts: number; completions: number; replies: number } } } = {};
                                const ensure = (name: string, m: string) => {
                                    if (!months.includes(m)) return null;
                                    if (!map[name]) map[name] = {};
                                    if (!map[name][m]) map[name][m] = { posts: 0, completions: 0, replies: 0 };
                                    return map[name][m];
                                };
                                threads.forEach(t => {
                                    const p = ensure(normalizeUserName(t.author_name || t.author || 'Unknown'), monthKey(t.created_at));
                                    if (p) p.posts++;
                                    if (t.status === 'completed' && t.completed_at) {
                                        const c = ensure(getCompleterName(t), monthKey(t.completed_at));
                                        if (c) c.completions++;
                                    }
                                    (t.replies || []).forEach((r: any) => {
                                        const rp = ensure(normalizeUserName(r.author || 'Unknown'), monthKey(r.created_at));
                                        if (rp) rp.replies++;
                                    });
                                });

                                const lines = Object.entries(map)
                                    .map(([name, byMonth]) => {
                                        const values = months.map(m => byMonth[m]?.[graphMetric] || 0);
                                        return { name, values, total: values.reduce((a, b) => a + b, 0) };
                                    })
                                    .filter(l => l.total > 0)
                                    .sort((a, b) => b.total - a.total)
                                    .slice(0, 10);

                                const COLORS = ['#00B7C3', '#92C353', '#E8A33D', '#E851FF', '#FF6B6B', '#8B8CC7', '#4FC3F7', '#F06292', '#AED581', '#FFD54F'];
                                const W = 640, H = 260, PL = 40, PR = 14, PT = 14, PB = 28;
                                const maxV = Math.max(1, ...lines.flatMap(l => l.values));
                                const x = (i: number) => PL + (i * (W - PL - PR)) / (months.length - 1);
                                const y = (v: number) => H - PB - (v / maxV) * (H - PT - PB);
                                const gridVals = [...new Set([0, 0.25, 0.5, 0.75, 1].map(r => Math.round(maxV * r)))];

                                return (
                                    <>
                                        <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                                            {SERIES.map(s => (
                                                <button
                                                    key={s.key}
                                                    onClick={() => setGraphMetric(s.key)}
                                                    style={{
                                                        padding: '4px 12px', fontSize: '0.75rem', borderRadius: '15px', border: 'none', cursor: 'pointer',
                                                        background: graphMetric === s.key ? 'var(--primary)' : 'rgba(255,255,255,0.06)',
                                                        color: graphMetric === s.key ? 'white' : 'var(--text-muted)', transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {s.label}
                                                </button>
                                            ))}
                                        </div>
                                        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
                                            {gridVals.map((v, i) => (
                                                <g key={i}>
                                                    <line x1={PL} y1={y(v)} x2={W - PR} y2={y(v)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
                                                    <text x={PL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="var(--text-muted)">{v}</text>
                                                </g>
                                            ))}
                                            {months.map((m, i) => (
                                                <text key={m} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{m.slice(5)}月</text>
                                            ))}
                                            {lines.map((l, li) => (
                                                <g key={l.name} style={{ cursor: 'pointer' }} onClick={() => setGraphUser(l.name)}>
                                                    <polyline
                                                        points={l.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')}
                                                        fill="none" stroke={COLORS[li % COLORS.length]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
                                                    />
                                                    {l.values.map((v, i) => (
                                                        <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill={COLORS[li % COLORS.length]}>
                                                            <title>{`${l.name} ${months[i]}: ${v}件`}</title>
                                                        </circle>
                                                    ))}
                                                </g>
                                            ))}
                                        </svg>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                                            {lines.map((l, li) => (
                                                <div key={l.name} onClick={() => setGraphUser(l.name)} title="クリックで個人表示に切替" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', cursor: 'pointer', padding: '3px 10px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                    <span style={{ width: '10px', height: '3px', borderRadius: '2px', background: COLORS[li % COLORS.length], display: 'inline-block' }}></span>
                                                    {l.name}
                                                    <span style={{ color: 'var(--text-muted)' }}>{l.total}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                );
                            };

                            return (
                                <>
                                    {target === '__all__' ? renderAllLines() : (
                                        <>
                                            {legend}
                                            {renderChart(calcMonthly(target))}
                                        </>
                                    )}
                                    <div style={{ marginTop: '10px', fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'right' }}>
                                        ※ 表示中のチームの全期間データから集計しています（期間フィルタの影響を受けません）。
                                        {target === '__all__' && ' 折れ線は選択指標の上位10名まで。線・凡例クリックで個人表示に切替。'}
                                    </div>
                                </>
                            );
                        })()}
                    </div>

                    <div className="task-card" style={{ padding: '25px', marginTop: '20px' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '20px', color: 'var(--text-muted)' }}>解決まで時間を要したスレッド (Top 100)</h3>
                        <div style={{ overflowX: 'auto', maxHeight: '500px' }} className="custom-scrollbar">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1 }}>
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
                                            const completerName = getCompleterName(t);

                                            return (
                                                <tr
                                                    key={t.id}
                                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        setSelectedThread(t);
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
                                                    setSelectedThread(t);
                                                }}
                                            >
                                                <div style={{ maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.title}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>対応者: {getCompleterName(t)}</div>
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
                    <div className="modal glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '560px', width: '90%', animation: 'modalFadeIn 0.3s ease-out', padding: '30px', maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--glass-border)', boxShadow: '0 15px 50px rgba(0,0,0,0.6)', position: 'relative', zIndex: 100001 }}>
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
                        {(() => {
                            const byDateDesc = (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                            const posted = displayThreads.filter(t => normalizeUserName(t.author_name || t.author || 'Unknown') === selectedUser).sort(byDateDesc);
                            const replied = displayThreads.filter(t => (t.replies || []).some((r: any) => normalizeUserName(r.author || 'Unknown') === selectedUser)).sort(byDateDesc);
                            const completedList = displayThreads.filter(t => t.status === 'completed' && getCompleterName(t) === selectedUser).sort(byDateDesc);

                            const renderSection = (title: string, items: any[]) => (
                                <div style={{ marginTop: '15px' }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px' }}>{title} ({items.length})</div>
                                    {items.length === 0 ? (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '4px 10px' }}>なし</div>
                                    ) : (
                                        <div className="custom-scrollbar" style={{ maxHeight: '140px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {items.map(t => (
                                                <div
                                                    key={t.id}
                                                    onClick={() => setSelectedThread(t)}
                                                    style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', alignItems: 'center' }}
                                                >
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                                                    <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontSize: '0.7rem' }}>{new Date(t.created_at).toLocaleDateString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );

                            return (
                                <>
                                    {renderSection('投稿したスレッド', posted)}
                                    {renderSection('返信したスレッド', replied)}
                                    {renderSection('完了したスレッド', completedList)}
                                </>
                            );
                        })()}
                        <div style={{ marginTop: '20px', fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                            ※稼働時間は、各日の最初の活動から最後の活動までの間隔の平均です。
                        </div>
                    </div>
                </div>
            )}

            {selectedThread && (
                <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100002 }} onClick={() => setSelectedThread(null)}>
                    <div className="modal glass-panel" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px', width: '90%', animation: 'modalFadeIn 0.3s ease-out', padding: '30px', maxHeight: '85vh', overflowY: 'auto', border: '1px solid var(--glass-border)', boxShadow: '0 15px 50px rgba(0,0,0,0.6)', position: 'relative', zIndex: 100003 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px', gap: '10px' }}>
                            <div style={{ minWidth: 0 }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{selectedThread.title}</h3>
                                <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    <span>投稿: {normalizeUserName(selectedThread.author_name || selectedThread.author || 'Unknown')} ({new Date(selectedThread.created_at).toLocaleString()})</span>
                                    {selectedThread.status === 'completed' && selectedThread.completed_at && (
                                        <span style={{ color: 'var(--success)' }}>完了: {getCompleterName(selectedThread)} ({new Date(selectedThread.completed_at).toLocaleString()})</span>
                                    )}
                                </div>
                            </div>
                            <button className="btn btn-sm btn-outline" onClick={() => setSelectedThread(null)} style={{ padding: '0 8px', height: '32px', flexShrink: 0 }}>✕</button>
                        </div>
                        <div
                            style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '10px', fontSize: '0.9rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                            dangerouslySetInnerHTML={{ __html: selectedThread.content || '' }}
                        />
                        {(selectedThread.replies || []).length > 0 && (
                            <div style={{ marginTop: '15px' }}>
                                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>返信 ({selectedThread.replies.length})</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {[...selectedThread.replies]
                                        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                                        .map((r: any) => (
                                            <div key={r.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                                                    {normalizeUserName(r.author || 'Unknown')} ・ {new Date(r.created_at).toLocaleString()}
                                                </div>
                                                <div
                                                    style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                                    dangerouslySetInnerHTML={{ __html: r.content || '' }}
                                                />
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}
                        {onThreadClick && (
                            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                                <button className="btn btn-sm btn-outline" onClick={() => { onThreadClick(selectedThread.id); setSelectedThread(null); }}>
                                    フィードで開く
                                </button>
                            </div>
                        )}
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
