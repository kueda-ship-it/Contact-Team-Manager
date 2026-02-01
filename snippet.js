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
