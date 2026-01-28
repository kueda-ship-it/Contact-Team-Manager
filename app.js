(() => {
    const STORAGE_KEY = "face_app_hybrid_v2";
    const $ = (s) => document.querySelector(s);
    const $All = (s) => document.querySelectorAll(s);

    const WORK_ITEMS = [
        "交換前カメラ情報のバックアップ", "交換前カメラの取付状態確認", "交換前カメラの映像取得",
        "kaoato バックアップ登録", "カメラ交換及び取付後の撮影",
        "エクスプレスサーバー交換および設定", "カメラテスト",
        "登録テスト（F-aceIDマスタ更新）", "各ゲート認証テスト"
    ];

    let locations = [];
    let currentUser = null;

    function checkAuth() {
        const userStr = localStorage.getItem("face_current_user");
        if (!userStr) {
            location.href = "login.html";
            return;
        }
        currentUser = JSON.parse(userStr);
        const infoEl = $("#userInfo");
        if (infoEl) infoEl.textContent = `${currentUser.name} (${currentUser.role})`;

        // マスタ管理リンクの表示制御
        const masterLink = $("#masterLink");
        if (masterLink && (currentUser.role === 'master' || currentUser.role === 'Manager')) {
            masterLink.style.display = "inline";
        }
    }

    window.logout = () => {
        localStorage.removeItem("face_current_user");
        location.href = "login.html";
    };

    function init() {
        checkAuth();
        renderUIWorkStatus();
        renderUIPanels();
        setupSync();
        loadLocal();
        updateReportFromUI();

        // カメラ個数入力の同期監視
        const cntCam = $("[name='cnt_camera']");
        if (cntCam) {
            cntCam.addEventListener("input", (e) => {
                const n = parseInt(e.target.value) || 0;
                syncCameraSettings(n);
                saveLocal();
            });
        }

        // 初期ロード時に色を適用
        setTimeout(() => {
            WORK_ITEMS.forEach((_, i) => {
                const el = document.querySelector(`[name="ws_status_${i + 1}"]`);
                if (el) updateRowColor(i + 1, el.value);
            });
        }, 500);
    }

    // 1. 三位一体の同期（Camera個数 -> 設置場所 -> 管理パネル）
    function syncCameraSettings(n) {
        if (n < 0) n = 0;
        if (n > 20) n = 20;

        if (locations.length !== n) {
            if (locations.length < n) {
                for (let i = locations.length; i < n; i++) {
                    const defaultName = (i === 0) ? "ロッカー" : `設置場所${i + 1}`;
                    locations.push({ id: cryptoId(), name: defaultName });
                }
            } else {
                locations = locations.slice(0, n);
            }
        }

        // 1台目を常に「ロッカー」に固定（ユーザーが書き換えても初期化時等に補正）
        if (locations.length > 0 && locations[0].name !== "ロッカー") {
            if (locations[0].name.startsWith("設置場所") || !locations[0].name) {
                locations[0].name = "ロッカー";
            }
        }

        renderAll();
    }

    function renderAll() {
        renderUILocations();
        renderUIPanels();
        updateWorkerOptions();
        updateReportFromUI();
    }

    function renderUIWorkStatus() {
        const body = $("#uiWorkStatusBody");
        const pBody = $("#pWorkStatusBody");
        if (!body || !pBody) return;

        body.innerHTML = WORK_ITEMS.map((text, i) => `
            <tr id="ws_row_${i + 1}">
                <td>${i + 1}</td>
                <td style="font-weight:bold;">${text}</td>
                <td><input type="datetime-local" name="ws_time_${i + 1}" data-sync="ws_time_${i + 1}" onchange="updateEndTime(${i + 1})"></td>
                <td><input type="number" name="ws_dur_${i + 1}" data-sync="ws_dur_${i + 1}" style="width:60px;" oninput="updateEndTime(${i + 1})"></td>
                <td><input type="text" name="ws_end_${i + 1}" data-sync="ws_end_${i + 1}" readonly placeholder="自動計算" style="background:#eee;"></td>
                <td><select name="ws_person_${i + 1}" class="worker-dropdown" data-sync="ws_person_${i + 1}"><option value="">(選択)</option></select></td>
                <td><select name="ws_status_${i + 1}" data-sync="ws_status_${i + 1}" onchange="updateRowColor(${i + 1}, this.value)"><option value="未">未</option><option value="済">済</option><option value="無">無</option></select></td>
                <td><input type="text" name="ws_note_${i + 1}" data-sync="ws_note_${i + 1}" placeholder="備考"></td>
            </tr>
        `).join("");

        pBody.innerHTML = WORK_ITEMS.map((text, i) => `
            <tr>
                <td>${i + 1}</td>
                <td style="font-size:8pt;">${text}</td>
                <td></td>
                <td id="p_ws_time_${i + 1}"></td>
                <td id="p_ws_dur_${i + 1}" style="text-align:center;"></td>
                <td id="p_ws_end_${i + 1}"></td>
                <td id="p_ws_person_${i + 1}"></td>
                <td id="p_ws_status_${i + 1}" style="text-align:center;"></td>
                <td id="p_ws_note_${i + 1}"></td>
            </tr>
        `).join("");
    }

    window.updateRowColor = (id, status) => {
        const row = document.getElementById(`ws_row_${id}`);
        if (row) {
            if (status === "済") {
                row.classList.add("status-completed");
            } else {
                row.classList.remove("status-completed");
            }
        }
    };

    window.updateEndTime = (id) => {
        const timeVal = $(`[name="ws_time_${id}"]`).value;
        const durVal = parseInt($(`[name="ws_dur_${id}"]`).value) || 0;
        const endInp = $(`[name="ws_end_${id}"]`);

        if (timeVal && durVal > 0) {
            const start = new Date(timeVal);
            const end = new Date(start.getTime() + durVal * 60000);

            // フォーマット YYYY-MM-DD HH:mm → PDF用には短く MM-DD HH:mm
            const endStr = `${(end.getMonth() + 1).toString().padStart(2, '0')}-${end.getDate().toString().padStart(2, '0')} ${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`;
            endInp.value = endStr;
            syncField(endInp);
        } else {
            endInp.value = "";
            syncField(endInp);
        }
        saveLocal();
    };

    window.updateWorkerOptions = () => {
        const confirmator = $("#ui_confirmator").value;
        const w1 = $("[name='worker1']").value;
        const w2 = $("[name='worker2']").value;
        const w3 = $("[name='worker3']").value;
        const w4 = $("[name='worker4']").value;
        const names = [confirmator, w1, w2, w3, w4].filter(n => n.trim() !== "");
        $All(".worker-dropdown").forEach(dd => {
            const cur = dd.value;
            dd.innerHTML = `<option value="">(選択)</option>` + names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
            if (names.includes(cur)) dd.value = cur;
        });
    };

    function renderUILocations() {
        const list = $("#locationList");
        if (!list) return;
        list.innerHTML = locations.map((loc, i) => `
            <div class="loc-ui-row" style="display:flex; gap:10px; align-items:center; margin-bottom:8px;">
                <div style="font-size: 12px; color: #666; width: 25px;">${i + 1}.</div>
                <input type="text" value="${escapeHtml(loc.name)}" 
                    oninput="updateLocationName('${loc.id}', this.value)" 
                    style="flex:1; ${i === 0 ? 'background:#f1f5f9; color:#64748b; cursor:not-allowed;' : ''}" 
                    ${i === 0 ? 'readonly' : ''}
                    placeholder="場所名を入力">
                <div style="font-size: 10px; color: #999;">${i === 0 ? '(固定項目)' : '(カメラ台数と連動しています)'}</div>
            </div>
        `).join("");
    }

    window.updateLocationName = (id, val) => {
        const loc = locations.find(l => l.id === id);
        if (loc) {
            loc.name = val;
            const idx = locations.indexOf(loc) + 1;
            // 管理パネルのタイトルを更新
            const title = document.querySelector(`#cam_title_${idx}`);
            if (title) title.textContent = `カメラ #${idx}：${val}`;
            // 印刷用レポートのタイトルを更新
            setText(`p_cam_loc_${idx}_f`, val);
            saveLocal();
        }
    };

    function renderUIPanels() {
        const panels = $("#uiCameraPanels");
        const pPages = $("#pCameraPages");
        if (!panels || !pPages) return;

        panels.innerHTML = "";
        pPages.innerHTML = "";

        locations.forEach((loc, idx) => {
            const i = idx + 1;
            // UI管理カード
            const card = document.createElement("div");
            card.className = "camera-card";
            card.innerHTML = `
                <div id="cam_title_${i}" class="card-title-row" style="font-size:14px; color:var(--primary);">カメラ #${i}：${escapeHtml(loc.name)}</div>
                <div class="ui-photo-box">
                    ${createUISlot(i, 'ftg_pre', '映像(前)')}
                    ${createUISlot(i, 'ftg_day', '映像(昼)')}
                    ${createUISlot(i, 'ftg_night', '映像(夜)')}
                    ${createUISlot(i, 'repl_pre', '交換前')}
                    ${createUISlot(i, 'repl_post', '交換後')}
                </div>
                <div class="field-row mt-10">
                    <div class="field-col" style="flex:1"><label>品質</label><select name="cam_q_${i}" data-sync="cam_q_${i}"><option value="-">-</option><option value="良好">良好</option><option value="不良">不良</option></select></div>
                    <div class="field-col" style="flex:1"><label>接続</label><select name="cam_c_${i}" data-sync="cam_c_${i}"><option value="-">-</option><option value="OK">OK</option><option value="NG">NG</option></select></div>
                </div>
            `;
            panels.appendChild(card);

            // Report: 1カメラにつき4枚 (映像夜は印刷対象外)
            if ((i - 1) % 3 === 0) {
                const page = document.createElement("article");
                page.className = "report-page";
                page.innerHTML = `<h2 class="blue-bar">■ カメラ交換・映像記録 (Page ${Math.ceil(i / 3)})</h2><div class="p-page-container"></div>`;
                pPages.appendChild(page);
            }
            const pageContainer = pPages.lastElementChild.querySelector(".p-page-container");
            const camBlock = document.createElement("div");
            camBlock.className = "p-cam-block";
            camBlock.innerHTML = `
                <div class="p-cam-block-title">カメラ #${i}：<span id="p_cam_loc_${i}_f">${escapeHtml(loc.name)}</span></div>
                <div class="p-photo-grid-2">
                    <div class="p-photo-slot"><div class="p-slot-header">交換前（基板）</div><div class="p-img-area" id="p_cam_img_${i}_repl_pre"></div></div>
                    <div class="p-photo-slot"><div class="p-slot-header">交換後（基板）</div><div class="p-img-area" id="p_cam_img_${i}_repl_post"></div></div>
                </div>
                <div class="p-footage-details">
                    品質判定: <span id="p_cam_q_${i}"></span> ／ 接続確認: <span id="p_cam_c_${i}"></span>
                </div>
            `;
            pageContainer.appendChild(camBlock);
        });
    }

    function createUISlot(idx, type, lbl) {
        const id = `cam_${idx}_${type}`;
        return `<div class="ui-photo-slot" onclick="clickInp('${id}')" id="ui_preview_${id}"><div class="slot-label">${lbl}</div><input type="file" id="file_${id}" data-cam="${idx}" data-type="${type}" style="display:none;" onchange="handleUIImg(this)"></div>`;
    }

    // --- Core Sync ---
    function setupSync() {
        document.body.addEventListener("input", (e) => { if (e.target.dataset.sync) { syncField(e.target); saveLocal(); } });
        document.body.addEventListener("change", (e) => { if (e.target.dataset.sync) { syncField(e.target); saveLocal(); } });
    }

    function syncField(el) {
        const key = el.dataset.sync, val = el.value;
        if (key.startsWith('ws_time_')) {
            setText(`p_${key}`, val ? val.replace(/.*-(\d\d-\d\dT\d\d:\d\d)/, '$1').replace('T', ' ') : "");
        } else if (key.startsWith('ws_end_')) {
            // 文字列そのまま（すでにフォーマット済み想定）
            setText(`p_${key}`, val);
        } else {
            setText(`p_${key}`, val);
        }
    }

    function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ""; }

    // --- Image Handling ---
    function commonProcessImage(file, input) {
        if (!file) return;
        const url = URL.createObjectURL(file);
        const uiSlotId = input.id.replace('file_', 'ui_preview_');
        const uiSlot = document.getElementById(uiSlotId);
        if (uiSlot) {
            let img = uiSlot.querySelector("img");
            if (!img) { img = document.createElement("img"); uiSlot.appendChild(img); }
            img.src = url;
            uiSlot.classList.add("has-image");
        }

        // PDF Sync
        const cam = input.dataset.cam;
        const type = input.dataset.type;
        if (cam) {
            // 映像（前・昼・夜）はPDFに出力しない
            if (type === 'ftg_pre' || type === 'ftg_day' || type === 'ftg_night') return;
            const pSlot = $(`#p_cam_img_${cam}_${type}`);
            if (pSlot) pSlot.innerHTML = `<img src="${url}">`;
        } else {
            const name = input.name;
            const pSlot = $(`#p_${name}`);
            if (pSlot) pSlot.innerHTML = `<img src="${url}">`;
        }
        saveLocal();
    }

    window.clickInp = (id) => $(`#file_${id}`).click();
    window.handleUIImg = (input) => commonProcessImage(input.files[0], input);
    window.handleServerImg = (input) => commonProcessImage(input.files[0], input);

    // Global Drag & Drop for .ui-photo-slot
    document.addEventListener("dragover", e => {
        const slot = e.target.closest(".ui-photo-slot");
        if (slot) {
            e.preventDefault();
            slot.classList.add("drag-over");
        }
    });
    document.addEventListener("dragleave", e => {
        const slot = e.target.closest(".ui-photo-slot");
        if (slot) slot.classList.remove("drag-over");
    });
    document.addEventListener("drop", e => {
        const slot = e.target.closest(".ui-photo-slot");
        if (slot) {
            e.preventDefault();
            slot.classList.remove("drag-over");
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith("image/")) {
                const input = slot.querySelector('input[type="file"]');
                if (input) commonProcessImage(file, input);
            }
        }
    });

    // --- Persistence ---
    window.saveLocal = () => {
        const data = { l: locations };
        document.querySelectorAll("#edit-ui input,#edit-ui textarea,#edit-ui select").forEach(el => { if (el.name) { if (el.type === "checkbox") data[el.name] = el.checked; else if (el.type === "radio") { if (el.checked) data[el.name] = el.value; } else if (el.type !== "file") data[el.name] = el.value; } });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    };

    function loadLocal() {
        const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
        const data = JSON.parse(raw);
        if (data.l) { locations = data.l; renderAll(); }
        Object.entries(data).forEach(([k, v]) => {
            const el = document.querySelector(`[name="${k}"]`);
            if (el) {
                if (el.type === "checkbox") el.checked = !!v;
                else if (el.type !== "file") el.value = v;
                if (el.dataset.sync) syncField(el);
                if (k.startsWith("ws_status_")) {
                    const id = k.replace("ws_status_", "");
                    updateRowColor(id, v);
                }
            }
        });
    }

    function updateReportFromUI() { $All('[data-sync]').forEach(el => syncField(el)); }
    function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function cryptoId() { return Math.random().toString(36).substring(2, 10); }

    window.saveReport = async () => {
        const data = {
            id: $("[name='ui_managementId']").value || cryptoId(),
            updatedAt: new Date().toISOString(),
            l: locations
        };
        document.querySelectorAll("#edit-ui input,#edit-ui textarea,#edit-ui select").forEach(el => {
            if (el.name) {
                if (el.type === "checkbox") data[el.name] = el.checked;
                else if (el.type === "radio") { if (el.checked) data[el.name] = el.value; }
                else if (el.type !== "file") data[el.name] = el.value;
            }
        });

        try {
            const res = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) alert("サーバーに保存しました。");
            else alert("保存に失敗しました。");
        } catch (err) {
            alert("通信エラーが発生しました。");
        }
    };

    window.openReportsList = async () => {
        const dialog = $("#reportsListDialog");
        const body = $("#reportsListBody");
        if (!dialog || !body) return;

        try {
            const res = await fetch('/api/reports');
            const reports = await res.json();
            body.innerHTML = reports.map(r => `
                <tr>
                    <td>${escapeHtml(r.ui_propertyName || "無題")}</td>
                    <td>${escapeHtml(r.id)}</td>
                    <td>${escapeHtml(r.ui_workDateStart_jp || "")}</td>
                    <td>${new Date(r.updatedAt).toLocaleString()}</td>
                    <td>
                        <button type="button" onclick="loadReportFromServer('${r.id}')">開く</button>
                        <button type="button" class="danger-btn" onclick="deleteReport('${r.id}')">削除</button>
                    </td>
                </tr>
            `).join("");
            dialog.showModal();
        } catch (err) {
            alert("一覧の取得に失敗しました。");
        }
    };

    window.loadReportFromServer = async (id) => {
        try {
            const res = await fetch('/api/reports');
            const reports = await res.json();
            const data = reports.find(r => r.id === id);
            if (data) {
                populateData(data);
                $("#reportsListDialog").close();
            }
        } catch (err) { alert("読み込みに失敗しました。"); }
    };

    window.deleteReport = async (id) => {
        if (!confirm("このレポートを削除しますか？")) return;
        try {
            const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
            if (res.ok) openReportsList();
        } catch (err) { alert("削除に失敗しました。"); }
    };

    function populateData(data) {
        if (data.l) { locations = data.l; renderAll(); }
        Object.entries(data).forEach(([k, v]) => {
            const el = document.querySelector(`[name="${k}"]`);
            if (el) {
                if (el.type === "checkbox") el.checked = !!v;
                else if (el.type !== "file") el.value = v;
                if (el.dataset.sync) syncField(el);
                if (k.startsWith("ws_status_")) {
                    const id = k.replace("ws_status_", "");
                    updateRowColor(id, v);
                }
            }
        });
    }

    window.newReport = () => { if (confirm("リセットしますか？")) { localStorage.removeItem(STORAGE_KEY); location.reload(); } };

    document.addEventListener("DOMContentLoaded", init);
})();
