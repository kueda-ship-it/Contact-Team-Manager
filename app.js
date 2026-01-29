/**
 * 連絡概要マネージャー - Supabase リアルタイム版
 * Phase 3: 高度な権限管理・表示名・リアクション (Admin, Manager, User, Viewer)
 */

// --- Supabase Configuration ---
const SUPABASE_URL = "https://bvhfmwrjrrqrpqvlzkyd.supabase.co";
const SUPABASE_KEY = "sb_publishable_--SSOcbdXqye0lPUQXMhMQ_PXcYrk6c";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- State ---
let threads = [];
let currentUser = null;
let currentProfile = null;
let allProfiles = [];
let allTags = [];
let allTagMembers = [];
let onlineUsers = new Set();
let currentFilter = 'all';
let mentionSelectedIndex = -1;
let currentMentionCandidates = [];
let currentTeamId = null; // Currently selected team (null = All)
let allTeams = [];
let whitelist = [];

// --- UI Elements ---
const authContainer = document.getElementById('auth-container');
const mainDashboard = document.getElementById('main-dashboard');
const authEmailInp = document.getElementById('auth-email');
const authPasswordInp = document.getElementById('auth-password');
const authErrorEl = document.getElementById('auth-error');
const loginBtn = document.getElementById('login-btn');
const signupBtn = document.getElementById('signup-btn');
const microsoftLoginBtn = document.getElementById('microsoft-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userDisplayEl = document.getElementById('user-display');
const userRoleEl = document.getElementById('user-role');

const threadListEl = document.getElementById('thread-list');
const sidebarListEl = document.getElementById('pending-sidebar-list');
const taskCountEl = document.getElementById('task-count');
const addThreadSection = document.getElementById('add-thread-section'); // UI制御用
const addThreadBtn = document.getElementById('add-thread-btn');
const newTitleInp = document.getElementById('new-title');
const newContentInp = document.getElementById('new-content');
const globalSearchInp = document.getElementById('global-search');
const filterStatus = document.getElementById('filter-status'); // This might be null if not in HTML
window.filterThreads = function (value) {
    currentFilter = value;
    renderThreads();
};
const assignedSidebarListEl = document.getElementById('assigned-sidebar-list');

const adminBtn = document.getElementById('admin-btn');
const settingsBtn = document.getElementById('settings-btn');
const modalOverlay = document.getElementById('modal-overlay');
const settingsModal = document.getElementById('settings-modal');
const adminModal = document.getElementById('admin-modal');
const prefDisplayName = document.getElementById('pref-display-name');
const prefNotification = document.getElementById('pref-notification');
const saveSettingsBtn = document.getElementById('save-settings-btn');

const adminUserList = document.getElementById('admin-user-list');
const adminTagList = document.getElementById('admin-tag-list');
const newTagNameInp = document.getElementById('new-tag-name');
const addTagBtn = document.getElementById('add-tag-btn');

const mentionListEl = document.getElementById('mention-list');
const prefAvatarInput = document.getElementById('pref-avatar-input');
const prefAvatarPreview = document.getElementById('pref-avatar-preview');

// --- New Features Elements ---
const whitelistEmailInp = document.getElementById('whitelist-email-inp');
const addWhitelistBtn = document.getElementById('add-whitelist-btn');
const adminWhitelistList = document.getElementById('admin-whitelist-list');
const teamsListEl = document.getElementById('teams-list');
const btnAddTeam = document.getElementById('btn-add-team');
const teamModal = document.getElementById('team-modal');
const newTeamNameInp = document.getElementById('new-team-name');
const saveTeamBtn = document.getElementById('save-team-btn');

// --- Auth & Profile ---

async function checkUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        await fetchProfile(user);
    } else {
        showAuth();
    }
}

async function fetchProfile(user) {
    currentUser = user;
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', user.id).single();
    if (data) {
        currentProfile = data;
        handleAuthState();
    } else {
        setTimeout(() => fetchProfile(user), 1000);
    }
}

async function fetchThreads() {
    let query = supabaseClient.from('threads').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });

    if (currentTeamId) {
        query = query.eq('team_id', currentTeamId);
    }

    const { data, error } = await query;
    if (data) {
        threads = data;
        renderThreads();
    }
}

async function fetchWhitelist() {
    const { data, error } = await supabaseClient.from('allowed_users').select('*').order('added_at', { ascending: false });
    if (data) {
        whitelist = data;
        renderWhitelist();
    }
}

function renderWhitelist() {
    adminWhitelistList.innerHTML = '';
    whitelist.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        tr.innerHTML = `
            <td style="padding: 10px;">${item.email}</td>
            <td style="padding: 10px; font-size: 0.8rem; color: var(--text-muted);">
                ${new Date(item.added_at).toLocaleString()}
            </td>
            <td style="padding: 10px;">
                <button class="btn btn-sm" style="background: var(--danger);" onclick="removeWhitelist('${item.email}')">削除</button>
            </td>
        `;
        adminWhitelistList.appendChild(tr);
    });
}

window.addWhitelist = async function () {
    const email = whitelistEmailInp.value.trim();
    if (!email) return;

    const { error } = await supabaseClient.from('allowed_users').insert([{ email, added_by: currentUser.id }]);
    if (error) {
        alert("追加に失敗しました: " + error.message);
    } else {
        whitelistEmailInp.value = '';
        fetchWhitelist();
    }
};

window.removeWhitelist = async function (email) {
    if (!confirm(`${email} をホワイトリストから削除しますか？`)) return;
    try {
        const { error } = await supabaseClient.from('allowed_users').delete().eq('email', email);
        if (error) throw error;
        await fetchWhitelist();
    } catch (e) {
        alert("削除失敗: " + (e.message || "権限またはネットワークエラー"));
    }
};

// --- Teams Operations ---

async function fetchTeams() {
    const { data: teamIds, error: memberError } = await supabaseClient.from('team_members').select('team_id').eq('user_id', currentUser.id);
    if (memberError) return;

    const ids = teamIds.map(t => t.team_id);
    const { data, error } = await supabaseClient.from('teams').select('*').in('id', ids);
    if (data) {
        allTeams = data;
        renderTeamsSidebar();
    }
}

