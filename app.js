/**
 * 連絡概要マネージャー - Supabase リアルタイム版
 * Phase 3: 高度な権限管理・表示名・リアクション (Admin, Manager, User, Viewer)
 */

// --- Supabase Configuration ---
const SUPABASE_URL = "https://bvhfmwrjrrqrpqvlzkyd.supabase.co";
const SUPABASE_KEY = "sb_publishable_--SSOcbdXqye0lPUQXMhMQ_PXcYrk6c";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- Global State ---
window.toggleExpand = function (id) {
    const content = document.getElementById('expand-' + id);
    const btn = document.getElementById('btn-' + id);
    if (!content || !btn) return;

    if (content.classList.contains('is-expanded')) {
        content.classList.remove('is-expanded');
        btn.textContent = '詳細を表示';
    } else {
        content.classList.add('is-expanded');
        btn.textContent = '表示を閉じる';
    }
};

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
let allReactions = [];
let currentSortOrder = 'asc'; // 'asc' = newest activity at bottom (standard chat style), 'desc' = newest activity first
let animatingThreadId = null; // Track ID for animation
let currentGlobalNav = 'teams'; // 'teams', 'activity', etc.
let feedFilter = 'all'; // 'all', 'pending', 'assigned' (custom filter within team)


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
const headerAvatarImg = document.getElementById('header-avatar-img');
const appTitleEl = document.getElementById('app-title');

const threadListEl = document.getElementById('thread-list');
const sidebarListEl = document.getElementById('pending-sidebar-list');
const taskCountEl = document.getElementById('task-count');
const addThreadSection = document.getElementById('add-thread-section'); // UI制御用
const addThreadBtn = document.getElementById('add-thread-btn');
const newTitleInp = document.getElementById('new-title');
const newContentInp = document.getElementById('new-content'); // Now contenteditable div
const fileInput = document.getElementById('file-input');
const attachFileBtn = document.getElementById('attach-file-btn');
const attachmentPreviewArea = document.getElementById('attachment-preview-area');
const globalSearchInp = document.getElementById('global-search');
const filterStatus = document.getElementById('filter-status'); // This might be null if not in HTML
window.filterThreads = function (value) {
    currentFilter = value;
    renderThreads();
};
window.toggleSortOrder = function () {
    currentSortOrder = (currentSortOrder === 'asc' ? 'desc' : 'asc');
    renderThreads();
};
const assignedSidebarListEl = document.getElementById('assigned-sidebar-list');

// Utility: Clean text for mentions
function cleanText(s) {
    if (!s) return "";
    return String(s)
        .normalize('NFC')
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Strip Zero-Width Spaces and similar
        .replace(/[\u3000\u00A0]/g, ' ')       // Normalize Japanese and non-breaking spaces
        .trim()
        .toLowerCase();
}

// Utility: Format Date
function formatDate(isoString) {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) + ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
        return '';
    }
}

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

const whitelistEmailInp = document.getElementById('whitelist-email-inp');
const addWhitelistBtn = document.getElementById('add-whitelist-btn');
const adminWhitelistList = document.getElementById('admin-whitelist-list');
const teamsSidebarEl = document.getElementById('teams-sidebar');
const teamsListEl = document.getElementById('teams-list');
const secondarySidebarEl = document.getElementById('secondary-sidebar');
const channelListEl = document.getElementById('channel-list');
const currentTeamNameSidebar = document.getElementById('current-team-name-sidebar');
const sidePanelEl = document.querySelector('.side-panel');

const btnAddTeam = document.getElementById('btn-add-team');
const teamModal = document.getElementById('team-modal');
const newTeamNameInp = document.getElementById('new-team-name');
const saveTeamBtn = document.getElementById('save-team-btn');

// --- Team Management Elements ---
const teamManageModal = document.getElementById('team-manage-modal');
const teamConfigModal = document.getElementById('team-config-modal');
const editTeamNameInp = document.getElementById('edit-team-name');
const saveTeamNameBtn = document.getElementById('save-team-name-btn');
const editTeamIconPreview = document.getElementById('edit-team-icon-preview');
const editTeamIconInput = document.getElementById('edit-team-icon-input');
const saveTeamIconBtnReal = document.getElementById('save-team-icon-btn-real');

const teamMemberEmailInp = document.getElementById('team-member-email');

// Create Team - Member Addition Elements
const newTeamMembersInput = document.getElementById('new-team-members-input');
const newTeamMembersList = document.getElementById('new-team-members-list');
const newTeamSuggestions = document.getElementById('new-team-suggestions');
let selectedNewTeamMembers = []; // Stores user objects or emails


const teamMemberList = document.getElementById('team-member-list');

