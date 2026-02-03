/**
 * Dashboard Analytics Script
 * Admin/Manager専用統計ダッシュボード
 */

const SUPABASE_URL = "https://bvhfmwrjrrqrpqvlzkyd.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ2aGZtd3JqcnJxcnBxdmx6a3lkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzcxNzczMzQsImV4cCI6MjA1Mjc1MzMzNH0.SSOcbdXqye0lPUQXMhMQ_PXcYrk6c";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUser = null;
let currentProfile = null;
let charts = {};

// Auth Check
async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        alert('ログインが必要です');
        window.location.href = 'index.html';
        return false;
    }

    currentUser = user;

    // Get profile and check role
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    currentProfile = profile;

    if (!profile || !['Admin', 'Manager'].includes(profile.role)) {
        alert('このページはAdmin/Manager専用です');
        window.location.href = 'index.html';
        return false;
    }

    return true;
}

// Load and analyze data
async function loadDashboardData() {
    const periodFilter = document.getElementById('period-filter').value;
    let dateFilter = null;

    if (periodFilter !== 'all') {
        const daysAgo = parseInt(periodFilter);
        dateFilter = new Date();
        dateFilter.setDate(dateFilter.getDate() - daysAgo);
    }

    // Fetch threads
    let threadsQuery = supabase.from('threads').select('*');
    if (dateFilter) {
        threadsQuery = threadsQuery.gte('created_at', dateFilter.toISOString());
    }
    const { data: threads } = await threadsQuery;

    // Fetch replies
    let repliesQuery = supabase.from('replies').select('*');
    if (dateFilter) {
        repliesQuery = repliesQuery.gte('created_at', dateFilter.toISOString());
    }
    const { data: replies } = await repliesQuery;

    // Fetch profiles
    const { data: profiles } = await supabase.from('profiles').select('*');

    // Fetch teams
    const { data: teams } = await supabase.from('teams').select('*');

    return { threads: threads || [], replies: replies || [], profiles: profiles || [], teams: teams || [] };
}

// Calculate statistics
function calculateStats(data) {
    const { threads, replies, profiles, teams } = data;

    // Total stats
    const totalThreads = threads.length;
    const totalCompleted = threads.filter(t => t.status === 'completed').length;
    const totalReplies = replies.length;

    // Average completion time
    const completedThreads = threads.filter(t => t.status === 'completed' && t.completed_at);
    let avgCompletionHours = 0;
    if (completedThreads.length > 0) {
        const totalHours = completedThreads.reduce((sum, thread) => {
            const created = new Date(thread.created_at);
            const completed = new Date(thread.completed_at);
            const hours = (completed - created) / (1000 * 60 * 60);
            return sum + hours;
        }, 0);
        avgCompletionHours = (totalHours / completedThreads.length).toFixed(1);
    }

    // Posts per user
    const postsByUser = {};
    threads.forEach(thread => {
        const author = thread.author_name || thread.author || 'Unknown';
        postsByUser[author] = (postsByUser[author] || 0) + 1;
    });

    // Completions per user
    const completionsByUser = {};
    completedThreads.forEach(thread => {
        const completerId = thread.completed_by;
        if (completerId) {
            const completer = profiles.find(p => p.id === completerId);
            const name = completer ? (completer.display_name || completer.email) : 'Unknown';
            completionsByUser[name] = (completionsByUser[name] || 0) + 1;
        }
    });

    // Posts per team
    const postsByTeam = {};
    threads.forEach(thread => {
        const team = teams.find(t => t.id === thread.team_id);
        const teamName = team ? team.name : 'Unknown';
        postsByTeam[teamName] = (postsByTeam[teamName] || 0) + 1;
    });

    // Daily trend
    const postsByDay = {};
    threads.forEach(thread => {
        const date = new Date(thread.created_at).toLocaleDateString('ja-JP');
        postsByDay[date] = (postsByDay[date] || 0) + 1;
    });

    return {
        totalThreads,
        totalCompleted,
        totalReplies,
        avgCompletionHours,
        postsByUser,
        completionsByUser,
        postsByTeam,
        postsByDay
    };
}

// Update dashboard UI
function updateUI(stats) {
    document.getElementById('total-threads').textContent = stats.totalThreads;
    document.getElementById('total-completed').textContent = stats.totalCompleted;
    document.getElementById('avg-completion-time').textContent = stats.avgCompletionHours + 'h';
    document.getElementById('total-replies').textContent = stats.totalReplies;

    // Update charts
    updatePostsChart(stats.postsByUser);
    updateCompletionsChart(stats.completionsByUser);
    updateTeamsChart(stats.postsByTeam);
    updateTrendChart(stats.postsByDay);

    document.getElementById('loading').style.display = 'none';
    document.getElementById('dashboard-content').style.display = 'block';
}

// Chart: Posts by User
function updatePostsChart(postsByUser) {
    const sorted = Object.entries(postsByUser).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const labels = sorted.map(([name]) => name);
    const values = sorted.map(([, count]) => count);

    if (charts.posts) charts.posts.destroy();

    const ctx = document.getElementById('posts-chart').getContext('2d');
    charts.posts = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '投稿数',
                data: values,
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

// Chart: Completions by User
function updateCompletionsChart(completionsByUser) {
    const sorted = Object.entries(completionsByUser).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const labels = sorted.map(([name]) => name);
    const values = sorted.map(([, count]) => count);

    if (charts.completions) charts.completions.destroy();

    const ctx = document.getElementById('completions-chart').getContext('2d');
    charts.completions = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '完了数',
                data: values,
                backgroundColor: 'rgba(153, 102, 255, 0.6)',
                borderColor: 'rgba(153, 102, 255, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

// Chart: Posts by Team
function updateTeamsChart(postsByTeam) {
    const labels = Object.keys(postsByTeam);
    const values = Object.values(postsByTeam);

    if (charts.teams) charts.teams.destroy();

    const ctx = document.getElementById('teams-chart').getContext('2d');
    charts.teams = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    'rgba(255, 99, 132, 0.6)',
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(255, 206, 86, 0.6)',
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(153, 102, 255, 0.6)',
                    'rgba(255, 159, 64, 0.6)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

// Chart: Daily Trend
function updateTrendChart(postsByDay) {
    const sorted = Object.entries(postsByDay).sort((a, b) => new Date(a[0]) - new Date(b[0]));
    const labels = sorted.map(([date]) => date);
    const values = sorted.map(([, count]) => count);

    if (charts.trend) charts.trend.destroy();

    const ctx = document.getElementById('trend-chart').getContext('2d');
    charts.trend = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '投稿数',
                data: values,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });
}

// Main update function
async function updateDashboard() {
    document.getElementById('loading').style.display = 'block';
    document.getElementById('dashboard-content').style.display = 'none';

    const data = await loadDashboardData();
    const stats = calculateStats(data);
    updateUI(stats);
}

// Initialize
async function init() {
    const isAuthorized = await checkAuth();
    if (isAuthorized) {
        await updateDashboard();
    }
}

// Run on load
init();