function renderTeamsSidebar() {
    teamsListEl.innerHTML = '';
    // Add "All Teams" option
    const allTeamsDiv = document.createElement('div');
    allTeamsDiv.className = `team-icon ${currentTeamId === null ? 'active' : ''}`;
    allTeamsDiv.title = 'すべてのチーム';
    allTeamsDiv.style.backgroundColor = '#313338';
    allTeamsDiv.innerHTML = 'ALL';
    allTeamsDiv.onclick = () => switchTeam(null);
    teamsListEl.appendChild(allTeamsDiv);

    allTeams.forEach(team => {
        const div = document.createElement('div');
        div.className = `team-icon ${currentTeamId === team.id ? 'active' : ''}`;
        div.title = team.name;
        div.style.backgroundColor = team.icon_color || '#313338';
        div.innerHTML = team.name.charAt(0).toUpperCase();
        div.onclick = () => switchTeam(team.id);
        teamsListEl.appendChild(div);
    });
}

window.switchTeam = function (teamId) {
    currentTeamId = teamId;
    // Update active state in sidebar
    document.querySelectorAll('.team-icon').forEach(icon => icon.classList.remove('active'));
    if (teamId === null) {
        document.querySelector('.teams-sidebar .team-icon:first-child').classList.add('active');
    } else {
        // Find the specific team icon and add active class
        const teamIcon = Array.from(teamsListEl.children).find(el => el.title === allTeams.find(t => t.id === teamId)?.name);
        if (teamIcon) teamIcon.classList.add('active');
    }
    renderThreads(); // Filter threads by team
};

async function createTeam() {
    const name = newTeamNameInp.value.trim();
    if (!name) return;

    // 1. Create Team
    const { data: team, error } = await supabaseClient.from('teams').insert([{ name, created_by: currentUser.id }]).select().single();
    if (error) {
        alert("チーム作成失敗: " + error.message);
        return;
    }

    // 2. Add creator as member
    const { error: memberError } = await supabaseClient.from('team_members').insert([{ team_id: team.id, user_id: currentUser.id }]);
    if (memberError) {
        alert("メンバー追加失敗: " + memberError.message);
        return;
    }

    newTeamNameInp.value = '';
    teamModal.style.display = 'none';
    modalOverlay.style.display = 'none';
    fetchTeams();
}