if (saveTeamBtn) {
    saveTeamBtn.onclick = createTeam;
}

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
    // 瞬時反映のため、全スレッドをフェッチする方式に再度統一
    const { data, error } = await supabaseClient.from('threads').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    return data || [];
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
                <button class="btn btn-sm" style="background: var(--danger);" onclick="window.removeWhitelist('${item.email}')">削除</button>
            </td>
        `;
        adminWhitelistList.appendChild(tr);
    });
}

window.addWhitelist = async function () {
    const email = whitelistEmailInp.value.trim();
    if (!email) return;
    if (!['Admin', 'Manager'].includes(currentProfile.role)) {
        console.error("Permission denied for addWhitelist. Current role:", currentProfile.role);
        return alert("権限がありません。");
    }

    const { error } = await supabaseClient.from('allowed_users').insert([{ email, added_by: currentUser.id }]);
    if (error) {
        console.error("addWhitelist DB error:", error);
        alert("追加に失敗しました: " + error.message);
    } else {
        whitelistEmailInp.value = '';
        await fetchWhitelist();
    }
};

window.removeWhitelist = async function (email) {
    if (!['Admin', 'Manager'].includes(currentProfile.role)) {
        console.error("Permission denied for removeWhitelist. Current role:", currentProfile.role);
        return alert("権限がありません。");
    }
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
    try {
        const { data: teamIds, error: memberError } = await supabaseClient.from('team_members').select('team_id').eq('user_id', currentUser.id);

        if (memberError) {
            console.warn("fetchTeams: Error fetching member teams", memberError);
            allTeams = [];
            renderTeamsSidebar();
            return;
        }

        const ids = (teamIds || []).map(t => t.team_id);

        if (ids.length === 0) {
            allTeams = [];
            renderTeamsSidebar();
            return;
        }

        const { data, error } = await supabaseClient.from('teams').select('*').in('id', ids);

        if (error) {
            console.error("fetchTeams: Error fetching team details", error);
            allTeams = [];
            renderTeamsSidebar();
            return;
        }

        allTeams = data || [];
        renderTeamsSidebar();

    } catch (e) {
        console.error("fetchTeams: Unexpected error", e);
        // Ensure sidebar appears even if something crashes
        renderTeamsSidebar();
    }
}

// Helper to get plain text from HTML
function getPlainTextForSidebar(html) {
    if (!html) return "";
    // Remove everything except mention spans - preserve mentions for highlighting
    // First, temporarily replace mention spans with a marker
    let processed = html.replace(/<span class="mention">(.*?)<\/span>/g, '___MENTION_START___$1___MENTION_END___');
    // Now strip other HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = processed;
    let plain = tempDiv.innerText || tempDiv.textContent || "";
    // Restore mention spans
    plain = plain.replace(/___MENTION_START___(.*?)___MENTION_END___/g, '<span class="mention">$1</span>');
    return plain;
}

// Helper to extract mentions
function hasMention(content) {
    if (!content) return false;
    const plainText = (content.normalize('NFC').includes('<') ? getPlainTextForSidebar(content) : content.normalize('NFC')).toLowerCase();

    // Greedy match for mentions
    const matches = plainText.match(/@([^<>\n\r,.;:!?()[\]{}'\"]+)/g);
    if (!matches) return false;

    // Get all possible target strings for current user
    const targets = new Set();
    if (currentUser && currentUser.email) targets.add(cleanText(currentUser.email));
    if (currentProfile) {
        if (currentProfile.display_name) {
            const name = cleanText(currentProfile.display_name);
            targets.add(name);
            targets.add(name.replace(/\s+/g, '')); // No space version
        }
    }

    // Check if any match starts with any target
    return matches.some(m => {
        const candidates = m.substring(1).toLowerCase();
        for (let t of targets) {
            if (candidates.startsWith(t)) return true;
        }
        return false;
    });
}

window.renderTeamsSidebar = function () {
    try {
        if (!teamsListEl) return;
        teamsListEl.innerHTML = '';

        // Sort allTeams based on LocalStorage order
        const savedOrder = JSON.parse(localStorage.getItem(`team_order_${currentUser.id}`) || '[]');
        if (savedOrder.length > 0) {
            allTeams.sort((a, b) => {
                const idxA = savedOrder.indexOf(String(a.id));
                const idxB = savedOrder.indexOf(String(b.id));
                if (idxA === -1 && idxB === -1) return 0;
                if (idxA === -1) return 1; // New items go to end
                if (idxB === -1) return -1;
                return idxA - idxB;
            });
        }

        // "ALL" Icon as the first item in the list
        const allTeamsDiv = document.createElement('div');
        allTeamsDiv.id = 'dynamic-all-teams-nav'; // Assign ID for sub-menu targeting
        allTeamsDiv.className = `team-list-item ${currentTeamId === null ? 'active' : ''}`;
        allTeamsDiv.onclick = () => switchTeam(null);
        allTeamsDiv.innerHTML = `
        <div class="team-icon" style="background: linear-gradient(135deg, #FF6B6B, #FF8E53); color: white; display:flex; align-items:center; justify-content:center;">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
        </div>
        <span class="team-name-label" style="font-weight:bold; color: #fff;">ALL Teams</span>
    `;
        teamsListEl.appendChild(allTeamsDiv);


        // Structure: Header (Clickable) + Submenu container
        let allTeamsHtml = `
            <div class="team-item-header" onclick="switchTeam(null)">
                <div class="team-icon" style="background: linear-gradient(135deg, #FF6B6B, #FF8E53); color: white; display:flex; align-items:center; justify-content:center;">
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                </div>
                <span class="team-name-label" style="font-weight:bold; color: #fff;">ALL Teams</span>
            </div>
        `;

        // Inject Submenu if ALL Teams is active
        if (currentTeamId === null) {
            const filteredThreads = threads.filter(t => t.status !== 'completed');
            const pendingCount = filteredThreads.filter(t => t.status === 'pending').length;
            const myCount = filteredThreads.filter(t => t.status === 'pending' && window.hasMention(t.content)).length;

            allTeamsHtml += `
            <div class="sidebar-submenu">
                <div class="sidebar-submenu-item ${feedFilter === 'all' ? 'active' : ''}" onclick="event.stopPropagation(); feedFilter='all'; renderTeamsSidebar(); renderThreads();">
                    <span># すべて</span>
                </div>
                <div class="sidebar-submenu-item ${feedFilter === 'pending' ? 'active' : ''}" onclick="event.stopPropagation(); feedFilter='pending'; renderTeamsSidebar(); renderThreads();">
                    <span># 未完了</span>
                    <span class="badge" style="background: var(--danger); color: white; border-radius: 10px; padding: 2px 8px; font-size: 0.7rem;">
                        ${pendingCount}
                    </span>
                </div>
                <div class="sidebar-submenu-item ${feedFilter === 'assigned' ? 'active' : ''}" onclick="event.stopPropagation(); feedFilter='assigned'; renderTeamsSidebar(); renderThreads();">
                    <span># 自分宛て</span>
                    <span class="badge" style="background: var(--primary-light); color: white; border-radius: 10px; padding: 2px 8px; font-size: 0.7rem;">
                         ${myCount}
                    </span>
                </div>
            </div>
            `;
        }
        allTeamsDiv.innerHTML = allTeamsHtml;
        teamsListEl.appendChild(allTeamsDiv);

        allTeams.forEach(team => {
            const div = document.createElement('div');
            const isActive = String(currentTeamId) === String(team.id);
            div.className = `team-list-item ${isActive ? 'active' : ''}`;
            div.title = team.name;

            // Drag and Drop Attributes (Apply to the main container)
            div.draggable = true;
            div.dataset.teamId = team.id;

            // Drag Events (Same as before)
            div.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', team.id);
                e.dataTransfer.effectAllowed = 'move';
                div.classList.add('dragging');
                const iconEl = div.querySelector('.team-icon');
                if (iconEl) e.dataTransfer.setDragImage(iconEl, 20, 20);
                requestAnimationFrame(() => teamsListEl.classList.add('is-dragging'));
            };
            div.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = div.getBoundingClientRect();
                const offsetY = e.clientY - rect.top;
                const isTop = offsetY < (rect.height / 2);
                if (isTop) { div.classList.add('drag-over-top'); div.classList.remove('drag-over-bottom'); }
                else { div.classList.add('drag-over-bottom'); div.classList.remove('drag-over-top'); }
                div.classList.add('drag-over');
            };
            div.ondragleave = () => div.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
            div.ondragend = () => {
                div.classList.remove('dragging');
                teamsListEl.classList.remove('is-dragging');
                document.querySelectorAll('.team-list-item').forEach(el => el.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom'));
            };
            div.ondrop = (e) => {
                e.preventDefault();
                div.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
                const draggedId = e.dataTransfer.getData('text/plain');
                const targetId = team.id;
                if (draggedId !== String(targetId)) {
                    const oldIndex = allTeams.findIndex(t => String(t.id) === draggedId);
                    let newIndex = allTeams.findIndex(t => String(t.id) === String(targetId));
                    const rect = div.getBoundingClientRect();
                    const offsetY = e.clientY - rect.top;
                    const isTop = offsetY < (rect.height / 2);
                    if (oldIndex > -1 && newIndex > -1) {
                        const [movedTeam] = allTeams.splice(oldIndex, 1);
                        let adjustedTargetIndex = allTeams.findIndex(t => String(t.id) === String(targetId));
                        if (!isTop) adjustedTargetIndex += 1;
                        allTeams.splice(adjustedTargetIndex, 0, movedTeam);
                        const newOrder = allTeams.map(t => String(t.id));
                        localStorage.setItem(`team_order_${currentUser.id}`, JSON.stringify(newOrder));
                        renderTeamsSidebar();
                    }
                }
            };

            let iconHtml = '';
            if (team.avatar_url) {
                // Debug logging for troubleshooting
                console.log(`Team: ${team.name}, Avatar Length: ${team.avatar_url.length}, Start: ${team.avatar_url.substring(0, 50)}`);

                // Check if it's Base64 (starts with data:)
                const isBase64 = team.avatar_url.startsWith('data:');
                const src = isBase64 ? team.avatar_url : `${team.avatar_url}?v=${globalAvatarVersion}`;
                iconHtml = `<div class="team-icon" style="background: transparent;"><img src="${src}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;"></div>`;
            } else {
                iconHtml = `<div class="team-icon" style="background: ${team.icon_color || '#313338'}; color: var(--text-muted);">${team.name.charAt(0).toUpperCase()}</div>`;
            }

            // Click Handler Wrapper
            const clickHandler = `
                const tId = '${team.id}';
                if (String(currentTeamId) === String(tId)) {
                    switchTeam(null);
                } else {
                    switchTeam(tId);
                }
            `;

            // HTML Structure: Header + Submenu
            let itemHtml = `
                <div class="team-item-header" onclick="${clickHandler.replace(/"/g, '&quot;').replace(/\n/g, '')}">
                    ${iconHtml}
                    <span class="team-name-label">${escapeHtml(team.name)}</span>
                </div>
            `;

            // Render Channels (Submenu) if Active
            if (isActive) {
                const pendingCount = threads.filter(t => t.status === 'pending' && String(t.team_id) === String(team.id)).length;
                const assignedCount = threads.filter(t => t.status === 'pending' && String(t.team_id) === String(team.id) && window.hasMention(t.content)).length;

                // Helper for visibility of admin controls
                const myRole = currentProfile.role;
                const isOwner = team.created_by === currentUser.id;
                const showSettings = (myRole === 'Admin' || myRole === 'Manager' || isOwner);

                itemHtml += `
                <div class="sidebar-submenu">
                    <div class="sidebar-submenu-item ${feedFilter === 'all' ? 'active' : ''}" onclick="event.stopPropagation(); feedFilter='all'; renderTeamsSidebar(); renderThreads();">
                        <span># 一般</span>
                    </div>
                     <div class="sidebar-submenu-item ${feedFilter === 'pending' ? 'active' : ''}" onclick="event.stopPropagation(); feedFilter='pending'; renderTeamsSidebar(); renderThreads();">
                        <span># 未完了</span>
                        <span class="badge" style="background: var(--danger); color: white; border-radius: 10px; padding: 2px 8px; font-size: 0.7rem;">
                            ${pendingCount}
                        </span>
                    </div>
                     <div class="sidebar-submenu-item ${feedFilter === 'assigned' ? 'active' : ''}" onclick="event.stopPropagation(); feedFilter='assigned'; renderTeamsSidebar(); renderThreads();">
                        <span># 自分宛て</span>
                         <span class="badge" style="background: var(--primary-light); color: white; border-radius: 10px; padding: 2px 8px; font-size: 0.7rem;">
                              ${assignedCount}
                        </span>
                    </div>
                    <div class="sidebar-submenu-item" onclick="event.stopPropagation(); window.openTeamSettings();">
                        <span style="display:flex; align-items:center; gap:6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            メンバー一覧
                        </span>
                    </div>
                    ${showSettings ? `
                    <div class="sidebar-submenu-item" onclick="event.stopPropagation(); window.openTeamConfigModal();">
                        <span style="display:flex; align-items:center; gap:6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="3"></circle>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                            </svg>
                            設定
                        </span>
                    </div>` : ''}
                </div>
                `;
            }

            div.innerHTML = itemHtml;
            // Add click listener purely to outer div for fallback?
            // - No, we used inline onclick on header.
            // But we need to support the logic where clicking the CONTAINER (if padding exists) does something?
            // Actually, we'll rely on the header click. The container is just a wrapper now.

            teamsListEl.appendChild(div);
        });

        // Separator
        const divider = document.createElement('div');
        divider.className = 'sidebar-divider';
        teamsListEl.appendChild(divider);

        // Dynamic "Add Team" Button
        const addTeamDiv = document.createElement('div');
        addTeamDiv.className = 'team-list-item';
        addTeamDiv.onclick = openCreateTeamModal;
        addTeamDiv.innerHTML = `
                <div class="team-item-header"> <!-- Wrapper for styling consistency -->
                    <div class="team-icon" style="border: 2px dashed rgba(255,255,255,0.3); background: transparent; color: rgba(255,255,255,0.6); display: flex; align-items: center; justify-content: center;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </div>
                    <span class="team-name-label" style="color: rgba(255,255,255,0.7);">チームを追加</span>
                </div>
                `;
        teamsListEl.appendChild(addTeamDiv);
    } catch (e) {
        console.error("Teams Sidebar Render Error:", e);
    }
}

window.switchGlobalNav = function (nav) {
    currentGlobalNav = nav;
    currentTeamId = null; // Reset team selection when switching global nav
    const navTeams = document.getElementById('nav-teams');
    if (navTeams && nav === 'teams') navTeams.classList.add('active'); // Force active visual

    feedFilter = 'all'; // Reset filter

    renderTeamsSidebar(); // Re-render to show nested filters for All
    window.scrollTo({ top: 0, behavior: 'instant' });
    renderThreads(); // Immediate feedback
    loadData(); // Refresh in background
};

window.switchTeam = function (teamId) {
    currentTeamId = teamId; // teamId usually comes as string from dataset but we use String() comparisons anyway
    currentGlobalNav = 'teams';
    const navTeams = document.getElementById('nav-teams');
    if (navTeams) navTeams.classList.remove('active');

    // Default to 'all' filter when switching team unless preserved? Let's reset.
    feedFilter = 'all';
    currentFilter = 'all';

    renderTeamsSidebar(); // Update to show properties of selected team
    // renderSecondarySidebar(); // Removed

    // メイン領域をトップに戻す
    const feedArea = document.querySelector('.main-feed-area');
    if (feedArea) feedArea.scrollTo({ top: 0, behavior: 'instant' });

    renderThreads();

    // バックグラウンドで最新情報を取得し、完了後に再度描画
    loadData().then(() => {
        renderThreads();
    });
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

    // 3. Add selected members
    if (selectedNewTeamMembers.length > 0) {
        const newMembersData = selectedNewTeamMembers.map(m => ({
            team_id: team.id,
            user_id: m.id
        }));
        const { error: batchError } = await supabaseClient.from('team_members').insert(newMembersData);
        if (batchError) {
            console.error("Batch Member Add Error:", batchError);
            alert("一部のメンバー追加に失敗しました");
        }
    }

    newTeamNameInp.value = '';
    // Reset member inputs
    if (newTeamMembersInput) newTeamMembersInput.value = '';
    if (newTeamMembersList) newTeamMembersList.innerHTML = '';
    selectedNewTeamMembers = [];

    teamModal.style.display = 'none';
    modalOverlay.style.display = 'none';
    fetchTeams();
}

window.openTeamSettings = async function () {
    if (!currentTeamId) return;

    modalOverlay.style.display = 'flex';
    teamManageModal.style.display = 'block';
    adminModal.style.display = 'none';
    settingsModal.style.display = 'none';
    if (teamConfigModal) teamConfigModal.style.display = 'none';
    if (teamModal) teamModal.style.display = 'none';

    // Show current team info in modal
    const team = allTeams.find(t => t.id == currentTeamId);
    const modalTitle = teamManageModal.querySelector('h2');
    if (modalTitle) modalTitle.textContent = `${team.name} 管理`;

    const avatarPreview = document.getElementById('team-avatar-preview');
    if (avatarPreview) {
        if (team.avatar_url) {
            avatarPreview.innerHTML = `< img src = "${team.avatar_url}" style = "width:100%;height:100%;border-radius:50%;object-fit:cover;" > `;
        } else {
            avatarPreview.textContent = team.name[0].toUpperCase();
        }
    }

    fetchTeamMembers(currentTeamId);

    // Hide/Show Admin Controls inside the modal based on permissions
    const canManage = currentProfile.role === 'Admin' || currentProfile.role === 'Manager' || team.created_by === currentUser.id;

    // Icon upload & Add Member inputs
    const teamSettingsSection = teamManageModal.querySelector('h4').parentNode; // The first section in modal
    if (teamSettingsSection) {
        if (canManage) {
            teamSettingsSection.style.display = 'block';
        } else {
            teamSettingsSection.style.display = 'none';
        }
    }
};

window.closeTeamManageModal = function () {
    teamManageModal.style.display = 'none';
    modalOverlay.style.display = 'none';
};

window.handleTeamAvatarSelect = async function (event) {
    const file = event.target.files[0];
    if (!file || !currentTeamId) return;

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt} `;
    const filePath = `team - avatars / ${fileName} `;

    try {
        // Upload to Storage (Using 'uploads' bucket since 'avatars' might not exist)
        const { error: uploadError } = await supabaseClient.storage
            .from('uploads')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabaseClient.storage
            .from('uploads')
            .getPublicUrl(filePath);

        const { error: updateError } = await supabaseClient
            .from('teams')
            .update({ avatar_url: publicUrl })
            .eq('id', currentTeamId);

        if (updateError) throw updateError;

        // Update local state - Wait, let's just re-fetch to be safe and ensure DB consistency
        // const team = allTeams.find(t => t.id == currentTeamId);
        // if (team) {
        //     team.avatar_url = publicUrl;
        // }

        // Cache busting URL for immediate display
        const now = Date.now();
        globalAvatarVersion = now; // Update global version for sidebar
        const displayUrl = `${publicUrl}?t = ${now} `;

        // UI Feedback - Update Modal Preview
        const avatarPreview = document.getElementById('team-avatar-preview');
        if (avatarPreview) {
            avatarPreview.innerHTML = `< img src = "${displayUrl}" style = "width:100%;height:100%;border-radius:50%;object-fit:cover;" > `;
        }

        showToast("チームアイコンを更新しました。再読み込み中...");

        // Re-fetch all teams to ensure sidebar and everything is in sync with Server
        await fetchTeams();

    } catch (e) {
        console.error(e);
        alert("アイコン更新エラー: " + e.message);
    }
};

