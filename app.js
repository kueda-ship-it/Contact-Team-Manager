(() => {
    const STORAGE_KEY = "camera_checklist_csv_settings_v2";
    const REPORTS_KEY = "camera_checklist_reports_v1";
    const USERS_KEY = "face_users";
    const CURRENT_USER_KEY = "face_current_user";

    const $ = (s) => document.querySelector(s);
    let currentReportId = null;
    let locations = [];
    let currentUser = null;

    const COMMON_ITEMS = [
        "backup（旧サーバー）",
        "旧サーバー・PoE HUB・UPS交換（写真必須）",
        "IresのID削除",
        "カメラテスト",
        "各ゲート認証テスト",
        "ロッカー動作確認",
        "最終養生確認"
    ];

    // --- Auth Logic ---
    async function initAuth() {
        currentUser = JSON.parse(localStorage.getItem(CURRENT_USER_KEY));
        if (!currentUser) {
            showLoginOverlay();
        } else {
            // セッション有効チェック（オプションでサーバーに問い合わせても良い）
            renderUIByRole();
        }
    }

    function showLoginOverlay() {
        let overlay = $("#authOverlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "authOverlay";
            overlay.innerHTML = `
                <div class="auth-card">
                    <h2 style="margin-bottom: 20px; text-align: center;">F-ace ログイン</h2>
                    <div class="field"><label>ユーザーID</label><input type="text" id="loginId" placeholder="IDを入力"></div>
                    <div class="field" style="margin-top: 10px;"><label>パスワード</label><input type="password" id="loginPw" placeholder="パスワードを入力"></div>
                    <div id="loginError" style="color: var(--danger); font-size: 12px; margin-top: 10px; display: none;">IDまたはパスワードが違います</div>
                    <button type="button" class="primary" id="loginBtn" style="margin-top: 20px; width: 100%; justify-content: center;">ログイン</button>
                    <div class="muted" style="font-size: 10px; margin-top: 15px; border-top: 1px solid #eee; pt: 10px;">
                        初期ID/PW例:<br>admin / admin123 (master)<br>user / user123 (user)
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            $("#loginBtn").onclick = login;
            $("#loginPw").onkeydown = (e) => { if (e.key === "Enter") login(); };
        }
        overlay.style.display = "flex";
    }

    async function login() {
        const id = $("#loginId").value;
        const pw = $("#loginPw").value;
        if (!id || !pw) {
            alert("IDとパスワードを入力してください。");
            return;
        }

        try {
            const response = await fetch('/api/users');
            const users = await response.json();
            const user = users.find(u => u.id === id && u.pw === pw);

            if (user) {
                localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
                location.reload();
            } else {
                $("#loginError").style.display = "block";
            }
        } catch (err) {
            alert("認証サーバーに接続できません。");
        }
    }

    window.logout = () => {
        localStorage.removeItem(CURRENT_USER_KEY);
        location.reload();
    };

    function renderUIByRole() {
        if (!currentUser) return;

        let nav = $(".nav-container");
        if (!nav) {
            nav = document.createElement("div");
            nav.className = "nav-container section";
            nav.style.display = "flex";
            nav.style.justifyContent = "space-between";
            nav.style.alignItems = "center";
            nav.style.padding = "10px 20px";
            nav.innerHTML = `
                <div class="user-info">ログイン中: <strong>${currentUser.name}</strong> (${currentUser.role})</div>
                <div class="nav-links" style="display: flex; gap: 20px; align-items: center;">
                    ${(currentUser.role === 'master' || currentUser.role === 'Manager') ? '<a href="master.html" class="nav-link">マスタ管理</a>' : ''}
                    <button type="button" onclick="logout()" class="danger" style="padding: 4px 12px; font-size: 12px;">ログアウト</button>
                </div>
            `;
            document.body.insertBefore(nav, document.body.firstChild);
        }

        if (currentUser.role === 'viewer') {
            document.querySelectorAll("input, textarea, select, button:not(.primary)").forEach(el => {
                if (el.textContent !== "ログアウト" && !el.closest(".nav-container")) {
                    el.disabled = true;
                    if (el.tagName === "BUTTON") el.style.display = "none";
                }
            });
            const printBtn = document.querySelector("button.primary[onclick*='print']");
            if (printBtn) {
                printBtn.disabled = false;
                printBtn.style.display = "flex";
            }
        }
    }

    // --- Validation & Linking ---
    function validateForm() {
        const errors = [];
        const required = [
            "constructionName", "managementId", "propertyName",
            "workDateStart", "workDateEnd", "confirmator"
        ];

        required.forEach(name => {
            const el = getEl(name);
            if (!el || !String(el.value).trim()) {
                el?.classList.add("invalid");
                errors.push(name);
            } else {
                el?.classList.remove("invalid");
            }
        });

        // 部品チェック時の個数
        ["express", "camera", "ups", "hub"].forEach(p => {
            const chk = $(`[name="part_${p}"]`);
            const cnt = $(`[name="cnt_${p}"]`);
            if (chk && chk.checked) {
                if (!cnt.value || parseInt(cnt.value) <= 0) {
                    cnt.classList.add("invalid");
                    errors.push(`cnt_${p}`);
                } else {
                    cnt.classList.remove("invalid");
                }
            } else if (cnt) {
                cnt.classList.remove("invalid");
            }
        });

        if (locations.length === 0) {
            errors.push("locations");
            alert("設置場所を1つ以上登録してください。");
            return false;
        }

        // Camera確認チェック
        locations.forEach(loc => {
            const rid = `cam_${loc.id}`;
            const chk = getEl(`${rid}_check`);
            if (chk && !chk.checked && currentUser.role !== 'viewer') {
                chk.closest("td").style.backgroundColor = "rgba(255, 59, 48, 0.1)";
                errors.push(`${rid}_check`);
            } else if (chk) {
                chk.closest("td").style.backgroundColor = "";
            }
        });

        // 共通項目チェック
        COMMON_ITEMS.forEach((_, i) => {
            const n = i + 1;
            const chk = getEl(`common_check_${n}`);
            const isItem2 = (n === 2);
            const needsPartCheck = isItem2 && ($(`[name="part_ups"]`).checked || $(`[name="part_hub"]`).checked);

            if (chk && !chk.checked && currentUser.role !== 'viewer') {
                if (!isItem2 || needsPartCheck) {
                    chk.closest("td").style.backgroundColor = "rgba(255, 59, 48, 0.1)";
                    errors.push(`common_check_${n}`);
                }
            } else if (chk) {
                chk.closest("td").style.backgroundColor = "";
            }
        });

        return errors.length === 0;
    }

    function updatePartLinking() {
        const ups = $(`[name="part_ups"]`)?.checked;
        const hub = $(`[name="part_hub"]`)?.checked;
        const item2Row = document.querySelector("#commonBody tr:nth-child(2)");
        if (!item2Row) return;

        const labelCell = item2Row.querySelector("td:nth-child(2)");
        if (ups || hub) {
            item2Row.classList.add("highlight-warning");
            labelCell.innerHTML = `旧サーバー・PoE HUB・UPS交換 <span class="pill" style="background:var(--danger)">確認必須</span>`;
        } else {
            item2Row.classList.remove("highlight-warning");
            labelCell.textContent = "旧サーバー・PoE HUB・UPS交換（写真必須）";
        }
    }

    // --- Image Handling (OneDrive usage) ---
    function attachPreview(input, box) {
        if (!input || !box) return;
        input.addEventListener("change", () => {
            box.innerHTML = "";
            const files = Array.from(input.files);
            if (files.length > 0) {
                const info = document.createElement("div");
                info.className = "muted";
                info.style.fontSize = "10px";
                info.style.marginBottom = "4px";
                info.textContent = "OneDrive同期フォルダに保存してください";
                box.appendChild(info);
            }
            files.forEach(f => {
                const url = URL.createObjectURL(f);
                const container = document.createElement("div");
                container.style.position = "relative";
                container.style.display = "inline-block";

                const img = document.createElement("img");
                img.src = url;
                img.title = `ファイル名: ${f.name}\nクリックで拡大`;
                img.onclick = () => { $("#dlgImg").src = url; $("#imgDialog").showModal(); };
                container.appendChild(img);

                box.appendChild(container);
            });
        });
    }

    function initDefaultLocations(n = 7) {
        locations = Array.from({ length: n }, (_, i) => ({ id: cryptoId(), name: `設置場所${i + 1}` }));
        renderAll();
    }

    function renderLocations() {
        const container = $("#locationList");
        if (!container) return;
        container.innerHTML = "";
        locations.forEach((loc) => {
            const div = document.createElement("div");
            div.className = "loc-row";
            div.style.marginBottom = "8px";
            div.style.display = "flex";
            div.style.alignItems = "center";
            div.style.gap = "12px";
            div.innerHTML = `
                <input type="checkbox" class="loc-check" value="${loc.id}" ${currentUser?.role === 'viewer' ? 'disabled' : ''}>
                <input type="text" value="${escapeHtml(loc.name)}" placeholder="場所名を入力" 
                       oninput="updateLocationName('${loc.id}', this.value)" 
                       style="flex: 1;" ${currentUser?.role === 'viewer' ? 'disabled' : ''}>
            `;
            container.appendChild(div);
        });
    }

    window.updateLocationName = (id, name) => {
        const loc = locations.find(l => l.id === id);
        if (loc) {
            loc.name = name;
            const camHeader = document.querySelector(`tr[data-locid="${id}"] td:nth-child(2)`);
            if (camHeader) camHeader.textContent = name;
            const subTitle = document.querySelector(`#sub_${id} .title`);
            if (subTitle) subTitle.textContent = `設定値（${name}）`;
        }
    };

    function renderCommonItems() {
        const body = $("#commonBody");
        if (!body) return;
        body.innerHTML = "";
        COMMON_ITEMS.forEach((item, i) => {
            const n = i + 1;
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${n}</td>
                <td>${escapeHtml(item)}</td>
                <td><input type="datetime-local" name="common_plan_${n}"></td>
                <td><input type="datetime-local" name="common_act_${n}"></td>
                <td><input type="text" name="common_person_${n}" style="width: 80px;"></td>
                <td style="white-space: nowrap;">
                    <div style="display: flex; gap: 8px;">
                        <label><input type="radio" name="common_stat_${n}" value="未"> 未</label>
                        <label><input type="radio" name="common_stat_${n}" value="中"> 中</label>
                        <label><input type="radio" name="common_stat_${n}" value="完"> 完</label>
                    </div>
                </td>
                <td><textarea name="common_rem_${n}" rows="1" style="width: 100%;"></textarea></td>
                <td>
                    <div class="imgGrid" style="grid-template-columns: repeat(2, 1fr);">
                        ${[1, 2, 3, 4].map(k => `
                            <div class="img-upload-box">
                                <input type="file" name="common_img_${n}_${k}" accept="image/*" style="font-size: 10px; width: 100%;">
                                <div id="common_img_${n}_${k}_preview" class="thumbs"></div>
                            </div>
                        `).join("")}
                    </div>
                </td>
                <td style="text-align: center;"><input type="checkbox" name="common_check_${n}"></td>
            `;
            body.appendChild(tr);
            const checkbox = tr.querySelector(`input[name="common_check_${n}"]`);
            checkbox.addEventListener("change", () => tr.classList.toggle("checked", checkbox.checked));

            [1, 2, 3, 4].forEach(k => {
                const input = tr.querySelector(`[name="common_img_${n}_${k}"]`);
                const box = tr.querySelector(`#common_img_${n}_${k}_preview`);
                attachPreview(input, box);
            });
        });
        updatePartLinking();
    }

    function renderCamera() {
        const body = $("#cameraBody");
        if (!body) return;
        body.innerHTML = "";
        locations.forEach((loc, i) => {
            const n = i + 1;
            const rid = `cam_${loc.id}`;
            const subId = `sub_${loc.id}`;

            const tr = document.createElement("tr");
            tr.setAttribute("data-locid", loc.id);
            tr.innerHTML = `
                <td>${n}</td>
                <td>${escapeHtml(loc.name)}</td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        <input type="datetime-local" name="${rid}_time_start" style="font-size: 11px;">
                        <input type="datetime-local" name="${rid}_time_end" style="font-size: 11px;">
                    </div>
                </td>
                <td><input type="number" name="${rid}_pre" style="width: 45px;"></td>
                <td><input type="number" name="${rid}_day" style="width: 45px;"></td>
                <td><input type="number" name="${rid}_night" style="width: 45px;"></td>
                <td style="text-align: center;"><button type="button" onclick="toggleSubRow('${subId}')" style="padding: 4px 8px; font-size: 11px;">設定値</button></td>
                <td>
                    <div class="imgGrid">
                        <div class="imgBlock"><div class="imgTitle">前</div><input type="file" name="${rid}_pre_img" accept="image/*" multiple style="font-size: 10px;"><div id="${rid}_pre_preview" class="thumbs"></div></div>
                        <div class="imgBlock"><div class="imgTitle">昼</div><input type="file" name="${rid}_day_img" accept="image/*" multiple style="font-size: 10px;"><div id="${rid}_day_preview" class="thumbs"></div></div>
                        <div class="imgBlock"><div class="imgTitle">夜</div><input type="file" name="${rid}_night_img" accept="image/*" multiple style="font-size: 10px;"><div id="${rid}_night_preview" class="thumbs"></div></div>
                    </div>
                </td>
                <td style="white-space: nowrap;">
                    <label><input type="radio" name="${rid}_status" value="正常" checked> 正常</label><br>
                    <label><input type="radio" name="${rid}_status" value="異常"> 異常</label>
                </td>
                <td style="text-align: center;"><input type="checkbox" name="${rid}_check"></td>
            `;
            body.appendChild(tr);

            const sub = document.createElement("tr");
            sub.className = "subrow";
            sub.id = subId;
            sub.style.display = "none";
            sub.innerHTML = `
                <td colspan="10">
                    <div class="subwrap" style="box-shadow: inset 0 2px 4px rgba(0,0,0,0.05);">
                        <div class="title" style="font-weight:bold;margin-bottom:12px; color: var(--primary);">設定値確認: ${escapeHtml(loc.name)}</div>
                        <div class="table-wrap">
                            <table class="subtable">
                                <thead><tr><th style="width: 40px;">No</th><th>項目名</th><th>日時</th><th style="width: 60px;">前</th><th style="width: 60px;">後</th><th style="width: 40px;">一致</th><th>備考</th></tr></thead>
                                <tbody>
                                    ${Array.from({ length: 10 }, (_, k) => `
                                        <tr>
                                            <td>${k + 1}</td>
                                            <td><input type="text" name="set_${loc.id}_${k + 1}_name" style="width: 100%;"></td>
                                            <td><input type="text" name="set_${loc.id}_${k + 1}_time" style="width: 80px;" placeholder="HH:mm"></td>
                                            <td><input type="number" name="set_${loc.id}_${k + 1}_before" oninput="updateMatch('${loc.id}', ${k + 1})" style="width: 50px;"></td>
                                            <td><input type="number" name="set_${loc.id}_${k + 1}_after" oninput="updateMatch('${loc.id}', ${k + 1})" style="width: 50px;"></td>
                                            <td style="text-align: center;"><input type="checkbox" name="set_${loc.id}_${k + 1}_match" disabled></td>
                                            <td><input type="text" name="set_${loc.id}_${k + 1}_note" style="width: 100%;"></td>
                                        </tr>
                                    `).join("")}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </td>
            `;
            body.appendChild(sub);
            const checkbox = tr.querySelector(`input[name="${rid}_check"]`);
            checkbox.addEventListener("change", () => tr.classList.toggle("checked", checkbox.checked));
            ["pre", "day", "night"].forEach(kind => attachPreview(tr.querySelector(`[name="${rid}_${kind}_img"]`), tr.querySelector(`#${rid}_${kind}_preview`)));
        });
    }

    window.updateMatch = (locId, n) => {
        const before = getEl(`set_${locId}_${n}_before`).value;
        const after = getEl(`set_${locId}_${n}_after`).value;
        const chk = getEl(`set_${locId}_${n}_match`);
        if (before && after) {
            chk.checked = (before === after);
        } else {
            chk.checked = false;
        }
    };

    window.toggleSubRow = (id) => {
        const el = $(`#${id}`);
        if (el) el.style.display = (el.style.display === "none") ? "" : "none";
    };

    // --- Local Storage Management ---
    function snapshot() {
        const data = {
            __locations: locations,
            __currentReportId: currentReportId,
            __savedAt: new Date().toISOString(),
            __creator: currentUser?.id,
            __images: {}
        };
        
        // Capture image preview information
        document.querySelectorAll(".thumbs").forEach(previewBox => {
            const fieldName = previewBox.id.replace(/_preview$/, '');
            const imageSrcs = [];
            previewBox.querySelectorAll('img').forEach(img => {
                if (img.src) imageSrcs.push(img.src);
            });
            if (imageSrcs.length > 0) {
                data.__images[fieldName] = imageSrcs;
            }
        });
        
        document.querySelectorAll("input, textarea, select").forEach(el => {
            if (!el.name || el.type === "file") return;
            if (el.type === "checkbox") data[el.name] = el.checked;
            else if (el.type === "radio") { if (el.checked) data[el.name] = el.value; }
            else data[el.name] = el.value;
        });
        return data;
    }

    function restore(data) {
        if (!data) return;
        if (data.__locations) locations = data.__locations;
        renderAll();
        Object.entries(data).forEach(([k, v]) => {
            if (k.startsWith("__")) return;
            setVal(k, v);
        });
        updatePartLinking();
        // マッチチェックの初期反映
        locations.forEach(loc => {
            for (let i = 1; i <= 10; i++) updateMatch(loc.id, i);
        });
    }

    async function renderReportList() {
        const body = $("#reportListBody");
        if (!body) return;

        try {
            const response = await fetch('/api/reports');
            const list = await response.json();

            body.innerHTML = "";
            list.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).forEach(r => {
                const isCreator = r.data.__creator === currentUser?.id;
                const canEdit = currentUser?.role === 'master' || (currentUser?.role === 'Manager' && isCreator) || (currentUser?.role === 'user' && isCreator);
                const canDelete = currentUser?.role === 'master' || (currentUser?.role === 'Manager' && isCreator);

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${new Date(r.savedAt).toLocaleString()}</td>
                    <td>${escapeHtml(r.managementId)}</td>
                    <td>${escapeHtml(r.propertyName)}</td>
                    <td>${escapeHtml(r.workDate)}</td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" onclick="loadReport('${r.id}')" ${!canEdit && currentUser?.role !== 'viewer' ? 'style="display:none"' : ''}>
                                ${currentUser?.role === 'viewer' ? '閲覧' : '読込'}
                            </button>
                            ${canDelete ? `<button type="button" class="danger" onclick="deleteReport('${r.id}')" style="padding: 4px 8px;">削除</button>` : ''}
                        </div>
                    </td>
                `;
                body.appendChild(tr);
            });
        } catch (err) {
            console.error('Failed to load reports from server:', err);
            // Fallback to local
            const list = JSON.parse(localStorage.getItem(REPORTS_KEY) || "[]");
            body.innerHTML = "";
            list.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).forEach(r => {
                const isCreator = r.data.__creator === currentUser?.id;
                const canEdit = currentUser?.role === 'master' || (currentUser?.role === 'Manager' && isCreator) || (currentUser?.role === 'user' && isCreator);
                const canDelete = currentUser?.role === 'master' || (currentUser?.role === 'Manager' && isCreator);

                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${new Date(r.savedAt).toLocaleString()}</td>
                    <td>${escapeHtml(r.managementId)}</td>
                    <td>${escapeHtml(r.propertyName)}</td>
                    <td>${escapeHtml(r.workDate)}</td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" onclick="loadReport('${r.id}')" ${!canEdit && currentUser?.role !== 'viewer' ? 'style="display:none"' : ''}>
                                ${currentUser?.role === 'viewer' ? '閲覧' : '読込'}
                            </button>
                            ${canDelete ? `<button type="button" class="danger" onclick="deleteReport('${r.id}')" style="padding: 4px 8px;">削除</button>` : ''}
                        </div>
                    </td>
                `;
                body.appendChild(tr);
            });
        }
    }

    function saveToLocal() {
        if (currentUser?.role === 'viewer') return;
        const data = snapshot();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    window.saveReport = async () => {
        if (currentUser?.role === 'viewer') return;
        if (!validateForm()) {
            alert("必須項目が未入力、または正しくありません。赤枠を確認してください。");
            return;
        }

        const data = snapshot();
        const id = currentReportId || cryptoId();

        const reportData = {
            id,
            managementId: getVal("managementId"),
            propertyName: getVal("propertyName"),
            workDate: getVal("workDateStart"),
            savedAt: new Date().toISOString(),
            data
        };

        try {
            const response = await fetch('/api/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reportData)
            });
            if (response.ok) {
                currentReportId = id;
                await renderReportList();
                alert("サーバーに保存しました。");
            } else {
                throw new Error('Save failed');
            }
        } catch (err) {
            alert("サーバーへの保存に失敗しました。Node.jsサーバーが起動しているか確認してください。");
            console.error(err);
        }
    };

    window.loadReport = async (id) => {
        try {
            const response = await fetch('/api/reports');
            const list = await response.json();
            const r = list.find(x => x.id === id);

            if (r && confirm("データを読み込みますか？現在のフォーム内容は消去されます。")) {
                currentReportId = id;
                restore(r.data);
                
                // Restore image previews if available
                if (r.data && r.data.__images) {
                    Object.entries(r.data.__images).forEach(([fieldName, imagePaths]) => {
                        const previewBox = document.querySelector(`#${fieldName}_preview`);
                        if (previewBox && Array.isArray(imagePaths)) {
                            previewBox.innerHTML = '';
                            imagePaths.forEach(imagePath => {
                                if (imagePath) {
                                    const container = document.createElement("div");
                                    container.style.position = "relative";
                                    container.style.display = "inline-block";
                                    container.style.margin = "4px";
                                    
                                    const img = document.createElement("img");
                                    img.src = imagePath;
                                    img.title = `クリックで拡大`;
                                    img.style.maxHeight = "80px";
                                    img.style.maxWidth = "80px";
                                    img.style.cursor = "pointer";
                                    img.onclick = () => { $("#dlgImg").src = imagePath; $("#imgDialog").showModal(); };
                                    container.appendChild(img);
                                    previewBox.appendChild(container);
                                }
                            });
                        }
                    });
                }
                
                if (currentUser.role === 'viewer') {
                    document.querySelectorAll("input, textarea, select, button:not(.primary)").forEach(el => {
                        if (el.textContent !== "ログアウト" && !el.closest(".nav-container")) el.disabled = true;
                    });
                }
            }
        } catch (err) {
            alert("読み込みに失敗しました。");
        }
    };

    window.deleteReport = async (id) => {
        if (!confirm("このレポートを削除しますか？")) return;
        try {
            const response = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
            if (response.ok) {
                if (currentReportId === id) currentReportId = null;
                await renderReportList();
            }
        } catch (err) {
            alert("削除に失敗しました。");
        }
    };

    function renderAll() {
        renderLocations();
        renderCommonItems();
        renderCamera();
        renderReportList();
        renderUIByRole();
    }

    // --- Helpers ---
    function getEl(name) { return document.querySelector(`[name="${cssEscape(name)}"]`); }
    function cssEscape(name) { return name.replace(/["\\]/g, "\\$&"); }
    function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function setVal(name, value) {
        const el = getEl(name);
        if (!el) {
            const radios = document.querySelectorAll(`[name="${cssEscape(name)}"]`);
            radios.forEach(r => { r.checked = (r.value === value); });
            return;
        }
        if (el.type === "checkbox") el.checked = !!value;
        else if (el.type === "file") { }
        else el.value = (value ?? "");
    }
    function getVal(name) {
        const el = getEl(name);
        if (!el) return "";
        if (el.type === "checkbox") return el.checked;
        const checked = document.querySelector(`input[name="${name}"]:checked`);
        if (el.type === "radio") return checked ? checked.value : "";
        return el.value;
    }
    function cryptoId() { return Math.random().toString(36).substring(2, 10); }

    document.addEventListener("DOMContentLoaded", () => {
        initAuth();
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) restore(JSON.parse(raw));
        else initDefaultLocations();
    });

    document.addEventListener("input", (e) => {
        if (e.target.name?.startsWith("part_")) updatePartLinking();
        if (e.target.name === "cnt_camera") {
            syncLocationsFromCameraCount();
        }
        if (window._saveTimer) clearTimeout(window._saveTimer);
        window._saveTimer = setTimeout(saveToLocal, 1000);
    });

    function syncLocationsFromCameraCount() {
        const cntEl = getEl("cnt_camera");
        if (!cntEl) return;
        const count = parseInt(cntEl.value, 10);
        if (isNaN(count) || count < 0) return;

        if (count > locations.length) {
            const diff = count - locations.length;
            for (let i = 0; i < diff; i++) {
                locations.push({ id: cryptoId(), name: `設置場所${locations.length + 1}` });
            }
            renderAll();
        } else if (count < locations.length) {
            if (confirm(`交換部品のCamera台数(${count}台)に合わせて、設置場所の行数も削減しますか？\n(後ろの${locations.length - count}件が削除されます)`)) {
                locations = locations.slice(0, count);
                renderAll();
            }
        }
    }

    window.addLocation = (n = 1) => {
        if (currentUser?.role === 'viewer') return;
        for (let i = 0; i < n; i++) locations.push({ id: cryptoId(), name: "" });
        renderAll();
    };

    window.deleteSelectedLocations = () => {
        if (currentUser?.role === 'viewer') return;
        const selected = Array.from(document.querySelectorAll(".loc-check:checked")).map(el => el.value);
        if (selected.length === 0) return;
        if (confirm(`${selected.length}件の設置場所を削除しますか？`)) {
            locations = locations.filter(l => !selected.includes(l.id));
            renderAll();
        }
    };

    window.resetLocations = () => {
        if (currentUser?.role === 'viewer') return;
        const n = parseInt($("#initLocCount").value, 10);
        if (n > 0 && confirm(`設置場所を${n}箇所にリセットしますか？入力済みの場所データは失われます。`)) {
            locations = Array.from({ length: n }, (_, i) => ({ id: cryptoId(), name: `設置場所${i + 1}` }));
            renderAll();
        }
    };
})();