function handleAuthState() {
    // ヘッダーのユーザー情報更新
    userDisplayEl.textContent = currentProfile.display_name || currentUser.email;
    userRoleEl.textContent = getRoleLabel(currentProfile.role);

    // ヘッダーアバターの表示
    const headerAvatar = document.getElementById('header-avatar-img');
    if (headerAvatar) {
        if (currentProfile.avatar_url) {
            headerAvatar.innerHTML = `<img src="${currentProfile.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            headerAvatar.textContent = (currentProfile.display_name || currentUser.email)[0].toUpperCase();
        }
    }

    // ロール名を正規化（先頭大文字）
    if (currentProfile.role) {
        currentProfile.role = currentProfile.role.charAt(0).toUpperCase() + currentProfile.role.slice(1).toLowerCase();
    }
    const role = currentProfile.role || 'User';

    // UI 制御: Admin/Manager のみボタン表示
    if (['Admin', 'Manager'].includes(role)) {
        adminBtn.style.display = 'block';
    } else {
        adminBtn.style.display = 'none';
    }

    // UI 制御: Viewer は投稿不可
    if (role === 'Viewer') {
        const createSection = document.querySelector('.form-container');
        if (createSection) createSection.style.display = 'none';
    } else {
        const createSection = document.querySelector('.form-container');
        if (createSection) createSection.style.display = 'block';
    }

    authContainer.style.display = 'none';
    mainDashboard.style.display = 'block';

    loadMasterData();
    loadData();
    subscribeToChanges();
    requestNotificationPermission();
    if (currentUser) fetchTeams(); // Load user's teams
}

function getRoleLabel(role) {
    const labels = { 'Admin': '管理者', 'Manager': 'マネージャー', 'User': '一般ユーザー', 'Viewer': '閲覧のみ' };
    return labels[role] || role;
}

function showAuth() {
    currentUser = null;
    currentProfile = null;
    authContainer.style.display = 'block';
    mainDashboard.style.display = 'none';
}

async function handleLogin() {
    const email = authEmailInp.value.trim();
    const password = authPasswordInp.value.trim();
    authErrorEl.style.display = 'none';

    // --- Privilege Login (admin/admin123) ---
    // セキュリティ上の理由により、特定の既存アカウントに紐付け
    // 入力が admin/admin123 の場合に特別な処理を行います。
    if (email === 'admin' && password === 'admin123') {
        // 特別な管理者ログイン：既存の認証を使わず、
        // ユーザーが Supabase で管理している「最初の管理者アカウント」などで入る。
        const { data, error } = await supabaseClient.from('profiles').select('*').eq('role', 'Admin').limit(1).single();

        if (!error && data) {
            currentUser = { id: data.id, email: data.email };
            currentProfile = data;
            authContainer.style.display = 'none';
            mainDashboard.style.display = 'block';
            handleAuthState();
            loadMasterData();
            return;
        } else {
            authErrorEl.textContent = "データベースに Admin ロールのユーザーが見つかりません。通常のアカウントでログインし、SQL で Admin ロールを付与してください。";
            authErrorEl.style.display = 'block';
            return;
        }
    }
    // ----------------------------------------

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await fetchProfile(data.user);
    } catch (error) {
        authErrorEl.textContent = "ログインエラー: " + error.message;
        authErrorEl.style.display = 'block';
    }
}

async function handleSignup() {
    const email = authEmailInp.value.trim();
    const password = authPasswordInp.value.trim();
    authErrorEl.style.display = 'none';

    // --- Whitelist Check ---
    const { data: allowed, error: wlError } = await supabaseClient.from('allowed_users').select('*').eq('email', email).single();
    if (wlError || !allowed) {
        authErrorEl.textContent = "このメールアドレスは許可されていません。管理者に連絡してください。";
        authErrorEl.style.display = 'block';
        return;
    }

    try {
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        alert("登録成功！確認メールを確認するか、ログインをお試しください。");
    } catch (error) {
        authErrorEl.textContent = "登録エラー: " + error.message;
        authErrorEl.style.display = 'block';
    }
}

async function handleLogout() {
    await supabaseClient.auth.signOut();
    location.reload();
}

// --- Notification Logic ---

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function shouldNotify(content) {
    if (!currentProfile || currentProfile.notification_preference === 'none') return false;
    if (currentProfile.notification_preference === 'all') return true;

    const myIdentifier = currentProfile.display_name ? `@${currentProfile.display_name}` : `@${currentUser.email}`;
    const myMentions = [myIdentifier, `@${currentUser.email}`];

    const myTagIds = allTagMembers.filter(m => m.profile_id === currentUser.id).map(m => m.tag_id);
    const myTagNames = allTags.filter(t => myTagIds.includes(t.id)).map(t => `@${t.name}`);

    const allMyMentions = [...myMentions, ...myTagNames];
    return allMyMentions.some(m => content.includes(m));
}

function sendStyledNotification(title, body) {
    if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: 'https://cdn-icons-png.flaticon.com/512/9187/9187604.png' });
    }
}

// --- Master Data Actions ---

async function loadMasterData() {
    const { data: p } = await supabaseClient.from('profiles').select('*');
    allProfiles = (p || []).map(profile => ({
        ...profile,
        role: profile.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1).toLowerCase() : 'User'
    }));
    const { data: t } = await supabaseClient.from('tags').select('*');
    allTags = t || [];
    const { data: tm } = await supabaseClient.from('tag_members').select('*');
    allTagMembers = tm || [];
    const { data: r } = await supabaseClient.from('reactions').select('*');
    allReactions = r || [];

    const role = currentProfile?.role;
    if (['Admin', 'Manager'].includes(role)) {
        renderAdminUsers();
        renderAdminTags();
    }
    renderThreads();
}

window.updateRole = async function (profileId, newRole) {
    if (currentProfile.role !== 'Admin') return alert("権限がありません。");
    const { error } = await supabaseClient.from('profiles').update({ role: newRole }).eq('id', profileId);
    if (error) {
        alert("ロール更新失敗: " + error.message);
    } else {
        loadMasterData();
    }
};

window.addTag = async function () {
    const name = newTagNameInp.value.trim();
    if (!name || !['Admin', 'Manager'].includes(currentProfile.role)) return;
    const { error } = await supabaseClient.from('tags').insert([{ name }]);
    if (error) {
        alert("タグ追加失敗: " + error.message);
    } else {
        newTagNameInp.value = '';
        loadMasterData();
    }
};

window.deleteTag = async function (tagId) {
    if (currentProfile.role !== 'Admin') return alert("権限がありません。");
    if (confirm("タグを削除しますか？")) {
        const { error } = await supabaseClient.from('tags').delete().eq('id', tagId);
        if (error) {
            alert("タグ削除失敗: " + error.message);
        } else {
            loadMasterData();
        }
    }
};

window.toggleUserTag = async function (profileId, tagId) {
    if (currentProfile.role !== 'Admin') return alert("権限がありません。");
    const existing = allTagMembers.find(m => m.profile_id === profileId && m.tag_id === tagId);
    if (existing) {
        const { error } = await supabaseClient.from('tag_members').delete().eq('id', existing.id);
        if (error) alert("タグ削除失敗: " + error.message);
    } else {
        const { error } = await supabaseClient.from('tag_members').insert([{ profile_id: profileId, tag_id: tagId }]);
        if (error) alert("タグ追加失敗: " + error.message);
    }
    loadMasterData();
};

// --- Reaction Logic ---

window.addReaction = async function (targetId, type, emoji) {
    if (currentProfile.role === 'Viewer') return alert("権限がありません。");

    // 既存リアクションの検索
    let existing;
    if (type === 'thread') {
        existing = allReactions.find(r => r.thread_id === targetId && r.profile_id === currentUser.id && r.emoji === emoji);
    } else {
        existing = allReactions.find(r => r.reply_id === targetId && r.profile_id === currentUser.id && r.emoji === emoji);
    }

    if (existing) {
        await supabaseClient.from('reactions').delete().eq('id', existing.id);
    } else {
        const payload = { profile_id: currentUser.id, emoji };
        if (type === 'thread') payload.thread_id = targetId;
        else payload.reply_id = targetId;

        await supabaseClient.from('reactions').insert([payload]);
    }

    // リアルタイム反映を待たずにUI更新するために再読み込みをトリガー
    loadMasterData();
};

// --- Edit Functions ---

window.editThread = function (threadId) {
    const titleEl = document.getElementById(`title-${threadId}`);
    const contentEl = document.getElementById(`content-${threadId}`);

    if (!titleEl || !contentEl) return;

    const originalTitle = titleEl.textContent;
    const originalContent = contentEl.textContent;

    titleEl.innerHTML = `<input type="text" id="edit-title-${threadId}" class="input-field" value="${escapeHtml(originalTitle)}" style="font-size: 1rem; font-weight: bold;">`;
    contentEl.innerHTML = `
        <textarea id="edit-content-${threadId}" class="input-field" style="height: 100px; resize: vertical;">${escapeHtml(originalContent)}</textarea>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button class="btn btn-primary btn-sm" onclick="saveEdit('${threadId}')">更新</button>
            <button class="btn btn-sm" style="background: var(--surface-light);" onclick="cancelEdit('${threadId}', '${escapeHtml(originalTitle)}', '${escapeHtml(originalContent)}')">キャンセル</button>
        </div>
    `;
};

window.saveEdit = async function (threadId) {
    const titleInp = document.getElementById(`edit-title-${threadId}`);
    const contentInp = document.getElementById(`edit-content-${threadId}`);
    const saveBtn = document.querySelector(`button[onclick="saveEdit('${threadId}')"]`);

    if (!titleInp || !contentInp) return;
    const newTitle = titleInp.value;
    const newContent = contentInp.value;

    if (!newTitle.trim() || !newContent.trim()) return alert("タイトルと内容は必須です。");

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "保存中...";
    }

    const { error } = await supabaseClient.from('threads').update({ title: newTitle, content: newContent }).eq('id', threadId);

    if (error) {
        console.error("Update failed:", error);
        alert("更新に失敗しました: " + error.message);
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "保存";
        }
    } else {
        await loadData();
    }
};

window.editReply = function (replyId, threadId) {
    const contentEl = document.getElementById(`reply-content-${replyId}`);
    if (!contentEl) return;

    const originalContent = contentEl.textContent;
    contentEl.innerHTML = `
        <textarea id="edit-reply-content-${replyId}" class="input-field" style="height: 60px; resize: vertical; font-size: 0.8rem; margin-top: 5px;">${escapeHtml(originalContent)}</textarea>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
            <button class="btn btn-primary btn-sm" onclick="saveReply('${replyId}', '${threadId}')">更新</button>
            <button class="btn btn-sm" style="background: rgba(255,255,255,0.1);" onclick="renderThreads()">キャンセル</button>
        </div>
    `;
};

window.saveReply = async function (replyId, threadId) {
    const contentInp = document.getElementById(`edit-reply-content-${replyId}`);
    const saveBtn = document.querySelector(`button[onclick="saveReply('${replyId}', '${threadId}')"]`);

    if (!contentInp) return;
    const newContent = contentInp.value;

    if (!newContent.trim()) return alert("内容を入力してください。");

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "保存中...";
    }

    const { error } = await supabaseClient.from('replies').update({ content: newContent }).eq('id', replyId);

    if (error) {
        console.error("Update failed:", error);
        alert("更新に失敗しました: " + error.message);
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "保存";
        }
    } else {
        await loadData();
    }
};

window.deleteReply = async function (replyId) {
    if (confirm("この返信を削除しますか？")) {
        const { error } = await supabaseClient.from('replies').delete().eq('id', replyId);
        if (error) {
            alert("削除に失敗しました: " + error.message);
        } else {
            loadData();
        }
    }
};

window.cancelEdit = function (threadId, originalTitle, originalContent) {
    renderThreads(); // 単純に再描画してしまうのが確実
};

// Helper for escaping HTML in inline event handlers
function escapeHtml(text) {
    if (text == null) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- Realtime Subscription ---

function subscribeToChanges() {
    supabaseClient.channel('public:threads')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'threads' }, (payload) => {
            if (shouldNotify(payload.new.content)) sendStyledNotification("新規連絡: " + payload.new.title, payload.new.content);
            loadData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'threads' }, () => loadData())
        .subscribe();

    supabaseClient.channel('public:replies').on('postgres_changes', { event: '*', schema: 'public', table: 'replies' }, () => loadData()).subscribe();
    supabaseClient.channel('public:reactions').on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => loadMasterData()).subscribe();
    supabaseClient.channel('public:admin').on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => loadMasterData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' }, () => loadMasterData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tag_members' }, () => loadMasterData())
        .subscribe();

    // --- Presence (Teams-like Active Status) ---
    const presenceChannel = supabaseClient.channel('online_users', {
        config: { presence: { key: currentUser.id } }
    });

    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const state = presenceChannel.presenceState();
            onlineUsers = new Set(Object.keys(state));
            renderThreads();
            handleAuthState(); // ヘッダーの状態も同期
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await presenceChannel.track({
                    user_id: currentUser.id,
                    online_at: new Date().toISOString(),
                });
            }
        });
}

// --- Main API Actions ---

async function loadData() {
    if (!currentUser) return;
    // const { data: threadData } = await supabaseClient.from('threads').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    await fetchThreads(); // Use the new fetchThreads function
    const { data: replyData } = await supabaseClient.from('replies').select('*').order('created_at', { ascending: true });

    threads = (threads || []).map(t => ({ // Use the threads populated by fetchThreads
        ...t,
        replies: (replyData || []).filter(r => r.thread_id === t.id)
    }));
    renderThreads();
}

async function addThread() {
    const title = newTitleInp.value.trim();
    const content = newContentInp.value.trim();
    if (!title || !content || currentProfile.role === 'Viewer') return;
    addThreadBtn.disabled = true;
    const authorName = currentProfile.display_name || currentUser.email;
    const { error } = await supabaseClient.from('threads').insert([
        {
            title,
            content,
            author_id: currentUser.id,
            author: authorName, // Reverted from author_name to author for consistency
            team_id: currentTeamId
        }
    ]);
    if (error) {
        alert("投稿失敗: " + error.message);
    } else {
        newTitleInp.value = '';
        newContentInp.value = '';
    }
    addThreadBtn.disabled = false;
    addThreadBtn.textContent = '+ Post';
}

window.addReply = async function (threadId) {
    const input = document.getElementById(`reply-input-${threadId}`);
    const content = input.value.trim();
    if (!content || currentProfile.role === 'Viewer') return;
    const authorName = currentProfile.display_name || currentUser.email;
    const { error } = await supabaseClient.from('replies').insert([{ thread_id: threadId, content, author: authorName }]);
    if (error) {
        alert("返信失敗: " + error.message);
    } else {
        input.value = '';
        // Scroll to bottom after adding a reply
        setTimeout(() => {
            const scrollArea = document.querySelector(`#thread-${threadId} .reply-scroll-area`);
            if (scrollArea) {
                scrollArea.scrollTop = scrollArea.scrollHeight;
            }
        }, 100);
    }
}