async function fetchTeamMembers(teamId) {
    teamMemberList.innerHTML = '<tr><td colspan="2">読み込み中...</td></tr>';

    // Get team members
    const { data: members, error } = await supabaseClient
        .from('team_members')
        .select(`
                user_id,
                    added_at,
                    role,
                    profiles: user_id(email, display_name, avatar_url)
                        `)
        .eq('team_id', teamId);

    if (error) {
        console.error('Audit Log Error:', error);
        // Explicitly show error to user for debugging
        teamMemberList.innerHTML = `<tr><td colspan="4" style="color:var(--danger)">データ取得エラー: ${error.message} (${error.code})</td></tr>`;
        return;
    }

    if (!members || members.length === 0) {
        teamMemberList.innerHTML = '<tr><td colspan="4">変更履歴はありません</td></tr>';
        return;
    }

    // Header Row
    const headerRow = `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); font-size: 0.75rem;">
            <th style="padding: 10px; text-align: left;">名前 / メール</th>
            <th style="padding: 10px; text-align: left;">ロール</th>
            <th style="padding: 10px; text-align: right;">操作</th>
        </tr>
    `;

    const rows = members.map(m => {
        const p = m.profiles;
        const name = p ? (p.display_name || p.email) : '不明なユーザー';
        const email = p ? p.email : '';
        const isMe = currentUser && currentUser.id === m.user_id;
        const currentRole = m.role || 'member';

        // Robust Admin check
        const myRole = (currentProfile.role || '').toLowerCase();
        const isAdmin = myRole === 'admin';

        const canEdit = !isMe || isAdmin;

        const roles = [
            { val: 'owner', label: '所有者' },
            { val: 'admin', label: '管理者' },
            { val: 'member', label: 'メンバー' },
            { val: 'viewer', label: '閲覧のみ' }
        ];

        const roleSelect = `
            <select class="input-field btn-sm" style="width:auto; padding: 4px 8px; font-size: 0.85rem;"
                onchange="window.updateTeamMemberRole('${m.user_id}', this.value)" ${canEdit ? '' : 'disabled'}>
                ${roles.map(r => `<option value="${r.val}" ${currentRole === r.val ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>
        `;

        return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 10px;">
                    <div style="font-weight:bold; font-size: 0.9rem;">${escapeHtml(name)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(email)}</div>
                </td>
                <td style="padding: 10px;">
                    ${canEdit ? roleSelect : `<span style="font-size:0.85rem; color:var(--text-muted);">${roles.find(r => r.val === currentRole)?.label || currentRole}</span>`}
                </td>
                <td style="padding: 10px; text-align: right;">
                    ${!isMe ? `<button class="btn btn-sm" style="background:var(--danger); font-size: 0.8rem; padding: 4px 10px;" onclick="window.removeTeamMember('${m.user_id}')">削除</button>` : '<span style="font-size:0.8rem; color:var(--text-muted);">自分</span>'}
                </td>
            </tr>
        `;
    }).join('');

    teamMemberList.innerHTML = headerRow + rows;
}

window.updateTeamMemberRole = async function (userId, newRole) {
    if (!currentTeamId) return;

    // Check if the current user has permission (Team Owner or Overall Admin)
    const team = allTeams.find(t => t.id == currentTeamId);
    const isOwner = team && team.created_by === currentUser.id;
    const isAdmin = (currentProfile.role || '').toLowerCase() === 'admin';
    const isSelf = userId === currentUser.id;

    if (!isOwner && !isAdmin && !isSelf) {
        alert("権限がありません（所有者または全体管理者のみ変更可能です）");
        fetchTeamMembers(currentTeamId);
        return;
    }

    const { error } = await supabaseClient
        .from('team_members')
        .update({ role: newRole })
        .eq('team_id', currentTeamId)
        .eq('user_id', userId);

    if (error) {
        alert("権限変更失敗: " + error.message);
        fetchTeamMembers(currentTeamId); // Revert UI
    } else {
        // SUCCESS Feedback
        showToast("ロールを更新し、保存しました");
        // No need to reload list if we trust the UI state, but refreshing ensures consistency
    }
};



async function handleAuthState() {
    // ヘッダーのユーザー情報更新
    userDisplayEl.textContent = currentProfile.display_name || currentUser.email;
    userRoleEl.textContent = getRoleLabel(currentProfile.role);

    // ヘッダーアバターの表示
    if (headerAvatarImg) {
        if (currentProfile.avatar_url) {
            headerAvatarImg.innerHTML = `<img src="${currentProfile.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        } else {
            headerAvatarImg.textContent = (currentProfile.display_name || currentUser.email)[0].toUpperCase();
        }
    }

    // ロール名を正規化（先頭大文字）して状態を更新
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

    // UI Control: Hide "ALL" (nav-teams) for non-admins
    const navTeams = document.getElementById('nav-teams');
    if (navTeams) {
        if (['Admin'].includes(role)) {
            navTeams.style.display = 'flex';
        } else {
            navTeams.style.display = 'none';
        }
    }

    await loadMasterData();
    await loadData();
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

    const myIdentifier = currentProfile.display_name ? `@${currentProfile.display_name} ` : `@${currentUser.email} `;
    const myMentions = [myIdentifier, `@${currentUser.email} `];

    const myTagIds = allTagMembers.filter(m => m.profile_id === currentUser.id).map(m => m.tag_id);
    const myTagNames = allTags.filter(t => myTagIds.includes(t.id)).map(t => `@${t.name} `);

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
    allProfiles = (p || []).map(profile => {
        let role = profile.role || 'User';
        role = role.charAt(0).toUpperCase() + role.slice(1).toLowerCase();
        return { ...profile, role, display_name: (profile.display_name || "").normalize('NFC') };
    });
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

    // Force redirect non-admin from "ALL" view to first team
    if (!['Admin'].includes(role) && !currentTeamId) {
        // We need to ensure we have teams loaded. Usually fetchTeams runs after checkUser.
        // Wait for fetchTeams logic or check allTeams.
        // Since loadMasterData is called after checkUser -> fetchTeams chain:
        if (allTeams && allTeams.length > 0) {
            switchTeam(allTeams[0].id);
            return; // switchTeam calls renderThreads
        }
    }

    renderThreads();
}

window.updateRole = async function (profileId, newRole) {
    if (!['Admin', 'Manager'].includes(currentProfile.role)) return alert("権限がありません。");
    const { error } = await supabaseClient.from('profiles').update({ role: newRole }).eq('id', profileId);
    if (error) {
        alert("ロール更新失敗: " + error.message);
    } else {
        loadMasterData();
    }
};

window.addTag = async function () {
    const name = newTagNameInp.value.trim();
    if (!name) return;
    if (!['Admin', 'Manager'].includes(currentProfile.role)) {
        console.error("Permission denied for addTag. Current role:", currentProfile.role);
        return alert("権限がありません。");
    }
    const { error } = await supabaseClient.from('tags').insert([{ name }]);
    if (error) {
        console.error("addTag DB error:", error);
        alert("タグ追加失敗: " + error.message);
    } else {
        newTagNameInp.value = '';
        loadMasterData();
    }
};

window.deleteTag = async function (tagId) {
    if (!['Admin', 'Manager'].includes(currentProfile.role)) return alert("権限がありません。");
    if (confirm("タグを削除しますか？")) {
        const { error } = await supabaseClient.from('tags').delete().eq('id', tagId);
        if (error) {
            alert("タグ削除失敗: " + error.message);
        } else {
            loadMasterData();
        }
    }
};

// This function was added based on the instruction to fix a broken span tag in highlightMentions.
// Assuming 'highlightMentions' is a new utility function or was intended to be added.
function highlightMentions(text) {
    if (!text) return "";
    const normalizedText = text.normalize('NFC');

    // Match existing mention spans OR bare @mentions
    // We stop bare mentions at a variety of delimiters but NOT spaces initially to allow greedy checking
    const mentionRegex = /<span class="mention">.*?<\/span>|@([^<>\n\r,.;:!?()[\\]{}'\"]+)/g;

    // Helper to check if a name exists (as user or tag)
    const checkName = (name) => {
        const target = cleanText(name);
        const targetNoSpace = target.replace(/\s+/g, '');

        const isMe = (currentProfile && (cleanText(currentProfile.display_name) === target || cleanText(currentProfile.display_name).replace(/\s+/g, '') === targetNoSpace)) ||
            (currentUser && cleanText(currentUser.email) === target);

        if (isMe) return true;

        if (allProfiles.some(p => cleanText(p.display_name) === target || cleanText(p.display_name).replace(/\s+/g, '') === targetNoSpace || cleanText(p.email) === target)) return true;
        if (allTags.some(t => cleanText(t.name) === target || cleanText(t.name).replace(/\s+/g, '') === targetNoSpace)) return true;

        return false;
    };

    return normalizedText.replace(mentionRegex, (match, bareName) => {
        if (match.startsWith('<span')) return match; // Already highlighted

        // Greedy search: try to find the longest prefix of bareName that exists
        const candidates = bareName;
        // We split by spaces and check prefixes from long to short
        const parts = candidates.split(' ');
        for (let i = parts.length; i > 0; i--) {
            const potentialName = parts.slice(0, i).join(' ');
            if (checkName(potentialName)) {
                // Return highlighted part + the rest
                const rest = candidates.substring(potentialName.length);
                return `<span class="mention">@${potentialName}</span>${rest}`;
            }
        }

        // Final check: maybe the name has NO space but candidates has a space after it
        // Or it's just a single word that doesn't exist - return as is
        return match;
    });
}

window.toggleUserTag = async function (profileId, tagId) {
    if (!['Admin', 'Manager'].includes(currentProfile.role)) {
        console.error("Permission denied for toggleUserTag. Current role:", currentProfile.role);
        return alert("権限がありません。");
    }
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
    const titleEl = document.getElementById(`title - ${threadId} `);
    const contentEl = document.getElementById(`content - ${threadId} `);

    if (!titleEl || !contentEl) return;

    const originalTitle = titleEl.textContent;
    const originalContent = contentEl.textContent;

    titleEl.innerHTML = `< input type = "text" id = "edit-title-${threadId}" class="input-field" value = "${escapeHtml(originalTitle)}" style = "font-size: 1rem; font-weight: bold;" > `;
    contentEl.innerHTML = `
                    < textarea id = "edit-content-${threadId}" class="input-field" style = "height: 100px; resize: vertical;" > ${escapeHtml(originalContent)}</textarea >
                        <div style="display: flex; gap: 8px; margin-top: 8px;">
                            <button class="btn btn-primary btn-sm" onclick="saveEdit('${threadId}')">更新</button>
                            <button class="btn btn-sm btn-outline" onclick="cancelEdit('${threadId}')">キャンセル</button>
                        </div>
                `;
};

window.saveEdit = async function (threadId) {
    const titleInp = document.getElementById(`edit - title - ${threadId} `);
    const contentInp = document.getElementById(`edit - content - ${threadId} `);
    const saveBtn = document.querySelector(`button[onclick = "saveEdit('${threadId}')"]`);

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
    const contentEl = document.getElementById(`reply - content - ${replyId} `);
    if (!contentEl) return;

    const originalContent = contentEl.textContent;
    contentEl.innerHTML = `
                    < textarea id = "edit-reply-content-${replyId}" class="input-field" style = "height: 60px; resize: vertical; font-size: 0.8rem; margin-top: 5px;" > ${escapeHtml(originalContent)}</textarea >
                        <div style="display: flex; gap: 8px; margin-top: 8px;">
                            <button class="btn btn-primary btn-sm" onclick="saveReply('${replyId}', '${threadId}')">更新</button>
                            <button class="btn btn-sm btn-outline" onclick="renderThreads()">キャンセル</button>
                        </div>
                `;
};

window.saveReply = async function (replyId, threadId) {
    const contentInp = document.getElementById(`edit - reply - content - ${replyId} `);
    const saveBtn = document.querySelector(`button[onclick = "saveReply('${replyId}', '${threadId}')"]`);

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

window.cancelEdit = function (threadId) {
    renderThreads();
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
            // handleAuthState(); // REMOVED: Caused infinite recursion loop
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
    try {
        // 全データを一括取得（切り替えのバグを回避するため）
        const threadData = await fetchThreads();
        const { data: replyData, error: replyError } = await supabaseClient.from('replies').select('*').order('created_at', { ascending: true });

        if (replyError) throw replyError;

        const repliesByThread = {};
        (replyData || []).forEach(r => {
            if (!repliesByThread[r.thread_id]) repliesByThread[r.thread_id] = [];
            repliesByThread[r.thread_id].push(r);
        });

        threads = (threadData || []).map(t => ({
            ...t,
            replies: repliesByThread[t.id] || []
        }));

        renderThreads();
    } catch (e) {
        console.error("loadData error:", e);
        renderThreads();
    }
}

async function addThread() {
    const title = newTitleInp.value.trim();
    const content = newContentInp.innerText.trim(); // Use innerText for contenteditable

    if (currentProfile.role === 'Viewer') return alert("閲覧専用権限（Viewer）のため、投稿できません。");
    if (!title || !content) return alert("タイトルと内容を入力してください。");

    addThreadBtn.disabled = true;
    // Don't change textContent to keep the paper airplane SVG
    const authorName = currentProfile.display_name || currentUser.email;
    const { data, error } = await supabaseClient.from('threads').insert([
        {
            title,
            content: newContentInp.innerHTML, // Save HTML to preserve mention styling
            author: authorName,
            user_id: currentUser.id, // Explicitly link to auth user
            team_id: currentTeamId,
            attachments: currentAttachments // Add attachments
        }
    ]).select();

    if (error) {
        alert("投稿失敗: " + error.message);
    } else {
        if (data && data[0]) {
            threads.unshift(data[0]); // Optimistic update
            renderThreads();
        }
        newTitleInp.value = '';
        newContentInp.innerHTML = ''; // Clear HTML
        currentAttachments = []; // Clear attachments
        renderAttachmentPreview();
    }
    addThreadBtn.disabled = false;
}

window.addReply = async function (threadId) {
    const input = document.getElementById(`reply - input - ${threadId} `);
    const content = input.innerText.trim();
    if (!content || currentProfile.role === 'Viewer') return;
    const authorName = currentProfile.display_name || currentUser.email;

    // Attachments for this thread's reply
    const atts = replyAttachments[threadId] || [];

    const { error } = await supabaseClient.from('replies').insert([{
        thread_id: threadId,
        content: input.innerHTML,
        author: authorName,
        attachments: atts
    }]);

    if (error) {
        alert("返信失敗: " + error.message);
    } else {
        input.innerHTML = '';
        replyAttachments[threadId] = []; // Clear
        renderReplyAttachmentPreview(threadId);

        // Scroll to bottom after adding a reply
        setTimeout(() => {
            const scrollArea = document.querySelector(`#thread - ${threadId} .reply - scroll - area`);
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
    const originalCompletedBy = thread.completed_by; // Keep backup
    const originalCompletedAt = thread.completed_at;

    thread.status = thread.status === 'completed' ? 'pending' : 'completed';

    // Trigger Animation
    animatingThreadId = threadId;

    // Update local state for immediate UI feedback
    if (thread.status === 'completed') {
        thread.completed_by = currentUser.id;
        thread.completed_at = new Date().toISOString();
        showCompleteEffect(threadId);
    } else {
        thread.completed_by = null;
        thread.completed_at = null;
    }

    renderThreads();

    // Reset animation trigger after short delay
    setTimeout(() => {
        if (animatingThreadId === threadId) { // Check if still same
            animatingThreadId = null;
        }
    }, 500);

    // -------------------------

    const updatePayload = { status: thread.status };
    if (thread.status === 'completed') {
        updatePayload.completed_by = currentUser.id;
        updatePayload.completed_at = new Date().toISOString();
    } else {
        updatePayload.completed_by = null;
        updatePayload.completed_at = null;
    }

    const { error } = await supabaseClient.from('threads').update(updatePayload).eq('id', threadId);
    if (error) {
        // Revert on error
        thread.status = originalStatus;
        thread.completed_by = originalCompletedBy;
        thread.completed_at = originalCompletedAt;
        renderThreads();
        alert("更新に失敗しました。");
    }
}


window.showToast = function (message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : ''} `;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }, 3000);
};

function showCompleteEffect(threadId) {
    const card = document.getElementById(`thread - ${threadId} `);
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
        if (error) {
            alert("削除失敗: " + error.message);
        } else {
            threads = threads.filter(t => String(t.id) !== String(threadId)); // Optimistic update
            renderThreads();
        }
    }
}

// --- Rendering Logic ---

function renderThreads() {
    if (!currentUser) return; // Prevent crash if called before auth
    const filter = currentFilter;
    const searchQuery = globalSearchInp.value.trim().toLowerCase();

    // --- Central Feed Data ---
    const getLatestActivity = (t) => {
        let latest = new Date(t.created_at).getTime();
        if (t.replies && t.replies.length > 0) {
            const lastReply = t.replies[t.replies.length - 1];
            const replyTime = new Date(lastReply.created_at).getTime();
            if (replyTime > latest) latest = replyTime;
        }
        return latest;
    };

    const myName = currentProfile.display_name || currentUser.email;
    const myTagIds = allTagMembers.filter(m => m.profile_id === currentProfile.id).map(m => m.tag_id);
    const myTagNames = allTags.filter(t => myTagIds.includes(t.id)).map(t => t.name);

    // Use the global hasMention helper defined previously

    // List Sticky Header Title Calculation
    const currentTeamName = (currentTeamId !== null)
        ? (allTeams.find(t => t.id == currentTeamId)?.name || 'Team')
        : 'List';

    let feedThreads = [...threads].filter(t => {
        // 1. Team Filtering (Explicitly handle Global Nav and Team selection)
        if (currentTeamId !== null) {
            if (String(t.team_id) !== String(currentTeamId)) return false;
        }

        // 2. Status Filter (Top Select)
        if (currentFilter !== 'all' && t.status !== currentFilter) return false;

        // 3. Sidebar Navigation Filter (feedFilter: pending / mentions)
        if (feedFilter === 'pending') {
            return t.status === 'pending';
        }
        if (feedFilter === 'assigned') {
            if (t.status === 'completed') return false;
            return hasMention(t.content) || (t.replies || []).some(r => hasMention(r.content));
        }

        return true;
    }).sort((a, b) => {
        // --- Sort Logic: Pins always on top, then by currentSortOrder ---
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;

        const timeA = getLatestActivity(a);
        const timeB = getLatestActivity(b);
        return currentSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });

    if (searchQuery) {
        feedThreads = feedThreads.filter(t =>
            (t.title && t.title.toLowerCase().includes(searchQuery)) ||
            (t.content && t.content.toLowerCase().includes(searchQuery)) ||
            ((t.author_name || t.author || "").toLowerCase().includes(searchQuery))
        );
    }

    threadListEl.innerHTML = '';
    sidebarListEl.innerHTML = '';
    assignedSidebarListEl.innerHTML = '';

    // List Sticky Header
    const headerHtml = `
                    <div class="feed-header-sticky">
            <div class="feed-header-left">
                <select id="filter-status-sticky" class="input-field" style="width: auto; padding: 2px 10px; font-size: 0.8rem;" onchange="filterThreads(this.value)">
                    <option value="all" ${currentFilter === 'all' ? 'selected' : ''}>すべて表示</option>
                    <option value="pending" ${currentFilter === 'pending' ? 'selected' : ''}>未完了</option>
                    <option value="completed" ${currentFilter === 'completed' ? 'selected' : ''}>完了済み</option>
                </select>
            </div>
            
            <div class="feed-header-center">
                <h2 style="font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 8px; margin: 0;">
                    ${escapeHtml(currentTeamName)} 
                    <span id="task-count-sticky" style="color: var(--primary-light); font-size: 0.9rem; font-weight: normal;">${feedThreads.length} 件</span>
                </h2>
                ${currentTeamId !== null ? `
                <button class="btn btn-sm btn-outline btn-icon-only gear-btn-unified" onclick="window.openTeamSettings()" title="チーム設定" style="margin-left: 8px;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px;">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </button>` : ''}
            </div>

            <div class="feed-header-right">
                <button class="btn-sort-toggle" onclick="toggleSortOrder()" title="並び替え順を切り替え">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="7 15 12 20 17 15"></polyline>
                        <polyline points="7 9 12 4 17 9"></polyline>
                    </svg>
                    ${currentSortOrder === 'asc' ? '昇順' : '降順'}
                </button>
            </div>
        </div>
                    `;

    if (taskCountEl) taskCountEl.textContent = feedThreads.length;
    threadListEl.insertAdjacentHTML('afterbegin', headerHtml);

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
                const reactors = reactionsForThread
                    .filter(r => r.emoji === emoji)
                    .map(r => {
                        const p = allProfiles.find(prof => prof.id === r.profile_id);
                        return p ? (p.display_name || p.email) : '不明';
                    });
                const title = reactors.join(', ');
                const hasMyReaction = reactionsForThread.some(r => r.profile_id === currentUser.id && r.emoji === emoji);
                return `<span class="reaction-badge ${hasMyReaction ? 'active' : ''}" title="${title}" onclick="addReaction('${thread.id}', 'thread', '${emoji}')">${emoji} ${count}</span>`;
            }).join('');

        const currentReplies = thread.replies || [];
        let repliesHtml = currentReplies.map(reply => {
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
                    const reactors = reactionsForReply
                        .filter(r => r.emoji === emoji)
                        .map(r => {
                            const p = allProfiles.find(prof => prof.id === r.profile_id);
                            return p ? (p.display_name || p.email) : '不明';
                        });
                    const title = reactors.join(', ');
                    const hasMyReaction = reactionsForReply.some(r => r.profile_id === currentUser.id && r.emoji === emoji);
                    return `<span class="reaction-badge ${hasMyReaction ? 'active' : ''}" style="font-size: 0.7rem; padding: 1px 6px;" title="${title}" onclick="addReaction('${reply.id}', 'reply', '${emoji}')">${emoji} ${count}</span>`;
                }).join('');

            const isReplyOwner = reply.author === (currentProfile.display_name || currentUser.email);
            const canDeleteReply = isReplyOwner || ['Admin', 'Manager'].includes(currentProfile.role);

            // 添付ファイルの描画
            let attachmentsHtml = '';
            if (reply.attachments && reply.attachments.length > 0) {
                attachmentsHtml = `<div class="attachment-display">` + reply.attachments.map(att => {
                    if (att.type.startsWith('image/')) {
                        return `<img src="${att.url}" class="attachment-thumb-large" onclick="window.open('${att.url}', '_blank')">`;
                    } else {
                        return `<a href="${att.url}" target="_blank" class="file-link"><span style="font-size:1.2em;">📄</span> ${att.name}</a>`;
                    }
                }).join('') + `</div>`;
            }

            const authorProfile = allProfiles.find(p => p.display_name === reply.author || p.email === reply.author);
            const avatarUrl = authorProfile?.avatar_url;
            const initials = reply.author ? (reply.author[0] || '?').toUpperCase() : '?';

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
            <div class="reply-header">
                <div class="avatar" style="width: 20px; height: 20px; font-size: 0.6rem;">
                    ${avatarUrl ? `<img src="${avatarUrl}">` : initials}
                </div>
                <span>${reply.author}</span>
                <span>${new Date(reply.created_at).toLocaleString()}</span>
            </div>
            <div class="reply-content" id="reply-content-${reply.id}">${highlightMentions(reply.content)}</div>
            ${attachmentsHtml}

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

        // 完了者情報の取得
        let completerName = '';
        if (thread.status === 'completed' && thread.completed_by) {
            const completer = allProfiles.find(p => p.id === thread.completed_by);
            if (completer) {
                completerName = completer.display_name || completer.email;
            }
        }


        card.innerHTML = `
            ${thread.is_pinned ? '<div class="pinned-badge">重要</div>' : ''}
            ${currentTeamId === null ? `<div class="team-badge">${escapeHtml(allTeams.find(t => t.id === thread.team_id)?.name || 'Unknown Team')}</div>` : ''}
            
            <div class="dot-menu-container">
                <div class="dot-menu-trigger">⋮</div>
                <div class="dot-menu">
                ${['Admin', 'Manager'].includes(currentProfile.role) ? `
                <div class="menu-item" onclick="openTeamSelectModal('${thread.id}', 'repost')">
                    <span class="menu-icon">↪️</span> 別チームへ投稿 (コピー)
                </div>
                <div class="menu-item" style="cursor: default; position: relative;">
                    <span class="menu-icon">➡️</span> チーム移動
                    <!-- Hover Submenu -->
                    <div class="submenu">
                        ${allTeams.filter(t => t.id !== thread.team_id).map(t => `
                            <div class="menu-item" onclick="event.preventDefault(); event.stopPropagation(); window.moveThreadDirectly('${thread.id}', '${t.id}')">
                                ${escapeHtml(t.name)}
                            </div>
                        `).join('')}
                        ${allTeams.filter(t => t.id !== thread.team_id).length === 0 ? '<div class="menu-item" style="color: grey;">移動先なし</div>' : ''}
                    </div>
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
                    <span class="thread-date" style="margin-left: 10px; font-size: 0.8rem; color: var(--text-muted);">${formatDate(thread.created_at)}</span>
                </div>
            </div>

            <div class="task-title-line" id="title-${thread.id}">${thread.title}</div>
            <div class="task-content line-clamp-2" id="content-${thread.id}" style="white-space: pre-wrap; cursor: pointer;" onclick="this.classList.toggle('line-clamp-2')" title="クリックで全文表示/折りたたみ">${highlightMentions(thread.content)}</div>
            
            ${(() => {
                if (thread.attachments && thread.attachments.length > 0) {
                    return `<div class="attachment-display">` + thread.attachments.map(att => {
                        if (att.type.startsWith('image/')) {
                            return `<img src="${att.url}" class="attachment-thumb-large" onclick="window.open('${att.url}', '_blank')">`;
                        } else {
                            return `<a href="${att.url}" target="_blank" class="file-link"><span style="font-size:1.2em;">📄</span> ${att.name}</a>`;
                        }
                    }).join('') + `</div>`;
                }
                return '';
            })()
            }

            <div class="reaction-container-bottom">
                <div class="plus-trigger">+</div>
                <div class="reaction-menu">
                    ${reactionTypes.map(emoji =>
                `<span onclick="addReaction('${thread.id}', 'thread', '${emoji}')">${emoji}</span>`
            ).join('')}
                </div>
            </div>

                <div class="reply-section ${currentReplies.length === 0 ? 'is-empty' : ''}">
                    <div class="reply-scroll-area">${repliesHtml}</div>
                    ${(currentProfile.role !== 'Viewer' && thread.status !== 'completed') ? `
                    <div class="reply-form" style="display: flex; gap: 15px; align-items: flex-start; margin-top: 10px;">
                        <div style="flex: 1; position: relative;">
                            <div id="reply-input-${thread.id}" contenteditable="true" class="input-field btn-sm rich-editor" placeholder="返信 (メンションは@を入力)..." 
                                   style="min-height: 38px; margin-top: 0; padding: 8px;"
                                   oninput="handleReplyInput(this, '${thread.id}')"></div>
                             <div id="mention-list-${thread.id}" class="mention-list" style="bottom: 100%; top: auto; display: none;"></div>
                             <div id="reply-attachment-preview-${thread.id}" class="attachment-preview-area" style="padding-left: 0; margin-top: 5px;"></div>
                        </div>
                        <div style="display: flex; gap: 5px; margin-top: 0px;">
                             <button class="btn-sm btn-outline" onclick="triggerReplyFile('${thread.id}')" title="ファイル添付" 
                                style="padding: 0; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                                </svg>
                                <input type="file" id="reply-file-${thread.id}" style="display:none;" multiple onchange="handleReplyFileSelect(this, '${thread.id}')">
                            </button>
                            <button class="btn-send-reply" onclick="addReply('${thread.id}')" title="返信" 
                                style="width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; padding: 0; flex-shrink: 0;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="22" y1="2" x2="11" y2="13"></line>
                                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                                </svg>
                            </button>
                        </div>
                    </div>`
                : (thread.status === 'completed' ? '' : '')
            }
                </div>


        <div class="task-footer-teams">
            <div class="reaction-bar">
                ${reactionsHtml}
            </div>
            <div class="actions" style="display: flex; align-items: center; gap: 10px;">
                ${thread.status === 'completed' && completerName ?
                `<span style="font-size: 0.8rem; color: #4bf2ad; font-weight: bold;">✓ 完了: ${completerName}</span>`
                : ''}
                ${currentProfile.role !== 'Viewer' ? `
                    <button class="btn btn-sm btn-status ${thread.status === 'completed' ? 'btn-revert' : ''} ${animatingThreadId === thread.id ? 'btn-pop' : ''}" onclick="toggleStatus('${thread.id}')" title="${thread.status === 'completed' ? '未完了に戻す' : '完了にする'}" style="width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                        ${thread.status === 'completed' ?
                    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>` :
                    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`}
                    </button>
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
                if (currentReplies.length <= 1) {
                    scrollArea.classList.add('no-scroll');
                } else {
                    scrollArea.scrollTop = scrollArea.scrollHeight;
                }
            }
        }, 50);
    });

    sidebarListEl.innerHTML = '';
    assignedSidebarListEl.innerHTML = '';

    // --- Right Sidebar Rendering (Not Finished / Mentions) ---


    const pendingThreads = threads.filter(t => t.status === 'pending' && (currentTeamId === null || t.team_id == currentTeamId)).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    pendingThreads.forEach(thread => {
        const item = document.createElement('div');
        item.className = 'task-card'; // Changed to match CSS
        const plainContent = getPlainTextForSidebar(thread.content);
        const styledContent = highlightMentions(plainContent);
        const authorName = thread.author_name || thread.author || 'Unknown';

        // Prevent clicking the card when clicking the form
        item.onclick = (e) => {
            if (e.target.closest('.quick-reply-form') || e.target.closest('.quick-reply-btn') || e.target.closest('.quick-reply-input')) {
                return;
            }
            const target = document.getElementById(`thread-${thread.id}`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                target.classList.add('highlight-thread');
                setTimeout(() => target.classList.remove('highlight-thread'), 2000);
            }
        };

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div class="sidebar-title">${escapeHtml(thread.title)}</div>
                <button class="btn btn-sm btn-status ${animatingThreadId === thread.id ? 'btn-pop' : ''}" onclick="event.stopPropagation(); toggleStatus('${thread.id}')" title="完了にする" style="width: 28px; height: 28px; padding: 0; margin-left: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                </button>
            </div>
            <div class="task-content">
                ${styledContent}
            </div>
            <div style="font-size: 0.65rem; color: var(--text-muted); display: flex; justify-content: space-between; margin-top: 6px; opacity: 0.7;">
                <span>by ${escapeHtml(authorName)}</span>
                <span>${new Date(thread.created_at).toLocaleDateString()}</span>
            </div>
            
            <!-- Quick Reply Form (Contenteditable) -->
            <div class="quick-reply-form" onclick="event.stopPropagation()">
                <div style="position: relative; width: 100%;">
                    <div id="reply-input-quick-${thread.id}" 
                         contenteditable="true" 
                         class="quick-reply-input rich-editor" 
                         placeholder="返信... (@メンション)"
                         style="min-height: 32px; max-height: 80px; overflow-y: auto; color: white;"
                         oninput="handleQuickReplyInput(this, '${thread.id}')"
                         onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); window.quickReply('${thread.id}'); }"></div>
                    <div id="mention-list-quick-${thread.id}" class="mention-list" style="bottom: 100%; top: auto; display: none; width: 100%;"></div>
                </div>
                <button class="quick-reply-btn" onclick="window.quickReply('${thread.id}')" title="送信">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </button>
            </div>
                `;
        sidebarListEl.appendChild(item);

        // Register Quick Reply Mention List
        const qml = document.getElementById(`mention-list-quick-${thread.id}`);
        if (qml) replyMentionLists['quick-' + thread.id] = qml;
    });

    const assignedThreads = threads.filter(t => {
        if (currentTeamId !== null && t.team_id != currentTeamId) return false;
        if (t.status === 'completed') return false;
        // Check thread content and all replies for mentions
        if (window.hasMention(t.content)) return true;
        return (t.replies || []).some(r => window.hasMention(r.content));
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    assignedThreads.forEach(thread => {
        const item = document.createElement('div');
        item.className = 'sidebar-item personalized-sidebar-item';
        item.style.borderLeft = '3px solid var(--accent)';
        const authorName = thread.author_name || thread.author || 'Unknown';
        const plainContent = getPlainTextForSidebar(thread.content);
        const styledContent = highlightMentions(plainContent);
        item.innerHTML = `
                    <div class="sidebar-title">${escapeHtml(thread.title)}</div>
            <div class="line-clamp-2">${styledContent}</div>
            <div style="font-size: 0.65rem; color: var(--text-muted); display: flex; justify-content: space-between; margin-top: 6px; opacity: 0.7;">
                <span>by ${escapeHtml(authorName)}</span>
                <span>${new Date(thread.created_at).toLocaleDateString()}</span>
            </div>
                `;
        item.onclick = () => {
            const target = document.getElementById(`thread-${thread.id}`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        assignedSidebarListEl.appendChild(item);
    });

    // Scroll to bottom (newest posts) after rendering
    setTimeout(() => {
        const searchQuery = globalSearchInp.value.trim();
        if (!searchQuery && feedThreads.length > 0 && currentSortOrder === 'asc') {
            const lastThread = threadListEl.lastElementChild;
            if (lastThread) {
                lastThread.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }
        }
    }, 200);
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
                <td>
                    ${p.display_name || '-'} 
                    ${currentProfile.role === 'Admin' ? `<button class="btn-sm btn-outline" style="padding: 2px 6px; margin-left: 5px;" onclick="window.openEditUserNameModal('${p.id}', '${escapeHtml(p.display_name || '')}')">✎</button>` : ''}
                    <br><small>${p.email}</small>
                </td>
                <td>
                    <select onchange="window.updateRole('${p.id}', this.value)" class="input-field btn-sm" style="width: auto;">
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
                                        onclick="window.toggleUserTag('${p.id}', '${t.id}')" 
                                        ${currentProfile.role !== 'Admin' ? 'disabled' : ''}>
                                    ${t.name}
                                </button>`;
        }).join('')}
                    </div>
                </td>
            </tr >
                    `;
    }).join('');
}

function renderAdminTags() {
    adminTagList.innerHTML = allTags.map(t => {
        const count = allTagMembers.filter(m => m.tag_id === t.id).length;
        return `
                    < tr >
                <td>${t.name}</td>
                <td>${count}人</td>
                <td>
                    ${currentProfile.role === 'Admin' ? `<button class="btn btn-sm" style="background: var(--danger);" onclick="window.deleteTag('${t.id}')">削除</button>` : '-'}
                </td>
            </tr >
                    `;
    }).join('');
}

// --- Mention Helper ---

let activeReplyThreadId = null;
const replyMentionLists = {}; // スレッドIDごとにメンションリストを管理

function showMentionSuggestions(query, isThread = true, threadId = null) {
    const listEl = isThread ? mentionListEl : replyMentionLists[threadId];
    if (!listEl) return;

    // --- Dynamic Positioning Logic ---
    let inputEl = null;
    if (isThread) {
        inputEl = newContentInp;
    } else {
        if (typeof threadId === 'string' && threadId.startsWith('quick-')) {
            const realId = threadId.replace('quick-', '');
            inputEl = document.getElementById(`reply-input-quick-${realId}`);
        } else {
            inputEl = document.getElementById(`reply-input-${threadId}`);
        }
    }

    if (inputEl) {
        const rect = inputEl.getBoundingClientRect();
        const threshold = window.innerHeight / 2;

        // If input is in the top half of the screen, show list BELOW
        if (rect.top < threshold) {
            listEl.style.top = '100%';
            listEl.style.bottom = 'auto'; // Reset bottom
            listEl.style.marginTop = '5px'; // Add some spacing
            listEl.style.marginBottom = '0';
        } else {
            // Otherwise show list ABOVE (default)
            listEl.style.bottom = '100%';
            listEl.style.top = 'auto'; // Reset top
            listEl.style.marginBottom = '5px'; // Add some spacing
            listEl.style.marginTop = '0';
        }
    }
    // ---------------------------------

    const filteredProfiles = allProfiles.filter(p =>
        (p.display_name && String(p.display_name).toLowerCase().includes(query.toLowerCase())) ||
        (p.email && String(p.email).toLowerCase().includes(query.toLowerCase()))
    );
    const filteredTags = allTags.filter(t => t.name && String(t.name).toLowerCase().includes(query.toLowerCase()));

    if (filteredProfiles.length === 0 && filteredTags.length === 0) {
        listEl.style.display = 'none';
        return;
    }

    // Clear existing content
    listEl.innerHTML = '';

    // Render Profiles
    filteredProfiles.forEach((p, index) => {
        const item = document.createElement('div');
        item.className = 'mention-item';
        item.onmousedown = (e) => e.preventDefault();
        item.onclick = () => selectMentionCandidate(index, isThread, threadId);

        const avatarHtml = p.avatar_url
            ? `<img src="${p.avatar_url}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
            : (p.display_name || p.email)[0].toUpperCase();

        item.innerHTML = `
                    <div class="avatar">${avatarHtml}</div>
                        <div class="mention-info">
                            <span class="mention-name">${escapeHtml(p.display_name || 'No Name')}</span>
                            <span class="mention-email">${escapeHtml(p.email)}</span>
                        </div>
                `;
        listEl.appendChild(item);
    });

    // Render Tags
    const profileCount = filteredProfiles.length;
    filteredTags.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = 'mention-item';
        item.onmousedown = (e) => e.preventDefault();
        item.onclick = () => selectMentionCandidate(profileCount + i, isThread, threadId);
        item.innerHTML = `
                    <div class="avatar tag-avatar">#</div>
                        <div class="mention-info">
                            <span class="mention-name">${escapeHtml(t.name)}</span>
                            <span class="mention-email">タグ</span>
                        </div>
                `;
        listEl.appendChild(item);
    });

    listEl.style.display = 'block';

    currentMentionCandidates = [...filteredProfiles, ...filteredTags];
    mentionSelectedIndex = -1;
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

