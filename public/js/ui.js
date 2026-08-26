// Authentication, profile, friends, direct messages, and admin UI.

        function switchAuthTab(tabName) {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
            const indicator = document.querySelector('.auth-tab-indicator');
            indicator.classList.toggle('right', tabName === 'register');
            $('loginPanel').style.display = tabName === 'login' ? '' : 'none';
            $('registerPanel').style.display = tabName === 'register' ? '' : 'none';
            $('guestPanel').style.display = 'none';
        }
        
        function switchToGuest() {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            document.querySelector('.auth-tab-indicator').classList.add('right');
            $('loginPanel').style.display = 'none';
            $('registerPanel').style.display = 'none';
            $('guestPanel').style.display = '';
        }
        
        function setButtonLoading(btn, loading) {
            btn.classList.toggle('loading', loading);
            btn.disabled = loading;
            btn.querySelector('.btn-text').textContent = loading ? '处理中...' : btn.dataset.originalText || '确定';
        }

        let restoringSession = false;

        function persistSessionProfile(user) {
            if (!user) return;
            if (user.nickname) localStorage.setItem('mechat_user_nickname', user.nickname);
            if (user.username !== undefined) localStorage.setItem('mechat_username', user.username || '');
            if (user.avatar) localStorage.setItem('mechat_user_avatar', user.avatar);
        }

        function clearStoredSession() {
            ['mechat_user_id', 'mechat_session_token', 'mechat_user_color', 'mechat_user_nickname', 'mechat_username', 'mechat_user_avatar']
                .forEach(key => localStorage.removeItem(key));
        }

        function restoreSessionFromStorage() {
            const savedUserId = localStorage.getItem('mechat_user_id');
            const savedToken = localStorage.getItem('mechat_session_token');
            if (!savedUserId || !savedToken) {
                if (savedUserId || savedToken) clearStoredSession();
                return false;
            }

            restoringSession = true;
            state.user.id = savedUserId;
            state.user.name = localStorage.getItem('mechat_user_nickname') || '匿名';
            state.user.username = localStorage.getItem('mechat_username') || '';
            state.user.color = localStorage.getItem('mechat_user_color') || state.user.color;
            state.user.avatar = localStorage.getItem('mechat_user_avatar') || null;
            selectedColor = state.user.color;
            setButtonLoading($('loginButton'), true);
            $('loginButton').querySelector('.btn-text').textContent = '恢复登录中...';
            doSocketRegister(state.user.avatar);
            return true;
        }

        async function logout() {
            const confirmed = await showConfirmDialog('退出后需要重新登录，确定退出当前账号吗？', { title: '退出登录', confirmText: '退出' });
            if (!confirmed) return;

            restoringSession = false;
            clearStoredSession();
            state.user = { id: null, name: '匿名', username: '', bio: '', x: 0, y: 0, color: '#00d4ff', avatar: null };
            state.otherUsers = [];
            state.messages = [];
            state.portals = [];
            state.isAdmin = false;
            state.isSuperAdmin = false;
            state.mutedUsers.clear();
            state.viewport.x = 0;
            state.viewport.y = 0;
            state.viewport.scale = 1;
            state.keys = {};
            state.movementDisabled = false;
            selectedColor = state.user.color;
            msgMeasureCache.clear();
            myFriends = [];
            pendingRequests = [];

            closeProfilePanel();
            closeFriendsPanel();
            closePortalPanel();
            closePortalDetail();
            if (typeof closeDMPanel === 'function') closeDMPanel();
             if (typeof closeAdminPanel === 'function') closeAdminPanel();
             $('userCard').style.display = 'none';
             canvas.style.display = 'none';
             ctx.clearRect(0, 0, canvas.width, canvas.height);
             $('entryScreen').style.display = '';
            document.querySelector('.online-badge').style.display = 'none';
            $('coordinatesDisplay').style.display = 'none';
            document.querySelector('.controls-hint').style.display = 'none';
            messageInputContainer.classList.remove('active');
            messageInput.value = '';
            $('messageDetail').classList.remove('active');
            document.querySelectorAll('.enter-btn').forEach(btn => setButtonLoading(btn, false));
            $('loginUsername').value = '';
            $('loginPassword').value = '';
            if (typeof mobileAdapter !== 'undefined' && mobileAdapter?.hideGameUI) mobileAdapter.hideGameUI();

            socket.disconnect();
            setTimeout(() => socket.connect(), 0);
            showToast('已退出登录', 'success');
        }

        let appToastContainer = null;
        function showToast(message, type = 'info', duration = 3600) {
            if (!appToastContainer) {
                appToastContainer = document.createElement('div');
                appToastContainer.className = 'app-toast-container';
                appToastContainer.setAttribute('aria-live', 'polite');
                document.body.appendChild(appToastContainer);
            }

            const toast = document.createElement('div');
            toast.className = `app-toast app-toast-${type}`;
            toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

            const icon = document.createElement('i');
            icon.className = `app-toast-icon fa-solid fa-${({ success: 'circle-check', error: 'circle-exclamation', warning: 'triangle-exclamation', info: 'circle-info' }[type] || 'circle-info')}`;

            const text = document.createElement('span');
            text.className = 'app-toast-text';
            text.textContent = String(message ?? '');
            toast.append(icon, text);
            appToastContainer.appendChild(toast);

            let isRemoving = false;
            const remove = () => {
                if (isRemoving || !toast.isConnected) return;
                isRemoving = true;
                toast.classList.add('is-leaving');
                setTimeout(() => {
                    toast.remove();
                    if (!appToastContainer.childElementCount) {
                        appToastContainer.remove();
                        appToastContainer = null;
                    }
                }, 180);
            };
            toast.addEventListener('click', remove, { once: true });
            requestAnimationFrame(() => toast.classList.add('is-visible'));
            setTimeout(remove, duration);
        }

        let interactionDialogResolve = null;
        let interactionDialogMode = 'confirm';
        let interactionDialogPreviousFocus = null;

        function setupInteractionDialog() {
            const overlay = $('interactionDialog');
            if (!overlay || overlay.dataset.ready) return;
            overlay.dataset.ready = 'true';
            $('interactionDialogConfirm').addEventListener('click', () => {
                const value = interactionDialogMode === 'input' ? $('interactionDialogInput').value : true;
                closeInteractionDialog(value);
            });
            $('interactionDialogCancel').addEventListener('click', () => {
                closeInteractionDialog(interactionDialogMode === 'input' ? null : false);
            });
            $('interactionDialogInput').addEventListener('keydown', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    closeInteractionDialog($('interactionDialogInput').value);
                }
            });
            overlay.addEventListener('click', e => {
                if (e.target === overlay) closeInteractionDialog(interactionDialogMode === 'input' ? null : false);
            });
            document.addEventListener('keydown', e => {
                if (e.key === 'Escape' && overlay.classList.contains('active')) {
                    closeInteractionDialog(interactionDialogMode === 'input' ? null : false);
                }
            });
        }

        function closeInteractionDialog(result) {
            const overlay = $('interactionDialog');
            if (!overlay || !overlay.classList.contains('active')) return;
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
            const resolve = interactionDialogResolve;
            interactionDialogResolve = null;
            if (interactionDialogPreviousFocus && typeof interactionDialogPreviousFocus.focus === 'function') {
                interactionDialogPreviousFocus.focus();
            }
            interactionDialogPreviousFocus = null;
            if (resolve) resolve(result);
        }

        function openInteractionDialog({ message, title, mode, placeholder, confirmText }) {
            if (interactionDialogResolve) closeInteractionDialog(interactionDialogMode === 'input' ? null : false);
            const overlay = $('interactionDialog');
            const input = $('interactionDialogInput');
            interactionDialogMode = mode;
            interactionDialogPreviousFocus = document.activeElement;
            $('interactionDialogTitle').textContent = title;
            $('interactionDialogMessage').textContent = message;
            $('interactionDialogConfirm').textContent = confirmText;
            input.value = '';
            input.placeholder = placeholder || '';
            input.style.display = mode === 'input' ? '' : 'none';
            overlay.classList.add('active');
            overlay.setAttribute('aria-hidden', 'false');
            return new Promise(resolve => {
                interactionDialogResolve = resolve;
                requestAnimationFrame(() => (mode === 'input' ? input : $('interactionDialogConfirm')).focus());
            });
        }

        function showConfirmDialog(message, options = {}) {
            return openInteractionDialog({
                message,
                title: options.title || '确认操作',
                mode: 'confirm',
                confirmText: options.confirmText || '确认'
            });
        }

        function showInputDialog(message, options = {}) {
            return openInteractionDialog({
                message,
                title: options.title || '输入信息',
                mode: 'input',
                placeholder: options.placeholder || '',
                confirmText: options.confirmText || '确定'
            });
        }
        
        async function handleLogin() {
            const btn = $('loginButton');
            const username = $('loginUsername').value.trim();
            const password = $('loginPassword').value;
            if (!username || !password) { showToast('请输入用户名和密码', 'warning'); return; }
            setButtonLoading(btn, true);
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (data.success) {
                    clearStoredSession();
                    Object.assign(state.user, data.user);
                    state.user.id = data.user.id;
                    state.user.name = data.user.nickname || data.user.username;
                    state.user.color = data.user.color || state.user.color;
                    selectedColor = state.user.color;
                    localStorage.setItem('mechat_user_id', data.user.id);
                    localStorage.setItem('mechat_user_color', state.user.color);
                    if (data.sessionToken) localStorage.setItem('mechat_session_token', data.sessionToken);
                    doSocketRegister(state.user.avatar);
                } else {
                    showToast(data.error || '登录失败', 'error');
                    setButtonLoading(btn, false);
                }
            } catch (e) { showToast('网络错误，请重试', 'error'); setButtonLoading(btn, false); }
        }
        
        async function handleRegister() {
            const btn = $('registerButton');
            const username = $('regUsername').value.trim();
            const password = $('regPassword').value;
            const nickname = $('nicknameInput').value.trim() || username;
            if (!username || username.length < 2) { showToast('用户名至少需要2个字符', 'warning'); return; }
            if (!password || password.length < 4) { showToast('密码至少需要4个字符', 'warning'); return; }
            setButtonLoading(btn, true);
            try {
                const avatar = state.user.avatar ? await compressAvatar(state.user.avatar, 128) : null;
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, nickname, color: selectedColor, avatar })
                });
                const data = await res.json();
                if (data.success) {
                    clearStoredSession();
                    Object.assign(state.user, data.user);
                    state.user.id = data.user.id;
                    state.user.name = data.user.nickname || data.user.username;
                    state.user.color = data.user.color || selectedColor;
                    state.user.avatar = data.user.avatar || avatar || null;
                    selectedColor = state.user.color;
                    localStorage.setItem('mechat_user_id', data.user.id);
                    localStorage.setItem('mechat_user_color', state.user.color);
                    if (data.sessionToken) localStorage.setItem('mechat_session_token', data.sessionToken);
                    doSocketRegister(state.user.avatar);
                } else {
                    showToast(data.error || '注册失败', 'error');
                    setButtonLoading(btn, false);
                }
            } catch (e) { showToast('网络错误，请重试', 'error'); setButtonLoading(btn, false); }
        }
        
        function handleGuestEnter() {
            const btn = $('guestEnterButton');
            const nickname = $('guestNickname').value.trim() || getRandomName();
            clearStoredSession();
            state.user.id = null;
            state.user.username = '';
            state.user.name = nickname;
            setButtonLoading(btn, true);
            doSocketRegister(state.user.avatar);
        }
        
        function getRandomName() {
            const names = ['旅行者', '探险家', '漫步者', '流浪者', '追光者', '星尘旅人', '风语者'];
            return names[Math.floor(Math.random() * names.length)];
        }
        
        function doSocketRegister(avatar) {
            const savedUserId = localStorage.getItem('mechat_user_id');
            const savedToken = localStorage.getItem('mechat_session_token');
            const savedColor = localStorage.getItem('mechat_user_color');
            const hasSavedSession = !!(savedUserId && savedToken);
            const savedNickname = hasSavedSession ? localStorage.getItem('mechat_user_nickname') : null;
            const savedAvatar = hasSavedSession ? localStorage.getItem('mechat_user_avatar') : null;
            const registerData = {
                nickname: savedNickname || (hasSavedSession ? undefined : state.user.name),
                avatar: avatar || savedAvatar || null,
                userId: savedUserId,
                sessionToken: savedToken,
                color: savedColor || selectedColor
            };
            if (registerData.avatar) {
                compressAvatar(registerData.avatar, 128).then(compressed => {
                    state.user.avatar = compressed;
                    socket.emit('register', { ...registerData, avatar: compressed });
                });
            } else {
                socket.emit('register', registerData);
            }
        }
        
        let profileViewTarget = null;

        function openProfilePanel(targetUser) {
            if ($('friendsPanel').classList.contains('open')) closeFriendsPanel();
            if ($('portalPanel').classList.contains('open')) closePortalPanel();
            profileViewTarget = targetUser || null;
            const panel = $('profilePanel');
            const isSelf = !targetUser || targetUser.id === state.user.id;
            $('logoutBtn').style.display = isSelf ? '' : 'none';
            panel.querySelector('h3').textContent = isSelf ? '个人资料' : '用户资料';
            panel.style.display = '';
            requestAnimationFrame(() => panel.classList.add('open'));

            if (isSelf) {
                $('profileUsername').textContent = state.user.username || state.user.name;
                $('profileId').textContent = 'ID: ' + (state.user.id || '');
                $('profileNickname').value = state.user.name || '';
                $('profileBio').value = state.user.bio || '';
                $('profileNickname').disabled = false;
                $('profileBio').disabled = false;
                $('saveProfileBtn').style.display = '';
                document.querySelector('.color-picker-row').style.display = '';
                document.querySelector('.profile-avatar-upload').style.cursor = 'pointer';
                document.getElementById('profileAvatarInput').disabled = false;
                initColorPicker();
                updateProfileAvatarDisplay();
                $('adminPanelBtn').style.display = state.isAdmin ? '' : 'none';
            $('adminPanelBtn').innerHTML = state.isSuperAdmin
                ? '<i class="fa-solid fa-crown" aria-hidden="true"></i><span>站长面板</span>'
                : '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>管理面板</span>';
                if (state.isSuperAdmin) { $('adminPanelBtn').style.background = 'linear-gradient(135deg,#eab308,#ca8a04)'; } else { $('adminPanelBtn').style.background = ''; }
            } else {
                $('profileUsername').textContent = targetUser.username || targetUser.name || '@' + (targetUser.id || '');
                $('profileId').textContent = 'ID: ' + (targetUser.id || '');
                $('profileNickname').value = targetUser.name || targetUser.nickname || '';
                $('profileBio').value = targetUser.bio || '';
                $('profileNickname').disabled = true;
                $('profileBio').disabled = true;
                $('saveProfileBtn').style.display = 'none';
                document.querySelector('.color-picker-row').style.display = 'none';
                document.querySelector('.profile-avatar-upload').style.cursor = 'default';
                document.getElementById('profileAvatarInput').disabled = true;
                const img = $('profileAvatarImg');
                const icon = $('profileCameraIcon');
                if (targetUser.avatar) {
                    img.src = targetUser.avatar; img.style.display = ''; icon.style.display = 'none';
                } else {
                    img.style.display = 'none'; icon.style.display = '';
                    icon.style.color = targetUser.color || '#888';
                }
                $('adminPanelBtn').style.display = 'none';
            }
        }
        
        function closeProfilePanel() {
            const panel = $('profilePanel');
            panel.classList.remove('open');
            setTimeout(() => { panel.style.display = 'none'; }, 350);
        }

        function openFriendsPanel() {
            if ($('profilePanel').classList.contains('open')) closeProfilePanel();
            if ($('portalPanel').classList.contains('open')) closePortalPanel();
            const panel = $('friendsPanel');
            panel.style.display = '';
            switchFriendsTab('friends');
            requestAnimationFrame(() => panel.classList.add('open'));
            socket.emit('get_friends');
            socket.emit('get_pending_requests');
            socket.emit('get_sent_requests');
        }

        function closeFriendsPanel() {
            const panel = $('friendsPanel');
            panel.classList.remove('open');
            setTimeout(() => { panel.style.display = 'none'; }, 350);
        }

        function openPortalPanel() {
            if ($('profilePanel').classList.contains('open')) closeProfilePanel();
            if ($('friendsPanel').classList.contains('open')) closeFriendsPanel();
            updatePortalEntryPosition();
            resetPortalForm();
            const panel = $('portalPanel');
            panel.style.display = '';
            requestAnimationFrame(() => panel.classList.add('open'));
            renderMyPortals();
            socket.emit('get_portals');
        }

        function closePortalPanel() {
            const panel = $('portalPanel');
            if (!panel) return;
            panel.classList.remove('open');
            setTimeout(() => { panel.style.display = 'none'; }, 350);
        }

        function updatePortalEntryPosition() {
            $('portalEntryPosition').textContent = `X: ${Math.round(state.user.x)} · Y: ${Math.round(-state.user.y)}`;
        }

        function resetPortalForm() {
            $('portalName').value = '';
            $('portalTargetX').value = Math.round(state.user.x);
            $('portalTargetY').value = Math.round(-state.user.y);
            $('portalVisibility').value = 'public';
            $('portalDuration').value = 'permanent';
            $('portalColor').value = state.user.color || '#007aff';
            $('createPortalBtn').dataset.editingId = '';
            $('createPortalBtn').querySelector('.btn-text').textContent = '建立传送门';
            updatePortalEntryPosition();
        }

        function getPortalFormData() {
            return {
                name: $('portalName').value.trim(),
                targetX: Number($('portalTargetX').value),
                targetY: Number($('portalTargetY').value),
                visibility: $('portalVisibility').value,
                duration: $('portalDuration').value,
                color: $('portalColor').value
            };
        }

        function createPortalFromPanel() {
            const data = getPortalFormData();
            if (!data.name) { showToast('请填写传送门名称', 'warning'); return; }
            if (!Number.isFinite(data.targetX) || !Number.isFinite(data.targetY)) { showToast('请输入有效的出口坐标', 'warning'); return; }
            const editingId = $('createPortalBtn').dataset.editingId;
            if (editingId) socket.emit('update_portal', { ...data, portalId: editingId });
            else socket.emit('create_portal', data);
        }

        function renderMyPortals() {
            const list = $('myPortalsList');
            const mine = (state.portals || []).filter(portal => portal.ownerId === state.user.id);
            $('portalCountLabel').textContent = `${mine.length} / 3`;
            if (!mine.length) {
                list.innerHTML = '<p class="empty-hint">还没有创建传送门</p>';
                return;
            }
            list.innerHTML = mine.map(portal => `
                <div class="portal-list-item">
                    <span class="portal-list-orb" style="--portal-color:${escapeAttr(portal.color)}"><i class="fa-solid fa-worm" aria-hidden="true"></i></span>
                    <div class="portal-list-info">
                        <div class="portal-list-name">${escapeHtml(portal.name)}</div>
                        <div class="portal-list-meta">出口 X:${Math.round(portal.targetX)} · Y:${Math.round(-portal.targetY)} · ${portal.visibility === 'friends' ? '仅好友' : '公开'}</div>
                    </div>
                    <button class="portal-list-action" data-portal-id="${escapeAttr(portal.id)}" title="查看"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button>
                </div>
            `).join('');
            list.querySelectorAll('[data-portal-id]').forEach(button => {
                button.addEventListener('click', () => {
                    const portal = state.portals.find(item => item.id === button.dataset.portalId);
                    if (portal) openPortalDetail(portal);
                });
            });
        }

        function openPortalDetail(portal) {
            selectedPortal = portal;
            const dialog = $('portalDetailDialog');
            $('portalDetailName').textContent = portal.name;
            $('portalDetailMeta').textContent = `创建者：${portal.ownerName || '用户'} · ${portal.visibility === 'friends' ? '仅好友可见' : '公开可见'}`;
            $('portalDetailDescription').textContent = `入口 X:${Math.round(portal.x)} · Y:${Math.round(-portal.y)}\n出口 X:${Math.round(portal.targetX)} · Y:${Math.round(-portal.targetY)}`;
            $('portalDetailIcon').style.setProperty('--portal-color', portal.color);
            const own = portal.ownerId === state.user.id;
            $('portalEditBtn').style.display = own ? '' : 'none';
            $('portalDeleteBtn').style.display = own ? '' : 'none';
            dialog.classList.add('active');
            dialog.setAttribute('aria-hidden', 'false');
        }

        function closePortalDetail() {
            const dialog = $('portalDetailDialog');
            if (!dialog) return;
            dialog.classList.remove('active');
            dialog.setAttribute('aria-hidden', 'true');
            selectedPortal = null;
        }

        function useSelectedPortal() {
            if (!selectedPortal) return;
            const portal = selectedPortal;
            showConfirmDialog(`确定进入“${portal.name}”吗？\n将传送至 X:${Math.round(portal.targetX)} · Y:${Math.round(-portal.targetY)}`, { title: '进入传送门', confirmText: '传送' }).then(confirmed => {
                if (!confirmed) return;
                socket.emit('use_portal', { portalId: portal.id });
                closePortalDetail();
            });
        }

        function editSelectedPortal() {
            if (!selectedPortal || selectedPortal.ownerId !== state.user.id) return;
            const portal = selectedPortal;
            closePortalDetail();
            openPortalPanel();
            $('portalName').value = portal.name;
            $('portalTargetX').value = Math.round(portal.targetX);
            $('portalTargetY').value = Math.round(-portal.targetY);
            $('portalVisibility').value = portal.visibility;
            $('portalColor').value = portal.color;
            $('portalDuration').value = portal.isPermanent ? 'permanent' : 'week';
            $('createPortalBtn').dataset.editingId = portal.id;
            $('createPortalBtn').querySelector('.btn-text').textContent = '保存传送门';
        }

        function deleteSelectedPortal() {
            if (!selectedPortal || selectedPortal.ownerId !== state.user.id) return;
            const portal = selectedPortal;
            showConfirmDialog(`确定删除“${portal.name}”吗？`).then(confirmed => {
                if (!confirmed) return;
                socket.emit('delete_portal', { portalId: portal.id });
                closePortalDetail();
            });
        }

        function switchFriendsTab(tabName) {
            document.querySelectorAll('.friends-tab').forEach(tab => {
                const active = tab.dataset.friendsTab === tabName;
                tab.classList.toggle('active', active);
                tab.setAttribute('aria-selected', active ? 'true' : 'false');
            });
            document.querySelectorAll('.friends-tab-content').forEach(panel => {
                const active = panel.id === `friendsTab-${tabName}`;
                panel.classList.toggle('active', active);
                panel.hidden = !active;
            });
        }
        
        function initColorPicker() {
            const picker = $('colorPicker');
            picker.innerHTML = '';
            COLORS.forEach(c => {
                const dot = document.createElement('div');
                dot.className = 'color-dot' + (c === selectedColor ? ' selected' : '');
                dot.style.background = c;
                dot.dataset.color = c;
                dot.addEventListener('click', () => {
                    picker.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
                    dot.classList.add('selected');
                    selectedColor = c;
                });
                picker.appendChild(dot);
            });
        }
        
        function updateProfileAvatarDisplay() {
            const img = $('profileAvatarImg');
            const icon = $('profileCameraIcon');
            if (state.user.avatar) {
                img.src = state.user.avatar;
                img.style.display = '';
                icon.style.display = 'none';
            } else {
                img.style.display = 'none';
                icon.style.display = '';
            }
        }
        
        function saveProfile() {
            const btn = $('saveProfileBtn');
            setButtonLoading(btn, true);
            const profileData = {
                nickname: $('profileNickname').value.trim() || state.user.name,
                bio: $('profileBio').value.trim(),
                color: selectedColor
            };
            if (state.user.avatar) {
                compressAvatar(state.user.avatar, 128).then(compressed => {
                    profileData.avatar = compressed;
                    socket.emit('update_profile', profileData);
                });
            } else {
                socket.emit('update_profile', profileData);
            }
        }
        
        function renderFriendsList(friends) {
            myFriends = friends || [];
            const container = $('friendsList');
            if (!myFriends.length) {
                container.innerHTML = '<p class="empty-hint">暂无好友</p>';
                return;
            }
            container.innerHTML = '';
            myFriends.forEach(f => {
                const item = document.createElement('div');
                item.className = 'friend-item';
                const safeColor = (f.color || '#007aff').replace('#', '');
                const cr = parseInt(safeColor.substr(0, 2), 16) || 0;
                const cg = parseInt(safeColor.substr(2, 2), 16) || 0;
                const cb = parseInt(safeColor.substr(4, 2), 16) || 0;
                const onlineUser = state.otherUsers.find(u => u.id === f.id);
                const isOnline = !!onlineUser;
                
                if (f.avatar) {
                    item.innerHTML = `
                        <div style="position:relative;flex-shrink:0">
                            <img class="friend-avatar" src="${f.avatar}" alt="" style="cursor:pointer">
                            ${isOnline ? '<span style="position:absolute;bottom:2px;right:2px;width:10px;height:10px;background:#34c759;border-radius:50%;border:2px solid white;"></span>' : ''}
                        </div>
                        <div class="friend-info" style="flex:1;min-width:0;cursor:pointer">
                            <div class="friend-name">${escapeHtml(f.nickname)}</div>
                            ${isOnline ? `<div style="font-size:0.7rem;color:var(--text-tertiary)">在线 · X:${Math.round(onlineUser.x)} Y:${Math.round(-onlineUser.y)}</div>` : '<div style="font-size:0.7rem;color:var(--text-tertiary)">离线</div>'}
                        </div>
                        <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
                        ${isOnline ? `<button class="request-btn accept" data-teleport-id="${f.id}" title="传送"><i class="fa-solid fa-location-arrow" aria-hidden="true"></i></button><button class="request-btn reject" data-dm-id="${f.id}" data-dm-name="${escapeHtml(f.nickname)}" title="私信"><i class="fa-solid fa-comment" aria-hidden="true"></i></button>` : ''}
                        <button class="friend-remove-btn" data-friend-id="${f.id}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
                    `;
                } else {
                    item.innerHTML = `
                        <div style="position:relative;flex-shrink:0">
                            <div class="friend-avatar-placeholder" style="background:rgb(${cr},${cg},${cb});cursor:pointer">${(f.nickname || '?').charAt(0)}</div>
                            ${isOnline ? '<span style="position:absolute;bottom:2px;right:2px;width:10px;height:10px;background:#34c759;border-radius:50%;border:2px solid white;"></span>' : ''}
                        </div>
                        <div class="friend-info" style="flex:1;min-width:0;cursor:pointer">
                            <div class="friend-name">${escapeHtml(f.nickname)}</div>
                            ${isOnline ? `<div style="font-size:0.7rem;color:var(--text-tertiary)">在线 · X:${Math.round(onlineUser.x)} Y:${Math.round(-onlineUser.y)}</div>` : '<div style="font-size:0.7rem;color:var(--text-tertiary)">离线</div>'}
                        </div>
                        <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
                        ${isOnline ? `<button class="request-btn accept" data-teleport-id="${f.id}" title="传送"><i class="fa-solid fa-location-arrow" aria-hidden="true"></i></button><button class="request-btn reject" data-dm-id="${f.id}" data-dm-name="${escapeHtml(f.nickname)}" title="私信"><i class="fa-solid fa-comment" aria-hidden="true"></i></button>` : ''}
                        <button class="friend-remove-btn" data-friend-id="${f.id}"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>
                    `;
                }
                const removeBtn = item.querySelector('.friend-remove-btn');
                removeBtn.addEventListener('click', e => {
                    e.stopPropagation();
                    showConfirmDialog(`确定移除好友 ${f.nickname} 吗？`).then(confirmed => {
                        if (confirmed) socket.emit('remove_friend', { targetId: f.id });
                    });
                });
                const teleportBtn = item.querySelector('[data-teleport-id]');
                if (teleportBtn) teleportBtn.addEventListener('click', (e) => { e.stopPropagation(); state.user.x = onlineUser.x; state.user.y = onlineUser.y; state.viewport.x = onlineUser.x; state.viewport.y = onlineUser.y; socket.emit('move', { x: onlineUser.x, y: onlineUser.y }); });
                const dmBtn = item.querySelector('[data-dm-id]');
                if (dmBtn) dmBtn.addEventListener('click', (e) => { e.stopPropagation(); openDMPanel(f.id, f.nickname); });
                container.appendChild(item);
            });
        }
        
        let pendingRequests = [];
        
        function renderPendingRequests(requests) {
            pendingRequests = requests || [];
            const container = $('pendingRequestsList');
            const badges = document.querySelectorAll('[data-friends-request-badge]');
            if (!pendingRequests.length) {
                container.innerHTML = '<p class="empty-hint">暂无申请</p>';
                badges.forEach(badge => { badge.style.display = 'none'; });
                return;
            }
            badges.forEach(badge => {
                badge.textContent = pendingRequests.length;
                badge.style.display = '';
            });
            container.innerHTML = '';
            pendingRequests.forEach(r => {
                const item = document.createElement('div');
                item.className = 'request-item';
                const safeColor = (r.color || '#007aff').replace('#', '');
                const cr = parseInt(safeColor.substr(0, 2), 16) || 0;
                const cg = parseInt(safeColor.substr(2, 2), 16) || 0;
                const cb = parseInt(safeColor.substr(4, 2), 16) || 0;
                if (r.avatar) {
                    item.innerHTML = `
                        <img class="friend-avatar" src="${r.avatar}" alt="">
                        <div class="friend-info">
                            <div class="friend-name">${escapeHtml(r.nickname)}</div>
                        </div>
                        <div class="request-actions">
                            <button class="request-btn accept" data-from-id="${r.id}">接受</button>
                            <button class="request-btn reject" data-from-id="${r.id}">拒绝</button>
                        </div>
                    `;
                } else {
                    item.innerHTML = `
                        <div class="friend-avatar-placeholder" style="background:rgb(${cr},${cg},${cb})">${(r.nickname || '?').charAt(0)}</div>
                        <div class="friend-info">
                            <div class="friend-name">${escapeHtml(r.nickname)}</div>
                        </div>
                        <div class="request-actions">
                            <button class="request-btn accept" data-from-id="${r.id}">接受</button>
                            <button class="request-btn reject" data-from-id="${r.id}">拒绝</button>
                        </div>
                    `;
                }
                item.querySelector('.accept').addEventListener('click', () => {
                    socket.emit('accept_friend_request', { fromId: r.id });
                });
                item.querySelector('.reject').addEventListener('click', () => {
                    socket.emit('reject_friend_request', { fromId: r.id });
                });
                container.appendChild(item);
            });
        }

        function renderSentRequests(requests) {
            const container = $('sentRequestsList');
            if (!requests.length) {
                container.innerHTML = '<p class="empty-hint">暂无申请</p>';
                return;
            }
            container.innerHTML = '';
            requests.forEach(r => {
                const item = document.createElement('div');
                item.className = 'request-item outgoing';
                const safeColor = (r.color || '#007aff').replace('#', '');
                const cr = parseInt(safeColor.substr(0, 2), 16) || 0;
                const cg = parseInt(safeColor.substr(2, 2), 16) || 0;
                const cb = parseInt(safeColor.substr(4, 2), 16) || 0;
                const avatar = r.avatar
                    ? `<img class="friend-avatar" src="${escapeAttr(r.avatar)}" alt="">`
                    : `<div class="friend-avatar-placeholder" style="background:rgb(${cr},${cg},${cb})">${escapeHtml((r.nickname || '?').charAt(0))}</div>`;
                item.innerHTML = `${avatar}
                    <div class="friend-info"><div class="friend-name">${escapeHtml(r.nickname || r.username || '用户')}</div>
                    <div class="request-status">等待对方处理</div></div>`;
                container.appendChild(item);
            });
        }
        
        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }
        
        function escapeAttr(str) {
            return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }
        
        function showContextMenu(x, y, targetUser) {
            contextMenuTarget = targetUser;
            const menu = $('userContextMenu');
            const isFriend = myFriends.some(f => f.id === targetUser.id);
            menu.querySelector('[data-action="send_friend_request"]').style.display = isFriend ? 'none' : '';
            menu.querySelector('[data-action="send_private_message"]').style.display = isFriend ? '' : 'none';
            menu.querySelector('[data-action="remove_friend"]').style.display = isFriend ? '' : 'none';
            const adminOnlyEls = menu.querySelectorAll('.admin-only');
            adminOnlyEls.forEach(el => { el.style.display = (state.isAdmin && targetUser.id !== state.user.id) ? '' : 'none'; });
            if (state.isAdmin && targetUser.id !== state.user.id) {
                const isMuted = state.mutedUsers.has(targetUser.id);
                menu.querySelector('[data-action="admin_mute"]').style.display = isMuted ? 'none' : '';
                menu.querySelector('[data-action="admin_unmute"]').style.display = isMuted ? '' : 'none';
            }
            menu.style.left = Math.min(x, window.innerWidth - 170) + 'px';
            menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
            menu.style.display = '';
        }
        
        function hideContextMenu() {
            $('userContextMenu').style.display = 'none';
            contextMenuTarget = null;
        }
        
        function handleContextAction(action) {
            if (!contextMenuTarget) return;
            const target = contextMenuTarget;
            hideContextMenu();
            switch (action) {
                case 'view_profile':
                    openProfilePanel(target);
                    break;
                case 'add_friend':
                case 'send_friend_request':
                    socket.emit('send_friend_request', { targetId: target.id });
                    break;
                case 'remove_friend':
                    showConfirmDialog(`确定移除好友 ${target.name} 吗？`).then(confirmed => {
                        if (!confirmed) return;
                        socket.emit('remove_friend', { targetId: target.id });
                    });
                    break;
                case 'block_user':
                    showConfirmDialog(`确定屏蔽 ${target.name} 吗？屏蔽后将看不到对方的消息和位置。`).then(confirmed => {
                        if (!confirmed) return;
                        socket.emit('block_user', { targetId: target.id });
                    });
                    break;
                case 'unblock_user':
                    socket.emit('unblock_user', { targetId: target.id });
                    break;
                case 'send_private_message':
                    openDMPanel(target.id, target.name);
                    break;
                case 'admin_mute':
                    showInputDialog(`禁言 ${target.name}，请输入原因（可选）：`, { title: '禁言用户', placeholder: '输入原因...' }).then(muteReason => {
                        if (muteReason === null) return;
                        socket.emit('admin_mute_user', { targetId: target.id, reason: muteReason || '' });
                    });
                    break;
                case 'admin_unmute':
                    socket.emit('admin_unmute_user', { targetId: target.id });
                    break;
                case 'admin_kick':
                    showInputDialog(`踢出 ${target.name}，请输入原因（可选）：`, { title: '踢出用户', placeholder: '输入原因...' }).then(kickReason => {
                        if (kickReason === null) return;
                        socket.emit('admin_kick_user', { targetId: target.id, reason: kickReason || '' });
                    });
                    break;
                case 'admin_ban':
                    showConfirmDialog(`确定封禁 ${target.name} 吗？封禁后该账号将无法登录。`).then(confirmed => {
                        if (!confirmed) return;
                        showInputDialog('请输入封禁原因（可选）：', { title: '封禁账号', placeholder: '输入原因...' }).then(banReason => {
                            if (banReason === null) return;
                            socket.emit('admin_ban_user', { targetId: target.id, reason: banReason || '' });
                        });
                    });
                    break;
                case 'admin_info':
                    openAdminPanel();
                    switchAdminTab('users');
                    socket.emit('admin_get_user_info', { targetId: target.id });
                    break;
            }
        }
        
        let dmTargetId = null;
        
        function openDMPanel(targetId, targetName) {
            dmTargetId = targetId;
            $('dmTargetName').textContent = '私信 · ' + targetName;
            const panel = $('dmPanel');
            panel.style.display = '';
            $('dmMessages').innerHTML = '';
            socket.emit('get_dm_history', { targetId });
            $('dmInput').focus();
        }

        function closeDMPanel() {
            $('dmPanel').style.display = 'none';
            dmTargetId = null;
        }

        let pendingDeleteMessageId = null;
        function showDeleteKeyDialog(messageId) {
            pendingDeleteMessageId = messageId;
            $('deleteKeyInput').value = '';
            $('keyError').style.display = 'none';
            $('deleteKeyDialog').style.display = '';
            $('deleteKeyInput').focus();
        }
        function hideDeleteKeyDialog() { $('deleteKeyDialog').style.display = 'none'; pendingDeleteMessageId = null; }
        function confirmDeleteMessage() {
            const key = $('deleteKeyInput').value.trim();
            if (!key) { $('keyError').style.display = ''; return; }
            socket.emit('admin_delete_message', { messageId: pendingDeleteMessageId, key });
            hideDeleteKeyDialog();
        }

        function openAdminPanel() {
            const panel = $('adminPanel');
            panel.style.display = '';  // 显示面板
            panel.classList.add('open');
            panel.querySelector('.admin-header span').innerHTML = state.isSuperAdmin
                ? '<i class="fa-solid fa-crown" aria-hidden="true"></i> 站长面板'
                : '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i> 管理面板';
            socket.emit('admin_get_lists');
            if (state.isSuperAdmin) socket.emit('admin_get_all_users');
        }
        function closeAdminPanel() {
            const panel = $('adminPanel');
            panel.classList.remove('open');
            setTimeout(() => { panel.style.display = 'none'; }, 300); // 动画结束后隐藏
        }
        function switchAdminTab(tabName) {
            document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            $('tab-' + tabName).classList.add('active');
            document.querySelector(`.admin-tab[data-tab="${tabName}"]`).classList.add('active');
            if (tabName === 'lists') socket.emit('admin_get_lists');
            if (tabName === 'users') socket.emit('admin_get_all_users');
        }
        function renderBannedList(list) {
            const el = $('bannedList');
            if (!list.length) { el.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.8rem">暂无封禁用户</p>'; return; }
            el.innerHTML = list.map(u => `<div class="admin-list-item"><span><span class="name">${escapeHtml(u.nickname || u.user_id)}</span><span class="reason">${u.reason ? '- ' + escapeHtml(u.reason) : ''}</span></span><button class="action-btn" onclick="socket.emit('admin_unban_user',{targetId:'${escapeAttr(u.user_id)}'});this.parentElement.remove()">解封</button></div>`).join('');
        }
        function renderMutedList(list) {
            const el = $('mutedList');
            if (!list.length) { el.innerHTML = '<p style="color:var(--text-tertiary);font-size:0.8rem">暂无禁言用户</p>'; return; }
            el.innerHTML = list.map(u => `<div class="admin-list-item"><span><span class="name">${escapeHtml(u.nickname || u.user_id)}</span><span class="reason">${u.reason ? '- ' + escapeHtml(u.reason) : ''}</span></span><button class="action-btn" onclick="socket.emit('admin_unmute_user',{targetId:'${escapeAttr(u.user_id)}'});this.parentElement.remove()">解禁</button></div>`).join('');
        }
        function renderAllUsers(users) {
            const el = $('adminUserList');
            const q = ($('adminUserSearch').value || '').toLowerCase();
            const filtered = users.filter(u => (u.nickname || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q));
            let tagHtml = '';
            if (state.isSuperAdmin) {
                tagHtml = filtered.map(u => {
                    let tags = '';
                if (u.is_super_admin) tags += '<span class="super-admin-tag"><i class="fa-solid fa-crown" aria-hidden="true"></i>站长</span>';
                else if (u.is_admin) tags += '<span class="admin-tag"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>管理员</span>';
                    let btn = '';
                    if (!u.is_super_admin && u.id !== state.user.id) {
                        btn = u.is_admin
                            ? `<button class="admin-toggle-btn unset" onclick="event.stopPropagation();socket.emit('admin_unset_admin',{targetId:'${escapeAttr(u.id)}'})">取消管理员</button>`
                            : `<button class="admin-toggle-btn set" onclick="event.stopPropagation();socket.emit('admin_set_admin',{targetId:'${escapeAttr(u.id)}'})">设为管理员</button>`;
                    }
                    return `<div class="admin-user-item" onclick="socket.emit('admin_get_user_info',{targetId:'${escapeAttr(u.id)}'})"><div><div class="admin-user-item-name">${escapeHtml(u.nickname)}${tags}</div><div class="admin-user-item-id">@${escapeHtml(u.username)}</div></div>${btn}</div>`;
                }).join('');
            } else {
                tagHtml = filtered.map(u => {
                    let tags = '';
                if (u.is_super_admin) tags += '<span class="super-admin-tag"><i class="fa-solid fa-crown" aria-hidden="true"></i>站长</span>';
                else if (u.is_admin) tags += '<span class="admin-tag"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>管理员</span>';
                    return `<div class="admin-user-item" onclick="socket.emit('admin_get_user_info',{targetId:'${escapeAttr(u.id)}'})"><div><div class="admin-user-item-name">${escapeHtml(u.nickname)}${tags}</div><div class="admin-user-item-id">@${escapeHtml(u.username)}</div></div></div>`;
                }).join('');
            }
            el.innerHTML = tagHtml;
        }
        function renderUserInfo(info) {
            const el = $('adminUserInfo');
            el.style.display = '';
            let roleTag = '';
                if (info.is_super_admin) roleTag = '<span class="super-admin-tag"><i class="fa-solid fa-crown" aria-hidden="true"></i>站长</span>';
                else if (info.is_admin) roleTag = '<span class="admin-tag"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i>管理员</span>';
            let adminBtn = '';
            if (state.isSuperAdmin && !info.is_super_admin && info.id !== state.user.id) {
                adminBtn = info.is_admin
                    ? `<button class="admin-toggle-btn unset" style="margin-top:8px" onclick="socket.emit('admin_unset_admin',{targetId:'${escapeAttr(info.id)}'})">取消管理员身份</button>`
                    : `<button class="admin-toggle-btn set" style="margin-top:8px" onclick="socket.emit('admin_set_admin',{targetId:'${escapeAttr(info.id)}'})">设为管理员</button>`;
            }
            el.innerHTML = `<h4>${escapeHtml(info.nickname)} ${roleTag}</h4>
                <p>用户名: ${escapeHtml(info.username)}</p>
                <p>ID: ${info.id}</p>
                <p>颜色: <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:${info.color};vertical-align:middle"></span> ${info.color}</p>
                <p>签名: ${escapeHtml(info.bio || '无')}</p>
                <p>注册时间: ${new Date(info.created_at).toLocaleString()}</p>
                <p>最后活跃: ${info.last_active ? new Date(info.last_active).toLocaleString() : '未知'}</p>
                <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
                    <input id="editNick" placeholder="新昵称" value="${escapeHtml(info.nickname)}" style="padding:4px 8px;border:1px solid rgba(0,0,0,0.1);border-radius:5px;font-size:0.78rem;width:100px">
                    <input id="editBio" placeholder="新签名" value="${escapeHtml(info.bio || '')}" style="padding:4px 8px;border:1px solid rgba(0,0,0,0.1);border-radius:5px;font-size:0.78rem;width:140px">
                    <button class="admin-btn small" onclick="const n=$('editNick').value,b=$('editBio').value;socket.emit('admin_update_user',{targetId:'${escapeAttr(info.id)}',field:'nickname',value:n});setTimeout(()=>socket.emit('admin_update_user',{targetId:'${escapeAttr(info.id)}',field:'bio',value:b}),200)">保存修改</button>
                </div>
                ${adminBtn}`;
        }
        function showBroadcast(msg) {
            const toast = document.createElement('div');
            toast.className = 'broadcast-toast';
            const icon = document.createElement('i');
            icon.className = 'fa-solid fa-bullhorn';
            icon.setAttribute('aria-hidden', 'true');
            const text = document.createElement('span');
            text.textContent = '[' + msg.fromAdmin + '] ' + msg.content;
            toast.append(icon, text);
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 6000);
        }

        function addDmMessage(msg, isFrom) {
            const container = $('dmMessages');
            const bubble = document.createElement('div');
            bubble.className = 'dm-msg-bubble ' + (isFrom ? 'dm-msg-from' : 'dm-msg-to');
            bubble.innerHTML = `<div>${escapeHtml(msg.content)}</div><div class="dm-msg-time">${formatTime(msg.timestamp)}</div>`;
            container.appendChild(bubble);
            container.scrollTop = container.scrollHeight;
        }
        
        function sendDM() {
            const input = $('dmInput');
            const content = input.value.trim();
            if (!content || !dmTargetId) return;
            socket.emit('send_private_message', { targetId: dmTargetId, content });
            addDmMessage({ content, timestamp: Date.now() }, false);
            input.value = '';
        }
        
        function compressAvatar(base64, maxSize) {
            if (!base64) return null;
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => {
                    const size = Math.min(maxSize, img.width, img.height);
                    const canvas = document.createElement('canvas');
                    canvas.width = size;
                    canvas.height = size;
                    const c = canvas.getContext('2d');
                    c.drawImage(img, 0, 0, size, size);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = () => resolve(base64);
                img.src = base64;
            });
        }
        
        function preMeasureMessage(msg) {
            const roleKey = `${!!msg.authorIsAdmin}:${!!msg.authorIsSuperAdmin}`;
            if (msgMeasureCache.has(msg.id) && msgMeasureCache.get(msg.id).content === msg.content && msgMeasureCache.get(msg.id).roleKey === roleKey) return;
            const mCtx = ctx || { measureText: t => ({ width: t.length * 15 }) };
            mCtx.font = '14px -apple-system, "Noto Sans SC", sans-serif';
            
            const content = msg.content || '';
            const maxWidth = 260;
            const lines = [];
            let currentLine = '';
            for (let j = 0; j < content.length; j++) {
                const char = content[j];
                const testLine = currentLine + char;
                if (mCtx.measureText(testLine).width > maxWidth) {
                    if (currentLine) { lines.push(currentLine); }
                    currentLine = char;
                } else { currentLine = testLine; }
            }
            if (currentLine) lines.push(currentLine);
            if (!lines.length) lines.push('');
            
            const isLong = content.length > 50 || lines.length > 2;
            const padX = 16;
            const padY = 10;
            const roleLabel = msg.authorIsSuperAdmin ? '站长' : msg.authorIsAdmin ? '管理员' : '';
            const padTop = padY;
            const padBottom = roleLabel ? 10 : padY;
            const roleLabelGap = roleLabel ? 3 : 0;
            const roleLabelHeight = roleLabel ? 12 : 0;
            const lineHeight = 20;
            const actualLines = isLong ? Math.min(lines.length, 2) : lines.length;
            let maxLineWidth = 0;
            for (let j = 0; j < actualLines; j++) {
                maxLineWidth = Math.max(maxLineWidth, mCtx.measureText(lines[j]).width);
            }
            if (isLong) {
                mCtx.font = '500 11px -apple-system, "Noto Sans SC", sans-serif';
                maxLineWidth = Math.max(maxLineWidth, mCtx.measureText('点击查看全文').width);
            }
            if (roleLabel) {
                mCtx.font = '600 9px -apple-system, "Noto Sans SC", sans-serif';
                maxLineWidth = Math.max(maxLineWidth, mCtx.measureText(roleLabel).width);
            }
            msgMeasureCache.set(msg.id, { 
                lines, 
                bubbleW: Math.max(maxLineWidth + padX * 2, 80), 
                bubbleH: (actualLines + (isLong ? 1 : 0)) * lineHeight + padTop + roleLabelGap + roleLabelHeight + padBottom,
                isLong, padX, padY, padTop, padBottom, lineHeight, roleLabel, roleKey, content
            });
        }