window.toggleStatus = async function (threadId) {
    if (currentProfile.role === 'Viewer') return;
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;

    // --- Optimistic Update ---
    const originalStatus = thread.status;
    thread.status = thread.status === 'completed' ? 'pending' : 'completed';

    if (thread.status === 'completed') {
        showCompleteEffect(threadId);
    }

    renderThreads();
    // -------------------------

    const { error } = await supabaseClient.from('threads').update({ status: thread.status }).eq('id', threadId);
    if (error) {
        thread.status = originalStatus;
        renderThreads();
        alert("更新に失敗しました。");
    }
}

function showCompleteEffect(threadId) {
    const card = document.getElementById(`thread-${threadId}`);
    if (!card) return;

    const toast = document.createElement('div');
    toast.className = 'complete-toast';
    toast.textContent = 'Complete! ✅';
    card.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 1200);
}

window.togglePin = async function (threadId) {
    if (currentProfile.role === 'Viewer') return;
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;
    const { error } = await supabaseClient.from('threads').update({ is_pinned: !thread.is_pinned }).eq('id', threadId);
    if (error) alert("ピン留め失敗: " + error.message);
}

window.deleteThread = async function (threadId) {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;

    // 削除権限チェック
    const threadAuthor = thread.author_name || thread.author;
    const isOwner = threadAuthor === (currentProfile.display_name || currentUser.email);
    const hasAdminPower = ['Admin', 'Manager'].includes(currentProfile.role);

    if (!isOwner && !hasAdminPower) return alert("削除権限がありません。");

    if (confirm("この項目を削除しますか？")) {
        const { error } = await supabaseClient.from('threads').delete().eq('id', threadId);
        if (error) alert("削除失敗: " + error.message);
    }
}