// --- Rich Text & File Attachment Helpers ---

let currentAttachments = [];
let replyAttachments = {}; // threadId -> [files]

// --- Thread Attachments ---

if (attachFileBtn) {
    attachFileBtn.onclick = () => fileInput.click();
}

if (fileInput) {
    fileInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        for (const file of files) {
            try {
                const uploaded = await uploadFile(file);
                if (uploaded) {
                    currentAttachments.push(uploaded);
                }
            } catch (err) {
                console.error(err);
                alert("アップロード失敗: " + file.name);
            }
        }
        renderAttachmentPreview();
        fileInput.value = ''; // Reset
    };
}

async function uploadFile(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt} `;
    const filePath = `${currentUser.id}/${fileName}`;

    const { data, error } = await supabaseClient.storage.from('uploads').upload(filePath, file);
    if (error) throw error;

    const { data: publicUrlData } = supabaseClient.storage.from('uploads').getPublicUrl(filePath);

    return {
        name: file.name,
        path: filePath,
        url: publicUrlData.publicUrl,
        type: file.type,
        size: file.size
    };
}

function renderAttachmentPreview() {
    if (!attachmentPreviewArea) return;
    attachmentPreviewArea.innerHTML = currentAttachments.map((att, index) => `
        <div class="attachment-item">
            ${att.type.startsWith('image/') ? `<img src="${att.url}">` : '<span class="file-icon">📄</span>'}
            <div class="attachment-remove" onclick="removeAttachment(${index})">×</div>
        </div>
    `).join('');
}

window.removeAttachment = function (index) {
    currentAttachments.splice(index, 1);
    renderAttachmentPreview();
};

// --- Reply Attachments ---

window.triggerReplyFile = function (threadId) {
    const inp = document.getElementById(`reply-file-${threadId}`);
    if (inp) inp.click();
};

window.handleReplyFileSelect = async function (inp, threadId) {
    const files = Array.from(inp.files);
    if (files.length === 0) return;

    if (!replyAttachments[threadId]) replyAttachments[threadId] = [];

    for (const file of files) {
        try {
            const uploaded = await uploadFile(file);
            if (uploaded) {
                replyAttachments[threadId].push(uploaded);
            }
        } catch (err) {
            console.error(err);
            alert("アップロード失敗: " + file.name);
        }
    }
    renderReplyAttachmentPreview(threadId);
    inp.value = '';
};

function renderReplyAttachmentPreview(threadId) {
    const area = document.getElementById(`reply-attachment-preview-${threadId}`);
    if (!area) return;
    const atts = replyAttachments[threadId] || [];
    area.innerHTML = atts.map((att, index) => `
        <div class="attachment-item">
            ${att.type.startsWith('image/') ? `<img src="${att.url}">` : '<span class="file-icon">📄</span>'}
            <div class="attachment-remove" onclick="removeReplyAttachment('${threadId}', ${index})">×</div>
        </div>
    `).join('');
}

window.removeReplyAttachment = function (threadId, index) {
    if (replyAttachments[threadId]) {
        replyAttachments[threadId].splice(index, 1);
        renderReplyAttachmentPreview(threadId);
    }
};

// --- Rich Text Logic ---

// New helper to handle selection by index
window.selectMentionCandidate = function (index, isThread, threadId) {
    if (index >= 0 && index < currentMentionCandidates.length) {
        const candidate = currentMentionCandidates[index];
        const name = candidate.display_name || candidate.email || candidate.name;
        insertMention(name, isThread, threadId);
    }
};

function insertMention(name, isThread, threadId = null) {
    const input = isThread ? newContentInp : document.getElementById(`reply-input-${threadId}`);
    if (!input) return;

    input.focus();

    // Unified contenteditable handling
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);

    const textNode = range.startContainer;
    if (textNode.nodeType === Node.TEXT_NODE) {
        const text = textNode.textContent;
        const cursor = range.startOffset;
        const lastAt = text.lastIndexOf('@', cursor - 1);

        if (lastAt !== -1) {
            const before = text.slice(0, lastAt);
            const after = text.slice(cursor);

            const beforeNode = document.createTextNode(before);
            const spacerNode = document.createTextNode('\u200B'); // Zero-width space for backspace handling
            const mentionSpan = document.createElement('span');
            mentionSpan.className = 'mention';
            mentionSpan.contentEditable = "false";
            mentionSpan.textContent = '@' + name;
            const spaceNode = document.createTextNode('\u00A0');
            const afterNode = document.createTextNode(after);

            const parent = textNode.parentNode;
            parent.insertBefore(beforeNode, textNode);
            parent.insertBefore(spacerNode, textNode); // Insert Zero-width space
            parent.insertBefore(mentionSpan, textNode);
            parent.insertBefore(spaceNode, textNode);
            parent.insertBefore(afterNode, textNode);
            parent.removeChild(textNode);

            const newRange = document.createRange();
            newRange.setStart(spaceNode, 1);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
        }
    } else {
        const spacerNode = document.createTextNode('\u200B');
        input.appendChild(spacerNode);
        const mentionSpan = document.createElement('span');
        mentionSpan.className = 'mention';
        mentionSpan.contentEditable = "false";
        mentionSpan.textContent = '@' + name;
        input.appendChild(mentionSpan);
        const spaceNode = document.createTextNode('\u00A0');
        input.appendChild(spaceNode);

        const newRange = document.createRange();
        newRange.setStart(spaceNode, 1);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
    }

    if (isThread) mentionListEl.style.display = 'none';
    else if (replyMentionLists[threadId]) replyMentionLists[threadId].style.display = 'none';
}

// Contenteditable Input Event
newContentInp.addEventListener('input', (e) => {
    // For contenteditable, we must find the cursor position in text nodes
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;

    // Check if we are in a text node
    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const cursor = range.startOffset;
        const lastAt = text.lastIndexOf('@', cursor - 1);

        // Simple check: @ exists and no spaces between @ and cursor
        if (lastAt !== -1 && !text.slice(lastAt, cursor).includes(' ')) {
            const query = text.slice(lastAt + 1, cursor);
            showMentionSuggestions(query, true);

            // Re-position mention list logic if needed (optional)
        } else {
            mentionListEl.style.display = 'none';
            mentionSelectedIndex = -1;
        }
    } else {
        mentionListEl.style.display = 'none';
    }
});

newContentInp.addEventListener('keydown', (e) => {
    handleMentionKeydown(e, true);
});

// Unified Reply Input handler (now contenteditable)
window.handleReplyInput = function (el, threadId) {
    // For contenteditable, check text node
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const cursor = range.startOffset;
        const lastAt = text.lastIndexOf('@', cursor - 1);

        if (lastAt !== -1 && !text.slice(lastAt, cursor).includes(' ')) {
            const query = text.slice(lastAt + 1, cursor);
            showMentionSuggestions(query, false, threadId);
        } else {
            if (replyMentionLists[threadId]) replyMentionLists[threadId].style.display = 'none';
            mentionSelectedIndex = -1;
        }
    } else {
        if (replyMentionLists[threadId]) replyMentionLists[threadId].style.display = 'none';
    }

    if (!el.hasMentionListener) {
        el.addEventListener('keydown', (e) => handleMentionKeydown(e, false, threadId));
        el.hasMentionListener = true;
    }
};

// Quick Reply Input Handler
window.handleQuickReplyInput = function (el, threadId) {
    const listKey = 'quick-' + threadId;

    // For contenteditable, check text node
    const selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        const cursor = range.startOffset;
        const lastAt = text.lastIndexOf('@', cursor - 1);

        if (lastAt !== -1 && !text.slice(lastAt, cursor).includes(' ')) {
            const query = text.slice(lastAt + 1, cursor);
            // Pass special key for lookup
            showMentionSuggestions(query, false, listKey);
        } else {
            if (replyMentionLists[listKey]) replyMentionLists[listKey].style.display = 'none';
            mentionSelectedIndex = -1;
        }
    } else {
        if (replyMentionLists[listKey]) replyMentionLists[listKey].style.display = 'none';
    }

    if (!el.hasMentionListener) {
        el.addEventListener('keydown', (e) => handleMentionKeydown(e, false, listKey));
        el.hasMentionListener = true;
    }
};

window.quickReply = async function (threadId) {
    const input = document.getElementById(`reply-input-quick-${threadId}`);
    if (!input) return;

    const content = input.innerText.trim(); // contenteditable text
    if (!content) return;

    // Use innerHTML to preserve mentions
    const htmlContent = input.innerHTML;

    if (currentProfile.role === 'Viewer') return alert("閲覧権限のみです");

    try {
        const { error } = await supabaseClient.from('replies').insert([{
            thread_id: threadId,
            content: htmlContent, // Send HTML for mentions
            author: currentProfile.display_name || currentUser.email,
            user_id: currentUser.id
        }]);

        if (error) throw error;

        input.innerHTML = '';
        const listKey = 'quick-' + threadId;
        if (replyMentionLists[listKey]) replyMentionLists[listKey].style.display = 'none';

        showToast('返信しました');
        // Refresh to show in main thread if visible + update counts
        loadData();

    } catch (e) {
        console.error(e);
        alert('返信失敗: ' + e.message);
    }
};



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
    if (adminModal) adminModal.style.display = 'none';
    if (teamModal) teamModal.style.display = 'none';
    if (teamManageModal) teamManageModal.style.display = 'none';
};

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
// --- Team Creation ---
window.openCreateTeamModal = function () {
    if (teamModal) {
        if (modalOverlay) modalOverlay.style.display = 'flex';
        // Hide other modals
        if (adminModal) adminModal.style.display = 'none';
        if (settingsModal) settingsModal.style.display = 'none';
        if (teamManageModal) teamManageModal.style.display = 'none';

        teamModal.style.display = 'block';
        if (newTeamNameInp) {
            newTeamNameInp.value = '';
            setTimeout(() => newTeamNameInp.focus(), 100);
        }
        if (newTeamMembersInput) newTeamMembersInput.value = '';
        if (newTeamMembersList) newTeamMembersList.innerHTML = '';
        selectedNewTeamMembers = [];
    }
};

window.openTeamConfigModal = function () {
    if (teamConfigModal) {
        if (modalOverlay) modalOverlay.style.display = 'flex';
        // Hide other modals
        if (adminModal) adminModal.style.display = 'none';
        if (settingsModal) settingsModal.style.display = 'none';
        if (teamManageModal) teamManageModal.style.display = 'none';
        if (teamModal) teamModal.style.display = 'none';

        teamConfigModal.style.display = 'block';

        // Load current team info
        if (currentTeamId) {
            const team = allTeams.find(t => t.id == currentTeamId);
            if (team) {
                if (editTeamNameInp) editTeamNameInp.value = team.name;
                if (editTeamIconPreview) {
                    if (team.avatar_url) {
                        editTeamIconPreview.innerHTML = `<img src="${team.avatar_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                    } else {
                        editTeamIconPreview.innerHTML = `<span style="font-size: 1.2rem;">${team.name[0].toUpperCase()}</span>`;
                    }
                }
            }
        }
    }
};

window.handleEditTeamIconSelect = function (input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            editTeamIconPreview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            saveTeamIconBtnReal.style.display = 'inline-block';
        }
        reader.readAsDataURL(input.files[0]);
    }
};

window.saveEditTeamIcon = async function () {
    if (!currentTeamId) return;
    const file = editTeamIconInput.files[0];
    if (!file) return;

    try {
        const reader = new FileReader();
        const base64 = await new Promise(resolve => {
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
        });

        const { error } = await supabaseClient.from('teams').update({ avatar_url: base64 }).eq('id', currentTeamId);
        if (error) throw error;

        // Update local state
        const team = allTeams.find(t => t.id == currentTeamId);
        if (team) team.avatar_url = base64;

        saveTeamIconBtnReal.style.display = 'none';
        alert('アイコンを更新しました');
        renderTeamsSidebar(); // Update sidebar icon
    } catch (e) {
        alert('アイコン更新エラー: ' + e.message);
    }
};

if (saveTeamNameBtn) {
    saveTeamNameBtn.onclick = async () => {
        if (!currentTeamId) return;
        const newName = editTeamNameInp.value.trim();
        if (!newName) return;

        const { error } = await supabaseClient.from('teams').update({ name: newName }).eq('id', currentTeamId);
        if (error) {
            alert('名前に変更失敗: ' + error.message);
        } else {
            const team = allTeams.find(t => t.id == currentTeamId);
            if (team) team.name = newName;
            renderTeamsSidebar();
            alert('チーム名を更新しました');
        }
    };
}