// --- Rendering Logic ---

function renderThreads() {
    const filter = currentFilter;
    const searchQuery = globalSearchInp.value.trim().toLowerCase();

    // --- Central Feed Data ---
    let feedThreads = [...threads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .filter(t => (filter === 'all' || t.status === filter));

    if (searchQuery) {
        feedThreads = feedThreads.filter(t =>
            (t.title && t.title.toLowerCase().includes(searchQuery)) ||
            (t.content && t.content.toLowerCase().includes(searchQuery)) ||
            ((t.author_name || t.author || "").toLowerCase().includes(searchQuery))
        );
    }

    // --- Sidebar Data (Not Finished) ---
    const pendingThreads = threads.filter(t => t.status === 'pending')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // --- Sidebar Data (Assigned to Me) ---
    const myName = currentProfile.display_name || currentUser.email;
    const myTagIds = allTagMembers.filter(m => m.profile_id === currentProfile.id).map(m => m.tag_id);
    const myTagNames = allTags.filter(t => myTagIds.includes(t.id)).map(t => t.name);

    const assignedThreads = threads.filter(t => {
        if (t.status === 'completed') return false;
        if (!t.content) return false;
        const mentions = t.content.match(/@\S+/g) || [];
        return mentions.some(m => {
            const name = m.substring(1);
            return name === myName || myTagNames.includes(name);
        });
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    threadListEl.innerHTML = '';
    sidebarListEl.innerHTML = '';
    assignedSidebarListEl.innerHTML = '';
    if (taskCountEl) taskCountEl.textContent = feedThreads.length;

    // List Sticky Header
    threadListEl.innerHTML = `
        <div class="feed-header-sticky">
            <h2 style="font-size: 1.2rem; font-weight: 700;">List <span id="task-count-sticky" style="color: var(--primary-light); margin-left:10px;">${feedThreads.length}</span> 件</h2>
            <div style="display: flex; gap: 8px; align-items: center;">
                <select id="filter-status-sticky" class="input-field" style="width: auto; padding: 2px 10px; font-size: 0.8rem;" onchange="filterThreads(this.value)">
                    <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>すべて表示</option>
                    <option value="pending" ${currentFilter === 'pending' ? 'selected' : ''}>未完了</option>
                    <option value="completed" ${currentFilter === 'completed' ? 'selected' : ''}>完了済み</option>
                </select>
            </div>
        </div>
    `;

    // Render Central Feed Threads
    feedThreads.forEach(thread => {
        const authorName = thread.author_name || thread.author || 'Unknown';
        const authorProfile = allProfiles.find(p => p.email === authorName || p.display_name === authorName);
        const avatarUrl = authorProfile?.avatar_url;
        const isOnline = authorProfile && onlineUsers.has(authorProfile.id);

        const card = document.createElement('div');
        card.id = `thread-${thread.id}`;
        card.className = `task-card ${thread.is_pinned ? 'is-pinned' : ''} ${thread.status === 'completed' ? 'is-completed' : ''}`;

        const reactionsForThread = allReactions.filter(r => r.thread_id === thread.id);
        const emojiCounts = reactionsForThread.reduce((acc, r) => {
            acc[r.emoji] = (acc[r.emoji] || 0) + 1;
            return acc;
        }, {});

        // リアクションの定義（✅を先頭に追加）
        const reactionTypes = ['✅', '👍', '❤️', '😂', '😮', '😢', '😡'];

        const reactionsHtml = Object.entries(emojiCounts)
            .sort(([a], [b]) => reactionTypes.indexOf(a) - reactionTypes.indexOf(b))
            .map(([emoji, count]) => {
                const hasMyReaction = reactionsForThread.some(r => r.profile_id === currentUser.id && r.emoji === emoji);
                return `<span class="reaction-badge ${hasMyReaction ? 'active' : ''}" onclick="addReaction('${thread.id}', 'thread', '${emoji}')">${emoji} ${count}</span>`;
            }).join('');

        let repliesHtml = thread.replies.map(reply => {
            // 返信へのリアクション
            const reactionsForReply = allReactions.filter(r => r.reply_id === reply.id);
            const replyEmojiCounts = reactionsForReply.reduce((acc, r) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                return acc;
            }, {});

            const reactionTypesForReply = ['✅', '👍', '❤️', '😂', '😮', '😢', '😡'];
            const replyReactionsHtml = Object.entries(replyEmojiCounts)
                .sort(([a], [b]) => reactionTypesForReply.indexOf(a) - reactionTypesForReply.indexOf(b))
                .map(([emoji, count]) => {
                    const hasMyReaction = reactionsForReply.some(r => r.profile_id === currentUser.id && r.emoji === emoji);
                    return `<span class="reaction-badge ${hasMyReaction ? 'active' : ''}" style="font-size: 0.7rem; padding: 1px 6px;" onclick="addReaction('${reply.id}', 'reply', '${emoji}')">${emoji} ${count}</span>`;
                }).join('');

            const isReplyOwner = reply.author === (currentProfile.display_name || currentUser.email);
            const canDeleteReply = isReplyOwner || ['Admin', 'Manager'].includes(currentProfile.role);

            return `
            <div class="reply-item" style="position: relative;">
                <div class="dot-menu-container" style="top: 2px; right: 2px; transform: scale(0.8);">
                    <div class="dot-menu-trigger">⋮</div>
                    <div class="dot-menu">
                    ${isReplyOwner ? `
                    <div class="menu-item" onclick="editReply('${reply.id}', '${thread.id}')">
                        <span class="menu-icon">✎</span> 編集
                    </div>` : ''}
                    ${canDeleteReply ? `
                    <div class="menu-item menu-item-delete" onclick="deleteReply('${reply.id}')">
                        <span class="menu-icon">🗑️</span> 削除
                    </div>` : ''}
                </div>
            </div>
            <div class="reply-header"><span>${reply.author}</span><span>${new Date(reply.created_at).toLocaleString()}</span></div>
            <div class="reply-content" id="reply-content-${reply.id}">${highlightMentions(reply.content)}</div>
                
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                    <div class="reaction-bar" style="font-size: 0.8em;">${replyReactionsHtml}</div>
                    
                    <!-- 返信リアクションボタン -->
                    <div class="reaction-container-bottom" style="margin: 0; transform: scale(0.8); transform-origin: left center;">
                        <div class="plus-trigger" style="width: 24px; height: 24px; font-size: 1rem;">+</div>
                        <div class="reaction-menu" style="bottom: 28px;">
                            ${reactionTypesForReply.map(emoji =>
                `<span onclick="addReaction('${reply.id}', 'reply', '${emoji}')">${emoji}</span>`
            ).join('')}
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        const isOwner = (thread.author_name || thread.author) === (currentProfile.display_name || currentUser.email);
        const canDelete = isOwner || ['Admin', 'Manager'].includes(currentProfile.role);
        // 編集は本人のみ
        const canEdit = isOwner;

        card.innerHTML = `
            ${thread.is_pinned ? '<div class="pinned-badge">重要</div>' : ''}
            
            <div class="dot-menu-container">
                <div class="dot-menu-trigger">⋮</div>
                <div class="dot-menu">
                ${canEdit ? `
                <div class="menu-item" onclick="editThread('${thread.id}')">
                    <span class="menu-icon">✎</span> 編集
                </div>` : ''}
                ${canDelete ? `
                <div class="menu-item menu-item-delete" onclick="deleteThread('${thread.id}')">
                    <span class="menu-icon">🗑️</span> 削除
                </div>` : ''}
            </div>
        </div>

            <div class="task-header-meta">
                <div class="avatar-container">
                    <div class="avatar">
                        ${avatarUrl ? `<img src="${avatarUrl}">` : authorName[0].toUpperCase()}
                    </div>
                    <div class="status-dot ${isOnline ? 'active' : ''}"></div>
                </div>
                <div class="task-author-info">
                    <span class="author-name">${authorName}</span>
                    <span class="timestamp">${new Date(thread.created_at).toLocaleString()}</span>
                </div>
            </div>

            <div class="task-title-line" id="title-${thread.id}">${thread.title}</div>
            <div class="task-content" id="content-${thread.id}" style="white-space: pre-wrap;">${highlightMentions(thread.content)}</div>
            
            <div class="reaction-container-bottom">
                <div class="plus-trigger">+</div>
                <div class="reaction-menu">
                    ${reactionTypes.map(emoji =>
            `<span onclick="addReaction('${thread.id}', 'thread', '${emoji}')">${emoji}</span>`
        ).join('')}
                </div>
            </div>

                <div class="reply-section">
                    <div class="reply-scroll-area">${repliesHtml}</div>
                    ${(currentProfile.role !== 'Viewer' && thread.status !== 'completed') ? `
                    <div class="reply-form" style="position:relative; display: flex; align-items: center; gap: 4px;">
                        <input type="text" id="reply-input-${thread.id}" class="input-field btn-sm" placeholder="返信 (メンションは@を入力)..." 
                               style="flex: 1;"
                               oninput="handleReplyInput(this, '${thread.id}')">
                        <button class="btn-send-reply" onclick="addReply('${thread.id}')" title="返信">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                        <div id="mention-list-${thread.id}" class="mention-list" style="bottom: 100%; top: auto; display: none;"></div>
                    </div>` : (thread.status === 'completed' ? '' : '')}
                </div>


            <div class="task-footer-teams">
                <div class="reaction-bar">
                    ${reactionsHtml}
                </div>
                <div class="actions">
                    ${currentProfile.role !== 'Viewer' ? `
                    <button class="btn btn-sm btn-status ${thread.status === 'completed' ? 'btn-revert' : ''}" onclick="toggleStatus('${thread.id}')">${thread.status === 'completed' ? '戻す' : '完了'}</button>
                    ` : ''}
                </div>
            </div>
        `;
        threadListEl.appendChild(card);

        // 返信用のメンションリスト要素を登録
        const rml = document.getElementById(`mention-list-${thread.id}`);
        if (rml) replyMentionLists[thread.id] = rml;

        // 初期表示時に最下部までスクロール
        setTimeout(() => {
            const scrollArea = card.querySelector('.reply-scroll-area');
            if (scrollArea) {
                scrollArea.scrollTop = scrollArea.scrollHeight;
            }
        }, 50);
    });

    // サイドバーの描画 (Not Finished)
    pendingThreads.forEach(thread => {
        const item = document.createElement('div');
        item.className = 'sidebar-item';

        // メンションの抽出
        const mentions = thread.content.match(/@\S+/g) || [];
        const uniqueMentions = [...new Set(mentions)].join(' ');

        const authorName = thread.author_name || thread.author || 'Unknown';
        item.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${thread.title}</div>
            <div style="font-size: 0.75rem; color: var(--accent); margin-bottom: 4px;">${uniqueMentions}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                <span>by ${authorName}</span>
                <span>${new Date(thread.created_at).toLocaleDateString()}</span>
            </div>
        `;
        item.onclick = () => {
            const target = document.getElementById(`thread-${thread.id}`);
            if (target) {
                const headerHeight = 100;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerHeight;
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
            }
        };
        sidebarListEl.appendChild(item);
    });

    // Assigned to Me の描画
    assignedThreads.forEach(thread => {
        const item = document.createElement('div');
        item.className = 'sidebar-item personalized-sidebar-item';
        item.style.borderLeft = '3px solid var(--accent)';

        const authorName = thread.author_name || thread.author || 'Unknown';
        item.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${thread.title}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted); display: flex; justify-content: space-between;">
                <span>by ${authorName}</span>
                <span>${new Date(thread.created_at).toLocaleDateString()}</span>
            </div>
        `;
        item.onclick = () => {
            const target = document.getElementById(`thread-${thread.id}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        };
        assignedSidebarListEl.appendChild(item);
    });
}

function highlightMentions(text) {
    return text.replace(/@\S+/g, match => `<span class="mention">${match}</span>`);
}

function renderAdminUsers() {
    adminUserList.innerHTML = allProfiles.map(p => {
        const userTagNames = allTagMembers.filter(m => m.profile_id === p.id).map(m => {
            const tag = allTags.find(t => t.id === m.tag_id);
            return tag ? `<span class="tag-badge">${tag.name}</span>` : '';
        }).join('');

        const roles = ['Admin', 'Manager', 'User', 'Viewer'];
        const roleOptions = roles.map(r => `<option value="${r}" ${p.role === r ? 'selected' : ''}>${getRoleLabel(r)}</option>`).join('');

        return `
            <tr>
                <td>${p.display_name || '-'} <br><small>${p.email}</small></td>
                <td>
                    <select onchange="updateRole('${p.id}', this.value)" class="input-field btn-sm" style="width: auto;" ${currentProfile.role !== 'Admin' ? 'disabled' : ''}>
                        ${roleOptions}
                    </select>
                </td>
                <td>${userTagNames}</td>
                <td>
                    <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                        ${allTags.map(t => {
            const isMember = allTagMembers.some(m => m.profile_id === p.id && m.tag_id === t.id);
            return `
                                <button class="btn btn-sm ${isMember ? 'btn-primary' : ''}" 
                                        style="font-size: 0.6rem; padding: 2px 5px; ${!isMember ? 'background: rgba(255,255,255,0.1);' : ''}" 
                                        onclick="toggleUserTag('${p.id}', '${t.id}')" 
                                        ${currentProfile.role !== 'Admin' ? 'disabled' : ''}>
                                    ${t.name}
                                </button>`;
        }).join('')}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function renderAdminTags() {
    adminTagList.innerHTML = allTags.map(t => {
        const count = allTagMembers.filter(m => m.tag_id === t.id).length;
        return `
            <tr>
                <td>${t.name}</td>
                <td>${count}人</td>
                <td>
                    ${currentProfile.role === 'Admin' ? `<button class="btn btn-sm" style="background: var(--danger);" onclick="deleteTag('${t.id}')">削除</button>` : '-'}
                </td>
            </tr>
        `;
    }).join('');
}

// --- Mention Helper ---

let activeReplyThreadId = null;
const replyMentionLists = {}; // スレッドIDごとにメンションリストを管理

function showMentionSuggestions(query, isThread = true, threadId = null) {
    const listEl = isThread ? mentionListEl : replyMentionLists[threadId];
    if (!listEl) return;

    const filteredProfiles = allProfiles.filter(p =>
        (p.display_name && p.display_name.toLowerCase().includes(query.toLowerCase())) ||
        (p.email && p.email.toLowerCase().includes(query.toLowerCase()))
    );
    const filteredTags = allTags.filter(t => t.name.toLowerCase().includes(query.toLowerCase()));

    if (filteredProfiles.length === 0 && filteredTags.length === 0) {
        listEl.style.display = 'none';
        return;
    }

    let html = '';
    html += filteredProfiles.map(p => `
        <div class="mention-item" onclick="insertMention('${p.display_name || p.email}', ${isThread}, '${threadId}')">
            <div class="avatar">${p.avatar_url ? `<img src="${p.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">` : (p.display_name || p.email)[0].toUpperCase()}</div>
            <div class="mention-info">
                <span class="mention-name">${p.display_name || 'No Name'}</span>
                <span class="mention-email">${p.email}</span>
            </div>
        </div>
    `).join('');

    html += filteredTags.map(t => `
        <div class="mention-item" onclick="insertMention('${t.name}', ${isThread}, '${threadId}')">
            <div class="avatar tag-avatar">#</div>
            <div class="mention-info">
                <span class="mention-name">${t.name}</span>
                <span class="mention-email">タグ</span>
            </div>
        </div>
    `).join('');

    listEl.innerHTML = html;
    listEl.style.display = 'block';

    currentMentionCandidates = [...filteredProfiles, ...filteredTags];
    mentionSelectedIndex = -1; // 初期状態は未選択
}

function updateMentionHighlight(isThread, threadId) {
    const listEl = isThread ? mentionListEl : replyMentionLists[threadId];
    if (!listEl) return;
    const items = listEl.querySelectorAll('.mention-item');
    items.forEach((item, idx) => {
        if (idx === mentionSelectedIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}

function handleMentionKeydown(e, isThread, threadId = null) {
    const listEl = isThread ? mentionListEl : replyMentionLists[threadId];
    if (!listEl || listEl.style.display === 'none') return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        mentionSelectedIndex = (mentionSelectedIndex + 1) % currentMentionCandidates.length;
        updateMentionHighlight(isThread, threadId);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        mentionSelectedIndex = (mentionSelectedIndex - 1 + currentMentionCandidates.length) % currentMentionCandidates.length;
        updateMentionHighlight(isThread, threadId);
    } else if (e.key === 'Enter' && mentionSelectedIndex !== -1) {
        e.preventDefault();
        const candidate = currentMentionCandidates[mentionSelectedIndex];
        const name = candidate.display_name || candidate.email || candidate.name;
        insertMention(name, isThread, threadId);
    } else if (e.key === 'Escape') {
        listEl.style.display = 'none';
    }
}

function insertMention(name, isThread, threadId = null) {
    const input = isThread ? newContentInp : document.getElementById(`reply-input-${threadId}`);
    if (!input) return;

    const text = input.value;
    const cursor = input.selectionStart;
    const lastAt = text.lastIndexOf('@', cursor - 1);

    if (lastAt !== -1) {
        input.value = text.slice(0, lastAt) + '@' + name + ' ' + text.slice(cursor);
        input.focus();
        const newPos = lastAt + name.length + 2;
        input.setSelectionRange(newPos, newPos);
    }

    if (isThread) mentionListEl.style.display = 'none';
    else if (replyMentionLists[threadId]) replyMentionLists[threadId].style.display = 'none';
}

newContentInp.addEventListener('input', (e) => {
    const text = e.target.value;
    const cursor = e.target.selectionStart;
    const lastAt = text.lastIndexOf('@', cursor - 1);

    if (lastAt !== -1 && !text.slice(lastAt, cursor).includes(' ')) {
        const query = text.slice(lastAt + 1, cursor);
        showMentionSuggestions(query, true);
    } else {
        mentionListEl.style.display = 'none';
        mentionSelectedIndex = -1;
    }
});

newContentInp.addEventListener('keydown', (e) => {
    handleMentionKeydown(e, true);
});

// --- Interaction Logic ---

settingsBtn.onclick = () => {
    prefDisplayName.value = currentProfile.display_name || '';
    prefNotification.value = currentProfile.notification_preference;

    // Show current avatar in preview
    if (currentProfile.avatar_url) {
        prefAvatarPreview.innerHTML = `<img src="${currentProfile.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
        prefAvatarPreview.innerHTML = '';
        prefAvatarPreview.textContent = (currentProfile.display_name || currentUser.email)[0].toUpperCase();
    }

    modalOverlay.style.display = 'flex';
    settingsModal.style.display = 'block';
    adminModal.style.display = 'none';
};

adminBtn.onclick = () => {
    modalOverlay.style.display = 'flex';
    adminModal.style.display = 'block';
    settingsModal.style.display = 'none';
    if (teamModal) teamModal.style.display = 'none';

    // Refresh admin data
    loadMasterData();
    fetchWhitelist();
};

if (btnAddTeam) {
    btnAddTeam.onclick = () => {
        modalOverlay.style.display = 'flex';
        teamModal.style.display = 'block';
        adminModal.style.display = 'none';
        settingsModal.style.display = 'none';
    };
}

// --- Microsoft Login Logic ---

async function handleMicrosoftLogin() {
    try {
        const { error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'azure',
            options: {
                scopes: 'email profile User.Read',
                redirectTo: window.location.origin + window.location.pathname
            }
        });
        if (error) throw error;
    } catch (error) {
        authErrorEl.textContent = "Microsoftログインエラー: " + error.message;
        authErrorEl.style.display = 'block';
    }
}


// --- Event Listeners ---
loginBtn.onclick = handleLogin;
signupBtn.onclick = handleSignup;
microsoftLoginBtn.onclick = handleMicrosoftLogin;
logoutBtn.onclick = handleLogout;
addThreadBtn.onclick = addThread;

// New Features Explicit Linking
if (addWhitelistBtn) {
    addWhitelistBtn.onclick = async () => {
        try {
            await window.addWhitelist();
        } catch (e) {
            alert("例外発生: " + e.message);
        }
    };
}
if (saveTeamBtn) {
    saveTeamBtn.onclick = async () => {
        try {
            await createTeam();
        } catch (e) {
            alert("例外発生: " + e.message);
        }
    };
}
if (btnAddTeam) {
    btnAddTeam.onclick = () => {
        modalOverlay.style.display = 'flex';
        teamModal.style.display = 'block';
        adminModal.style.display = 'none';
        settingsModal.style.display = 'none';
    }
}

if (filterStatus) filterStatus.onchange = loadData;

saveSettingsBtn.onclick = async () => {
    const pref = prefNotification.value;
    const display = prefDisplayName.value.trim();
    const avatarFile = prefAvatarInput.files[0];
    let avatarUrl = currentProfile.avatar_url;

    if (avatarFile) {
        // 本来は Supabase Storage を使うべきですが、今回は簡易的に Base64 に変換します
        const reader = new FileReader();
        avatarUrl = await new Promise(resolve => {
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(avatarFile);
        });
    }

    const { error } = await supabaseClient.from('profiles').update({
        notification_preference: pref,
        display_name: display,
        avatar_url: avatarUrl
    }).eq('id', currentUser.id);

    if (!error) {
        currentProfile.notification_preference = pref;
        currentProfile.display_name = display;
        currentProfile.avatar_url = avatarUrl;
        modalOverlay.style.display = 'none';
        handleAuthState();
    }
};

prefAvatarInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = e => prefAvatarPreview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
        reader.readAsDataURL(file);
    }
};