// --- New Team Member Selection Logic ---
if (newTeamMembersInput) {
    newTeamMembersInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        if (!query) {
            newTeamSuggestions.style.display = 'none';
            return;
        }

        const candidates = allProfiles.filter(p => {
            if (p.id === currentUser.id) return false; // Exclude self
            if (selectedNewTeamMembers.some(sel => sel.id === p.id)) return false; // Exclude already selected
            const name = (p.display_name || '').toLowerCase();
            const email = (p.email || '').toLowerCase();
            return name.includes(query) || email.includes(query);
        });

        newTeamSuggestions.innerHTML = '';
        candidates.forEach(p => {
            const div = document.createElement('div');
            div.className = 'mention-candidate';
            div.textContent = `${p.display_name || 'No Name'} (${p.email})`;
            div.onclick = () => {
                selectedNewTeamMembers.push(p);
                newTeamMembersInput.value = '';
                newTeamSuggestions.style.display = 'none';
                renderNewTeamSelection();
            };
            newTeamSuggestions.appendChild(div);
        });

        if (candidates.length > 0) {
            newTeamSuggestions.style.display = 'block';
        } else {
            newTeamSuggestions.style.display = 'none';
        }
    });

    // Hide suggestions on blur (delayed)
    newTeamMembersInput.addEventListener('blur', () => {
        setTimeout(() => newTeamSuggestions.style.display = 'none', 200);
    });
}

function renderNewTeamSelection() {
    if (!newTeamMembersList) return;
    newTeamMembersList.innerHTML = '';
    selectedNewTeamMembers.forEach((p, index) => {
        const tag = document.createElement('span');
        tag.className = 'tag-badge';
        tag.style.display = 'flex';
        tag.style.alignItems = 'center';
        tag.style.gap = '5px';
        tag.innerHTML = `
            ${p.display_name || p.email} 
            <span style="cursor:pointer; font-weight:bold;" onclick="removeNewTeamMember(${index})">×</span>
        `;
        newTeamMembersList.appendChild(tag);
    });
}

window.removeNewTeamMember = function (index) {
    selectedNewTeamMembers.splice(index, 1);
    renderNewTeamSelection();
};

if (btnAddTeam) {
    btnAddTeam.onclick = window.openCreateTeamModal;
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
        console.log("Switching to tab:", btn.dataset.tab);
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) {
            target.classList.add('active');
        } else {
            console.error("Tab target not found:", btn.dataset.tab);
        }
    };
});

if (addTagBtn) addTagBtn.onclick = window.addTag;

// --- Interaction Logic (Admin Btn) ---
// Defined after DOM elements are confirmed loaded
adminBtn.onclick = () => {
    modalOverlay.style.display = 'flex';
    adminModal.style.display = 'block';
    settingsModal.style.display = 'none';
    if (teamModal) teamModal.style.display = 'none';
    if (teamManageModal) teamManageModal.style.display = 'none';

    // Refresh admin data
    loadMasterData();
    fetchWhitelist();
};