// モーダルを閉じるボタンの共通処理
document.querySelectorAll('.btn-close-modal').forEach(b => {
    b.onclick = () => {
        modalOverlay.style.display = 'none';
    };
});

// 管理画面のタブ切り替え
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.classList.add('active');
    };
});

addTagBtn.onclick = window.addTag;

// --- Initialization ---

// リアルタイムで認証状態を監視 (OAuthリダイレクト後の自動ログイン用)
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
        fetchProfile(session.user);
    } else if (event === 'SIGNED_OUT') {
        showAuth();
    }
});

checkUser();


globalSearchInp.addEventListener('input', () => {
    renderThreads();
});

// CTRL+E で検索窓にフォーカス
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        globalSearchInp.focus();
    }
});


window.handleReplyInput = function (el, threadId) {
    const val = el.value;
    const atPos = val.lastIndexOf('@');
    if (atPos !== -1) {
        showMentionSuggestions(val.slice(atPos + 1), false, threadId);
    } else {
        if (replyMentionLists[threadId]) replyMentionLists[threadId].style.display = 'none';
        mentionSelectedIndex = -1;
    }

    if (!el.hasMentionListener) {
        el.addEventListener('keydown', (e) => handleMentionKeydown(e, false, threadId));
        el.hasMentionListener = true;
    }
};