// --- Expand/Collapse Content ---
// Defined at top but safety check here
if (!window.toggleExpand) {
    window.toggleExpand = function (id) {
        const content = document.getElementById('expand-' + id);
        const btn = document.getElementById('btn-' + id);
        if (!content || !btn) return;

        if (content.classList.contains('is-expanded')) {
            content.classList.remove('is-expanded');
            btn.textContent = '詳細を表示';
        } else {
            content.classList.add('is-expanded');
            btn.textContent = '表示を閉じる';
        }
    };
}

// --- Initialization ---

// リアルタイムで認証状態を監視 (OAuthリダイレクト後の自動ログイン用)
supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
        fetchProfile(session.user);
    } else if (event === 'SIGNED_OUT') {
        showAuth();
    }
});

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

// --- Team Action (Repost / Move) Functionality ---
let teamActionThreadId = null;
let teamactionMode = 'repost'; // 'repost' or 'move'

window.openTeamSelectModal = async (threadId, mode) => {
    teamActionThreadId = threadId;
    teamactionMode = mode;

    const modal = document.getElementById('team-select-modal');
    const title = document.getElementById('team-select-title');
    const btn = document.getElementById('execute-team-action-btn');
    const select = document.getElementById('team-select-input');

    title.textContent = mode === 'repost' ? '別チームへ再投稿' : 'チーム移動';
    btn.textContent = mode === 'repost' ? '投稿する' : '移動する';

    // Populate teams excluding current
    select.innerHTML = '<option disabled selected>読み込み中...</option>';

    try {
        // Fetch ALL teams for Admin/Manager
        const { data: teams, error } = await supabaseClient.from('teams').select('*').order('name');

        if (error) {
            console.error('Failed to fetch teams:', error);
            // Fallback to local
            renderTeamOptions(allTeams || []);
            return;
        }

        renderTeamOptions(teams || []);
    } catch (e) {
        console.error(e);
        // Fallback
        renderTeamOptions(allTeams || []);
    }

    function renderTeamOptions(teamList) {
        const filtered = teamList.filter(t => String(t.id) !== String(currentTeamId));

        if (filtered.length === 0) {
            select.innerHTML = '<option disabled selected>他に選択可能なチームがありません</option>';
            // 不要なトーストは出さず、UI上でわかるようにする
            return;
        }

        select.innerHTML = filtered
            .map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`)
            .join('');
    }

    // Modal show
    modal.classList.add('active');
    renderAdminUsers(); // Initial load
};

window.showAdminTab = (tab) => {
    document.getElementById('modal-overlay').classList.add('active');
};

document.getElementById('execute-team-action-btn').addEventListener('click', async () => {
    if (!teamActionThreadId) return;
    const targetTeamId = document.getElementById('team-select-input').value;
    if (!targetTeamId) return;

    try {
        if (teamactionMode === 'repost') {
            // Fetch source
            const { data: source } = await supabaseClient.from('threads').select('*').eq('id', teamActionThreadId).single();
            if (!source) throw new Error('投稿が見つかりません');

            // Insert new
            const { error } = await supabaseClient.from('threads').insert({
                team_id: targetTeamId,
                title: source.title,
                content: source.content,
                author: currentProfile.id, // Current user becomes author of repost
                author_name: currentProfile.display_name || currentProfile.email,
                attachments: source.attachments || [],
                status: 'pending',
                created_at: new Date().toISOString()
            });
            if (error) throw error;
            showToast('別チームへ投稿しました');

        } else if (teamactionMode === 'move') {
            // Update team_id
            const { error } = await supabaseClient.from('threads')
                .update({ team_id: targetTeamId })
                .eq('id', teamActionThreadId);

            if (error) throw error;
            showToast('チームを移動しました');

            // Update local list correctly (Optimistic-ish)
            const thread = threads.find(t => String(t.id) === String(teamActionThreadId));
            if (thread) {
                thread.team_id = targetTeamId;
            }
            renderThreads();
        }

        closeModals();
    } catch (e) {
        console.error(e);
        showToast('操作に失敗しました: ' + e.message, 'error');
    }
});

// Direct Move Function (from Submenu)
window.moveThreadDirectly = async (threadId, targetTeamId) => {
    if (!threadId || !targetTeamId) return;

    // Close dot menu (handled by clicking outside usually, but force close UI logic if needed)
    // Actually clicking an item closes the menu because of re-render or event bubbling catch.

    try {
        const { error } = await supabaseClient.from('threads')
            .update({ team_id: targetTeamId })
            .eq('id', threadId);

        if (error) throw error;
        showToast('チームを移動しました');

        // Optimistic UI update
        const thread = threads.find(t => String(t.id) === String(threadId));
        if (thread) {
            thread.team_id = targetTeamId;
        }
        renderThreads();
    } catch (e) {
        console.error(e);
        showToast('チーム移動に失敗しました: ' + e.message, 'error');
    }
};

// --- Admin User Edit Functionality ---
window.openEditUserNameModal = (userId, currentName) => {
    document.getElementById('admin-edit-user-id').value = userId;
    document.getElementById('admin-edit-display-name').value = currentName;

    document.getElementById('admin-user-edit-modal').classList.add('active');
    document.getElementById('modal-overlay').classList.add('active');
    document.getElementById('admin-modal').classList.remove('active'); // Temporarily hide admin list
};

document.getElementById('save-admin-user-edit-btn').addEventListener('click', async () => {
    const userId = document.getElementById('admin-edit-user-id').value;
    const newName = document.getElementById('admin-edit-display-name').value.trim();

    if (!newName) return;

    try {
        const { error } = await supabaseClient
            .from('profiles')
            .update({ display_name: newName })
            .eq('id', userId);

        if (error) throw error;

        // --- Retroactive Update for Threads and Replies ---
        // Update all threads by this user
        /* Using user_id if available, otherwise relying on profile link which is better, 
           but here we need to update the denormalized 'author' column if it exists. 
           (Assuming threads.author is the display name string) */

        // Parallel update: threads & replies
        await Promise.all([
            supabaseClient.from('threads').update({ author: newName }).eq('user_id', userId),
            supabaseClient.from('replies').update({ author: newName }).eq('user_id', userId)
        ]);

        showToast('表示名を変更し、過去の投稿にも反映しました');
        logAudit('UPDATE_USER_NAME', { user_id: userId, new_name: newName }, userId);

        // Update local state
        const p = allProfiles.find(x => x.id === userId);
        if (p) p.display_name = newName;

        renderAdminUsers(); // Refresh admin list

        document.getElementById('admin-user-edit-modal').classList.remove('active');
        document.getElementById('modal-overlay').classList.remove('active');
        document.getElementById('admin-modal').classList.add('active'); // Re-open admin list

        // Refresh threads to show new names
        fetchThreads();

    } catch (e) {
        console.error(e);
        alert('更新失敗: ' + e.message);
    }
});

// --- Team Icon Management ---
window.handleTeamIconSelect = (input) => {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.getElementById('team-icon-preview');
            preview.innerHTML = `<img src="${e.target.result}" style="width: 100%; height: 100%; object-fit: cover;">`;
            document.getElementById('save-team-icon-btn').style.display = 'inline-block';
        };
        reader.readAsDataURL(file);
    }
};

window.saveTeamIcon = async () => {
    const input = document.getElementById('team-icon-input');
    const file = input.files[0];
    if (!file || !currentTeamId) return;

    try {
        // Use Base64 for team icon (requires DB column to be TEXT, not VARCHAR)
        // This avoids Storage RLS issues entirely.
        const reader = new FileReader();
        const base64Url = await new Promise(resolve => {
            reader.onload = e => resolve(e.target.result);
            reader.readAsDataURL(file);
        });

        // Update DB
        const { error: updateError, count } = await supabaseClient
            .from('teams')
            .update({ avatar_url: base64Url }, { count: 'exact' }) // Request count
            .eq('id', currentTeamId)
            .select(); // Select to ensure count is returned implies return data too

        if (updateError) throw updateError;

        // Check for Silent RLS Failure
        if (count === 0) {
            alert("【権限エラー】チーム情報の更新が許可されていません（RLSポリシー）。\nSupabaseで `teams` テーブルのUPDATEポリシーを確認してください。\n(Admin権限でも所有者でないと更新できない設定になっている可能性があります)");
            return;
        }

        // VERIFY DB PERSISTENCE

        // VERIFY DB PERSISTENCE
        // Fetch the row back to see if it was truncated or rejected
        const { data: verifyData } = await supabaseClient
            .from('teams')
            .select('avatar_url')
            .eq('id', currentTeamId)
            .single();

        if (!verifyData || !verifyData.avatar_url || verifyData.avatar_url.length < 100) {
            alert("【重要】データベース側の文字数制限により、画像が保存されませんでした。\n以前お伝えしたSQLコマンド（ALTER TABLE...）を実行してください。");
            return;
        }

        // Force cache update
        globalAvatarVersion = Date.now();

        // Update local state immediately
        const team = allTeams.find(t => String(t.id) === String(currentTeamId));
        if (team) {
            team.avatar_url = base64Url;
        }

        // Refresh Sidebar
        renderTeamsSidebar();

        alert('チームアイコンを更新しました');
        const saveBtn = document.getElementById('save-team-icon-btn');
        if (saveBtn) saveBtn.style.display = 'none';

        // Refresh teams list
        await loadMasterData();
        await fetchTeams(); // Refresh sidebar icons
    } catch (e) {
        console.error('Error saving team icon:', e);
        showToast('チームアイコンの更新に失敗しました: ' + e.message, 'error');
    }
};

// Sidebar Interaction Logic (Robust Initialization)
function initSidebarInteraction() {
    const sidebar = document.getElementById('teams-sidebar');
    if (!sidebar) {
        // Retry if not found yet
        console.warn('Sidebar not found, retrying in 100ms...');
        setTimeout(initSidebarInteraction, 100);
        return;
    }

    // Prevent double binding
    if (sidebar.dataset.jsInitialized) return;
    sidebar.dataset.jsInitialized = "true";

    sidebar.addEventListener('mouseenter', () => {
        sidebar.classList.add('expanded');
    });
    sidebar.addEventListener('mouseleave', () => {
        sidebar.classList.remove('expanded');
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSidebarInteraction);
} else {
    initSidebarInteraction(); // Already ready
}

// --- Audit Log Helper ---
async function logAudit(action, details, targetId) {
    if (!currentUser) return;
    try {
        await supabaseClient.from('audit_logs').insert([{
            user_id: currentUser.id,
            action: action,
            details: typeof details === 'object' ? JSON.stringify(details) : details,
            target_id: targetId,
            created_at: new Date().toISOString()
        }]);
    } catch (e) {
        console.warn('Audit log failed:', e); // Non-blocking
    }
}

// Start initialization
checkUser();
