// Application bootstrap, input handling, and Canvas renderer.

        let initialized = false;
        const gridBackgroundCache = document.createElement('canvas');
        const softThemeColorCache = new Map();
        let gridBackgroundCacheWidth = 0;
        let gridBackgroundCacheHeight = 0;
        let lastRenderTime = 0;
        const IDLE_RENDER_INTERVAL_MS = 1000 / 30;
        const ACTIVE_RENDER_INTERVAL_MS = 1000 / 60;
        
        function init() {
            if (initialized) return;
            initialized = true;
            
            resizeCanvas();
            window.addEventListener('resize', resizeCanvas);
            requestAnimationFrame(gameLoop);
        }

        // 等DOM加载完成后再设置事件监听器（只调用一次）
        document.addEventListener('DOMContentLoaded', () => {
            setupEventListeners();
            // 初始化移动端适配系统
             try {
                 mobileAdapter = Object.create(MobileAdapter);
                 mobileAdapter.init();

                // 确保立即执行一次布局计算
                setTimeout(() => {
                    if (mobileAdapter && mobileAdapter.isMobile) {
                        mobileAdapter.updateLayout();
                    console.log('移动端布局初始化完成');
                    }
                }, 200);
             } catch (e) {
                     console.error('移动端适配初始化失败:', e);
             }

             restoreSessionFromStorage();

            // 注册Service Worker（PWA支持）
            if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                    navigator.serviceWorker.register('/sw.js')
                        .then((registration) => {
                        console.log('Service Worker 注册成功:', registration.scope);
                        })
                        .catch((error) => {
                            console.log('Service Worker 注册失败:', error);
                        });
                });
            }
        });
        
        function resizeCanvas() {
            const w = window.innerWidth;
            const h = window.innerHeight;

            // 设置Canvas尺寸
            canvas.width = w;
            canvas.height = h;
            gridBackgroundCacheWidth = 0;
            gridBackgroundCacheHeight = 0;

            // 更新state
            state.viewport.width = w;
            state.viewport.height = h;

            // 移动端优化
            if (mobileAdapter?.isMobile) {
                MAX_RENDER_MESSAGES = 50;
                if (mobileAdapter?.layout) {
                    mobileAdapter.layout.calculate();
                }
            } else {
                MAX_RENDER_MESSAGES = 50;
            }
        }
        
        function setupEventListeners() {
            setupInteractionDialog();
            $('loginButton').dataset.originalText = '登录';
            $('registerButton').dataset.originalText = '注册并进入';
            $('guestEnterButton').dataset.originalText = '进入世界';
            $('saveProfileBtn').dataset.originalText = '保存';
            
            $('loginButton').addEventListener('click', handleLogin);
            $('registerButton').addEventListener('click', handleRegister);
            $('guestEnterButton').addEventListener('click', handleGuestEnter);
            
            $('loginPassword').addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
            $('regPassword').addEventListener('keypress', e => { if (e.key === 'Enter') handleRegister(); });
            $('guestNickname').addEventListener('keypress', e => { if (e.key === 'Enter') handleGuestEnter(); });
            
            $('avatarInput').addEventListener('change', e => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = ev => {
                        const preview = document.querySelector('#registerPanel .avatar-inner');
                        preview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                        state.user.avatar = ev.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
            
            $('guestAvatarInput').addEventListener('change', e => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = ev => {
                        const preview = document.querySelector('#guestPanel .avatar-inner');
                        preview.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                        state.user.avatar = ev.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            });
            
            $('profileAvatarInput').addEventListener('change', e => {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = ev => {
                        state.user.avatar = ev.target.result;
                        updateProfileAvatarDisplay();
                    };
                    reader.readAsDataURL(file);
                }
            });
            
             $('saveProfileBtn').addEventListener('click', saveProfile);
             $('logoutBtn').addEventListener('click', logout);
             document.querySelectorAll('.friends-tab').forEach(tab => {
                 tab.addEventListener('click', () => switchFriendsTab(tab.dataset.friendsTab));
             });
             $('friendsQuickBtn').addEventListener('click', e => {
                e.stopPropagation();
                openFriendsPanel();
            });
            $('portalQuickBtn').addEventListener('click', e => {
                e.stopPropagation();
                openPortalPanel();
            });
            $('createPortalBtn').addEventListener('click', createPortalFromPanel);
            $('portalDetailCloseBtn').addEventListener('click', closePortalDetail);
            $('portalDetailDialog').addEventListener('click', e => {
                if (e.target === $('portalDetailDialog')) closePortalDetail();
            });
            $('portalUseBtn').addEventListener('click', useSelectedPortal);
            $('portalEditBtn').addEventListener('click', editSelectedPortal);
            $('portalDeleteBtn').addEventListener('click', deleteSelectedPortal);
            
            document.querySelectorAll('.context-menu-item').forEach(item => {
                item.addEventListener('click', () => handleContextAction(item.dataset.action));
            });
            
            $('coordinatesDisplay').addEventListener('click', () => {
                $('teleportX').value = Math.round(state.user.x);
                $('teleportY').value = Math.round(-state.user.y);
                teleportDialog.classList.add('active');
                state.movementDisabled = true;
            });
            
            $('teleportConfirm').addEventListener('click', teleport);
            $('teleportCancel').addEventListener('click', () => { 
                teleportDialog.classList.remove('active'); 
                state.movementDisabled = false; 
            });
            $('teleportX').addEventListener('keypress', e => { if (e.key === 'Enter') teleport(); });
            $('teleportY').addEventListener('keypress', e => { if (e.key === 'Enter') teleport(); });
            teleportDialog.addEventListener('click', e => { 
                if (e.target === teleportDialog) {
                    teleportDialog.classList.remove('active');
                    state.movementDisabled = false;
                }
            });
            
            window.addEventListener('keydown', e => {
                state.keys[e.key.toLowerCase()] = true;
                if (isTypingInInput()) return;
                if (e.key.toLowerCase() === 't' && !messageInputContainer.classList.contains('active') && !state.movementDisabled && state.user.id) {
                    e.preventDefault();
                    messageInputContainer.classList.add('active');
                    messageInput.focus();
                }
                if (e.key === 'Escape') {
                    messageInputContainer.classList.remove('active');
                    messageInput.blur();
                    messageInput.value = '';
                    hideContextMenu();
                    if ($('profilePanel').classList.contains('open')) closeProfilePanel();
                    if ($('friendsPanel').classList.contains('open')) closeFriendsPanel();
                    if ($('portalPanel').classList.contains('open')) closePortalPanel();
                    if ($('portalDetailDialog').classList.contains('active')) closePortalDetail();
                }
                if (e.key.toLowerCase() === 'h' && state.user.id) {
                    const hint = document.querySelector('.controls-hint');
                    hint.classList.toggle('hint-hidden');
                }
            });
            window.addEventListener('keyup', e => { state.keys[e.key.toLowerCase()] = false; });
            
            canvas.addEventListener('wheel', e => {
                e.preventDefault();
                state.viewport.scale = Math.max(0.6, Math.min(3, state.viewport.scale * (e.deltaY > 0 ? 0.9 : 1.1)));
                state.viewport.x = state.user.x;
                state.viewport.y = state.user.y;
            });
            canvas.addEventListener('click', handleCanvasClick);
            
            document.addEventListener('click', e => {
                const menu = $('userContextMenu');
                if (menu.style.display !== 'none' && !menu.contains(e.target)) {
                    hideContextMenu();
                }
            });
            
            $('sendButton').addEventListener('click', sendMessage);
            $('cancelButton').addEventListener('click', () => { 
                messageInputContainer.classList.remove('active'); 
                messageInput.blur();
                messageInput.value = ''; 
            });
            messageInput.addEventListener('keypress', e => { 
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendMessage();
                }
            });
            
            $('closeDetail').addEventListener('click', () => messageDetail.classList.remove('active'));
            messageDetail.addEventListener('click', e => { if (e.target === messageDetail) messageDetail.classList.remove('active'); });
            
            $('dmCloseBtn').addEventListener('click', closeDMPanel);
            $('dmClearBtn').addEventListener('click', () => {
                if (!dmTargetId) return;
                showConfirmDialog('确定清空与该用户的全部私聊记录吗？此操作不可恢复。').then(confirmed => {
                    if (!confirmed) return;
                    socket.emit('clear_dm_history', { targetId: dmTargetId });
                    $('dmMessages').innerHTML = '';
                });
            });
            $('dmSendBtn').addEventListener('click', sendDM);
            $('dmInput').addEventListener('keypress', e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    sendDM();
                }
            });

            $('adminCloseBtn').addEventListener('click', closeAdminPanel);
            document.querySelectorAll('.admin-tab').forEach(tab => {
                tab.addEventListener('click', () => switchAdminTab(tab.dataset.tab));
            });
            $('sendBroadcastBtn').addEventListener('click', () => {
                const content = $('broadcastInput').value.trim();
                if (!content) return;
                socket.emit('admin_broadcast', { content });
                $('broadcastInput').value = '';
            });
            $('refreshUsersBtn').addEventListener('click', () => socket.emit('admin_get_all_users'));
            $('refreshListsBtn').addEventListener('click', () => socket.emit('admin_get_lists'));
            $('cleanupBtn').addEventListener('click', () => {
                showConfirmDialog(`确定清理超过 ${$('cleanupDays').value} 天未活跃的用户数据吗？`).then(confirmed => {
                    if (!confirmed) return;
                    socket.emit('admin_cleanup', { days: parseInt($('cleanupDays').value) || 30 });
                });
            });
            $('clearMsgBtn').addEventListener('click', () => {
                showConfirmDialog('确定清空所有聊天记录吗？此操作不可恢复！').then(confirmed => {
                    if (!confirmed) return;
                    socket.emit('admin_clear_messages');
                });
            });
            $('kickGuestsBtn').addEventListener('click', () => {
                showConfirmDialog('确定注销所有游客账号吗？游客将被立即踢下线，其数据将被永久删除！').then(confirmed => {
                    if (!confirmed) return;
                    socket.emit('admin_kick_guests');
                });
            });
            $('keyCancelBtn').addEventListener('click', hideDeleteKeyDialog);
            $('keyConfirmBtn').addEventListener('click', confirmDeleteMessage);
            $('deleteKeyDialog').addEventListener('click', e => { if (e.target === $('deleteKeyDialog')) hideDeleteKeyDialog(); });
            $('deleteKeyInput').addEventListener('keypress', e => { if (e.key === 'Enter') confirmDeleteMessage(); if (e.key === 'Escape') hideDeleteKeyDialog(); });

            document.addEventListener('contextmenu', e => {
                const msgEl = e.target.closest('.msg-bubble');
                if (msgEl && state.isAdmin && msgEl.dataset.id && msgEl.dataset.authorId !== state.user.id) {
                    e.preventDefault();
                    showDeleteKeyDialog(msgEl.dataset.id);
                }
            });
        }
        
        function teleport() {
            const x = parseInt($('teleportX').value);
            const y = parseInt($('teleportY').value);
            if (!isNaN(x) && !isNaN(y)) {
                const internalY = -y;
                state.user.x = x; state.user.y = internalY;
                state.viewport.x = x; state.viewport.y = internalY;
                socket.emit('move', { x, y: internalY });
                teleportDialog.classList.remove('active');
                state.movementDisabled = false;
            }
        }
        
        function sendMessage() {
            const content = messageInput.value.trim();
            if (!content) return;
            socket.emit('send_message', { 
                content, 
                x: state.user.x, 
                y: state.user.y, 
                friendOnly: $('friendOnlyToggle').checked 
            });
            messageInput.blur();
            messageInputContainer.classList.remove('active');
            messageInput.value = '';
        }
        
        function handleCanvasClick(e) {
            if (messageInputContainer.classList.contains('active')) return;
            hideContextMenu();
            const worldX = (e.clientX - state.viewport.width / 2) / state.viewport.scale + state.viewport.x;
            const worldY = (e.clientY - state.viewport.height / 2) / state.viewport.scale + state.viewport.y;

            const portal = (state.portals || []).reduce((nearest, item) => {
                const distance = Math.hypot(item.x - worldX, item.y - worldY);
                if (distance >= 48 / state.viewport.scale) return nearest;
                return !nearest || distance < nearest.distance ? { portal: item, distance } : nearest;
            }, null);
            if (portal) {
                openPortalDetail(portal.portal);
                return;
            }
            
            for (const user of state.otherUsers) {
                const dist = Math.hypot(user.x - worldX, user.y - worldY);
                if (dist < 40 / state.viewport.scale) {
                    showContextMenu(e.clientX, e.clientY, user);
                    e.stopPropagation();
                    return;
                }
            }
            
            const sorted = [...state.messages].sort((a, b) => {
                const distA = Math.hypot(a.x - state.user.x, a.y - state.user.y);
                const distB = Math.hypot(b.x - state.user.x, b.y - state.user.y);
                return distA - distB;
            });
            
            for (const msg of sorted) {
                if (msg.bubbleWidth && msg.bubbleHeight) {
                    if (Math.abs(worldX - msg.x) < msg.bubbleWidth/2 && Math.abs(worldY - msg.y) < msg.bubbleHeight/2) {
                        $('detailAuthor').textContent = msg.author;
                        $('detailContent').textContent = msg.content;
                        $('detailTime').textContent = formatTime(msg.timestamp);
                        messageDetail.classList.add('active');
                        return;
                    }
                }
            }
        }
        
        function updateUserCard() {
            const card = $('userCard');
            if (!state.user.id) { card.style.display = 'none'; return; }
            card.style.display = 'flex';
            $('userCardName').textContent = state.user.name;
            if (state.user.avatar) {
                $('userCardAvatar').src = state.user.avatar;
                $('userCardAvatar').style.display = 'block';
            } else {
                $('userCardAvatar').style.display = 'none';
            }
        }

        function updateOnlineCount() {
            onlineCount.textContent = state.otherUsers.length + (state.user.id ? 1 : 0);
        }
        
        function formatTime(ts) {
            const d = new Date(ts), now = new Date();
            if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            const y = new Date(now); y.setDate(y.getDate()-1);
            if (d.toDateString() === y.toDateString()) return '昨天 ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
            return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        }
        
        let lastCoordUpdate = 0;
        const COORD_UPDATE_MS = 80;
        
        function gameLoop(now) {
            const moved = updateUserPosition();
            const renderInterval = moved ? ACTIVE_RENDER_INTERVAL_MS : IDLE_RENDER_INTERVAL_MS;
            if (document.visibilityState !== 'hidden' && now - lastRenderTime >= renderInterval) {
                render();
                lastRenderTime = now;
            }
            if (now - lastCoordUpdate >= COORD_UPDATE_MS) {
                xCoord.textContent = Math.round(state.user.x);
                yCoord.textContent = Math.round(-state.user.y);
                lastCoordUpdate = now;
            }
            requestAnimationFrame(gameLoop);
        }
        
        let lastMoveX = 0, lastMoveY = 0;
        let lastMoveTime = 0;
        const MOVE_THROTTLE_MS = 50;
        const MOVE_THRESHOLD = 0.15;
        
        function updateUserPosition() {
            if (state.movementDisabled || !state.user.id) return false;
            if (isTypingInInput()) return false;

            const speed = 5 / state.viewport.scale;
            let moved = false;

            // 检测是否为移动端，使用摇杆控制
            if (mobileAdapter && mobileAdapter.isMobile) {
                const joystickInput = mobileAdapter.getJoystickInput();

                if (joystickInput.x !== 0 || joystickInput.y !== 0) {
                    state.user.x += joystickInput.x * speed;
                    state.user.y += joystickInput.y * speed;
                    state.viewport.x = state.user.x;
                    state.viewport.y = state.user.y;
                    moved = true;
                }
            } else {
                // 桌面端：键盘控制
                if (state.keys['w'] || state.keys['arrowup']) { state.user.y -= speed; state.viewport.y -= speed; moved = true; }
                if (state.keys['s'] || state.keys['arrowdown']) { state.user.y += speed; state.viewport.y += speed; moved = true; }
                if (state.keys['a'] || state.keys['arrowleft']) { state.user.x -= speed; state.viewport.x -= speed; moved = true; }
                if (state.keys['d'] || state.keys['arrowright']) { state.user.x += speed; state.viewport.x += speed; moved = true; }
            }

            if (moved) {
                const now = performance.now();
                const dx = state.user.x - lastMoveX;
                const dy = state.user.y - lastMoveY;
                if ((now - lastMoveTime >= MOVE_THROTTLE_MS) && (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD)) {
                    socket.emit('move', { x: state.user.x, y: state.user.y });
                    lastMoveX = state.user.x;
                    lastMoveY = state.user.y;
                    lastMoveTime = now;
                }
            }
            return moved;
        }
        
        function worldToScreen(wx, wy) {
            return [
                (wx - state.viewport.x) * state.viewport.scale + state.viewport.width / 2,
                (wy - state.viewport.y) * state.viewport.scale + state.viewport.height / 2
            ];
        }

        function getSoftThemeColor(rawColor) {
            const hex = String(rawColor || '#007aff').replace('#', '').trim();
            if (softThemeColorCache.has(hex)) return softThemeColorCache.get(hex);
            if (!/^[0-9a-f]{6}$/i.test(hex)) {
                const fallback = 'hsl(214, 35%, 93%)';
                softThemeColorCache.set(hex, fallback);
                return fallback;
            }

            const red = parseInt(hex.slice(0, 2), 16);
            const green = parseInt(hex.slice(2, 4), 16);
            const blue = parseInt(hex.slice(4, 6), 16);
            const max = Math.max(red, green, blue) / 255;
            const min = Math.min(red, green, blue) / 255;
            const delta = max - min;
            const lightness = (max + min) / 2;
            const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
            let hue = 0;

            if (delta !== 0) {
                if (max === red / 255) hue = 60 * (((green - blue) / 255 / delta) % 6);
                else if (max === green / 255) hue = 60 * (((blue - red) / 255 / delta) + 2);
                else hue = 60 * (((red - green) / 255 / delta) + 4);
            }

            hue = Math.round((hue + 360) % 360);
            const softSaturation = Math.round(Math.max(35, Math.min(55, saturation * 100 * 0.55)));
            const softColor = `hsl(${hue}, ${softSaturation}%, 92%)`;
            softThemeColorCache.set(hex, softColor);
            return softColor;
        }

        function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            renderGrid();
            renderPortals();
            renderMessages();
            renderOtherUsers();
            if (state.user.id) renderCurrentUser();
        }
        
        function renderGrid() {
            const gridSize = 50;
            const scale = state.viewport.scale;
            const vw = state.viewport.width / scale;
            const vh = state.viewport.height / scale;
            const extend = 4;
            const parallax = 0.65;
            
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            
            if (gridBackgroundCacheWidth !== state.viewport.width || gridBackgroundCacheHeight !== state.viewport.height) {
                gridBackgroundCache.width = state.viewport.width;
                gridBackgroundCache.height = state.viewport.height;
                const backgroundCtx = gridBackgroundCache.getContext('2d');
                const bgGrad = backgroundCtx.createRadialGradient(
                    state.viewport.width / 2, state.viewport.height / 2, 0,
                    state.viewport.width / 2, state.viewport.height / 2,
                    Math.max(state.viewport.width, state.viewport.height) * 0.8
                );
                bgGrad.addColorStop(0, '#edf0f6');
                bgGrad.addColorStop(1, '#d8deea');
                backgroundCtx.fillStyle = bgGrad;
                backgroundCtx.fillRect(0, 0, state.viewport.width, state.viewport.height);
                gridBackgroundCacheWidth = state.viewport.width;
                gridBackgroundCacheHeight = state.viewport.height;
            }
            ctx.drawImage(gridBackgroundCache, 0, 0);
            
            const coverW = vw / parallax;
            const coverH = vh / parallax;
            const worldStartX = Math.floor((state.viewport.x - coverW / 2) / gridSize) * gridSize - extend * gridSize;
            const worldStartY = Math.floor((state.viewport.y - coverH / 2) / gridSize) * gridSize - extend * gridSize;
            const numX = Math.ceil(coverW / gridSize) + extend * 2 + 1;
            const numY = Math.ceil(coverH / gridSize) + extend * 2 + 1;
            
            const sc = scale * parallax;
            const cx = state.viewport.width / 2;
            const cy = state.viewport.height / 2;
            const screenMaxX = state.viewport.width + gridSize;
            const screenMaxY = state.viewport.height + gridSize;

            // Draw straight world-aligned lines so the background remains a grid at every zoom level.
            ctx.strokeStyle = 'rgba(72, 82, 115, 0.16)';
            ctx.lineWidth = Math.max(0.6, Math.min(1.4, scale * 0.8));
            ctx.beginPath();
            for (let i = 0; i <= numX; i++) {
                const wx = worldStartX + i * gridSize;
                const sx = (wx - state.viewport.x) * sc + cx;
                if (sx < -gridSize || sx > screenMaxX) continue;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, state.viewport.height);
            }
            for (let j = 0; j <= numY; j++) {
                const wy = worldStartY + j * gridSize;
                const sy = (wy - state.viewport.y) * sc + cy;
                if (sy < -gridSize || sy > screenMaxY) continue;
                ctx.moveTo(0, sy);
                ctx.lineTo(state.viewport.width, sy);
            }
            ctx.stroke();
            
            ctx.restore();
        }

        function portalRgb(color) {
            const hex = String(color || '#007aff').replace('#', '');
            if (!/^[0-9a-f]{6}$/i.test(hex)) return [0, 122, 255];
            return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
        }

        function renderPortals() {
            const visibleRadius = Math.max(state.viewport.width, state.viewport.height) / state.viewport.scale / 2 * 1.5;
            const scale = state.viewport.scale;
            const now = performance.now();
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            for (const portal of (state.portals || [])) {
                if (Math.hypot(portal.x - state.viewport.x, portal.y - state.viewport.y) > visibleRadius) continue;
                const [sx, sy] = worldToScreen(portal.x, portal.y);
                const [red, green, blue] = portalRgb(portal.color);
                const radius = 27 * scale;
                const pulse = 1 + Math.sin(now / 520 + portal.x * 0.01) * 0.06;
                const ringRadius = radius * pulse;

                ctx.save();
                ctx.shadowColor = `rgba(${red}, ${green}, ${blue}, 0.34)`;
                ctx.shadowBlur = 18 * scale;
                ctx.beginPath();
                ctx.arc(sx, sy, ringRadius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${red}, ${green}, ${blue}, 0.12)`;
                ctx.fill();
                ctx.shadowColor = 'transparent';

                ctx.lineWidth = Math.max(2, 3.2 * scale);
                ctx.strokeStyle = `rgba(${red}, ${green}, ${blue}, 0.88)`;
                ctx.beginPath();
                ctx.arc(sx, sy, ringRadius, 0, Math.PI * 2);
                ctx.stroke();

                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(now / 1800);
                ctx.lineWidth = Math.max(1.5, 2 * scale);
                ctx.strokeStyle = `rgba(255, 255, 255, 0.82)`;
                ctx.beginPath();
                ctx.arc(0, 0, ringRadius - 5 * scale, -0.7, 0.65);
                ctx.stroke();
                ctx.rotate(Math.PI);
                ctx.beginPath();
                ctx.arc(0, 0, ringRadius - 5 * scale, -0.7, 0.65);
                ctx.stroke();
                ctx.restore();

                ctx.fillStyle = `rgba(255, 255, 255, 0.88)`;
                ctx.beginPath();
                ctx.arc(sx, sy, Math.max(3, 5 * scale), 0, Math.PI * 2);
                ctx.fill();

                const labelSize = Math.max(9, Math.min(12 * scale, 16));
                ctx.font = `600 ${labelSize}px -apple-system, "Noto Sans SC", sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = `rgba(29, 29, 31, ${0.82})`;
                ctx.fillText(portal.name, sx, sy + ringRadius + 7 * scale);
                ctx.font = `500 ${Math.max(8, labelSize * 0.78)}px -apple-system, "Noto Sans SC", sans-serif`;
                ctx.fillStyle = `rgba(75, 85, 99, ${0.72})`;
                ctx.fillText(`X:${Math.round(portal.targetX)} Y:${Math.round(-portal.targetY)}`, sx, sy + ringRadius + (labelSize + 9) * scale);
                ctx.restore();
            }
            ctx.restore();
        }
        
        function renderMessages() {
            const visibleRadius = Math.max(state.viewport.width, state.viewport.height) / state.viewport.scale / 2 * 1.5;
            const scale = state.viewport.scale;
            
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            
            ctx.font = `${14 * scale}px -apple-system, "Noto Sans SC", sans-serif`;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            
            let rendered = 0;
            const firstMessageIndex = Math.max(0, state.messages.length - MAX_RENDER_MESSAGES);
            for (let i = firstMessageIndex; i < state.messages.length && rendered < MAX_RENDER_MESSAGES; i++) {
                const msg = state.messages[i];
                const dist = Math.hypot(msg.x - state.viewport.x, msg.y - state.viewport.y);
                if (dist > visibleRadius) continue;
                
                const cached = msgMeasureCache.get(msg.id);
                if (!cached) { preMeasureMessage(msg); continue; }
                
                const { lines, bubbleW, bubbleH, isLong, padX, padTop, padBottom, lineHeight, roleLabel } = cached;
                const alpha = 0.9;
                
                const rawColor = msg.authorColor || msg.color || '#007aff';
                const hex = rawColor.replace('#', '');
                const cr = parseInt(hex.substr(0, 2), 16);
                const cg = parseInt(hex.substr(2, 2), 16);
                const cb = parseInt(hex.substr(4, 2), 16);
                
                const [sbx, sby] = worldToScreen(msg.x, msg.y);
                // Measurements are stored in world pixels; convert every dimension with the same viewport scale.
                const sbW = bubbleW * scale;
                const sbH = bubbleH * scale;
                const bx = sbx - sbW / 2;
                const by = sby - sbH / 2;
                const r = Math.min(sbH / 2, 10 * scale);
                
                ctx.save();

                ctx.shadowColor = `rgba(31, 41, 55, ${0.07 * alpha})`;
                ctx.shadowBlur = 4 * scale;
                ctx.shadowOffsetY = 1.5 * scale;
                ctx.beginPath();
                ctx.roundRect(bx, by, sbW, sbH, r);
                if (msg.authorIsSuperAdmin || msg.authorIsAdmin) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
                } else {
                    ctx.fillStyle = getSoftThemeColor(rawColor);
                }
                ctx.fill();
                ctx.shadowColor = 'transparent';

                ctx.font = `${14 * scale}px -apple-system, "Noto Sans SC", sans-serif`;
                ctx.fillStyle = `rgba(28, 28, 30, ${alpha * 0.92})`;
                const startX = bx + padX * scale;
                const startY = by + padTop * scale;
                const scaledLH = lineHeight * scale;
                
                const renderLines = isLong ? Math.min(lines.length, 2) : lines.length;
                for (let li = 0; li < renderLines; li++) {
                    ctx.fillText(lines[li], startX, startY + li * scaledLH);
                }
                
                if (isLong) {
                    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.8})`;
                    ctx.font = `500 ${11 * scale}px -apple-system, "Noto Sans SC"`;
                    ctx.fillText('点击查看全文', startX, startY + renderLines * scaledLH - scale);
                }

                if (roleLabel) {
                    ctx.font = `600 ${9 * scale}px -apple-system, "Noto Sans SC", sans-serif`;
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'alphabetic';
                    ctx.fillStyle = msg.authorIsSuperAdmin
                        ? `rgba(154, 103, 0, ${alpha * 0.82})`
                        : `rgba(194, 65, 12, ${alpha * 0.78})`;
                    ctx.fillText(roleLabel, bx + sbW - padX * scale, by + sbH - padBottom * scale);
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                }
                
                ctx.restore();
                
                msg.bubbleWidth = bubbleW;
                msg.bubbleHeight = bubbleH;
                rendered++;
            }
            
            ctx.restore();
        }
        
        function renderOtherUsers() {
            const visibleRadius = Math.max(state.viewport.width, state.viewport.height) / state.viewport.scale / 2 * 1.5;
            const scale = state.viewport.scale;
            
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            
            for (const user of state.otherUsers) {
                const dist = Math.hypot(user.x - state.viewport.x, user.y - state.viewport.y);
                if (dist > visibleRadius) continue;
                
                const distToUser = Math.hypot(user.x - state.user.x, user.y - state.user.y);
                const baseScale = Math.max(0.4, Math.min(1.5, 1 / (distToUser * 0.001 + 0.6)));
                const userSize = Math.min(22 * baseScale * scale, 60);
                const alpha = 0.9;
                const isFriend = myFriends.some(f => f.id === user.id);
                
                const [sux, suy] = worldToScreen(user.x, user.y);
                
                const hex = user.color.replace('#', '');
                const cr = parseInt(hex.substr(0, 2), 16);
                const cg = parseInt(hex.substr(2, 2), 16);
                const cb = parseInt(hex.substr(4, 2), 16);
                
                if (isFriend) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(sux, suy, userSize + 4 * scale, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${0.25 * alpha})`;
                    ctx.fill();
                    ctx.restore();
                }
                
                if (user.avatar) {
                    let img = userAvatars.get(user.avatar);
                    if (!img) {
                        img = new Image();
                        img.src = user.avatar;
                        userAvatars.set(user.avatar, img);
                    }
                    if (img.complete) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(sux, suy, userSize, 0, Math.PI * 2);
                        ctx.clip();
                        ctx.drawImage(img, sux - userSize, suy - userSize, userSize * 2, userSize * 2);
                        ctx.restore();
                        
                        ctx.beginPath();
                        ctx.arc(sux, suy, userSize, 0, Math.PI * 2);
                        if (isFriend) {
                            ctx.strokeStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
                            ctx.lineWidth = Math.min(2.5 * scale, 5);
                        } else {
                            ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 * alpha})`;
                            ctx.lineWidth = Math.min(1.5 * scale, 4);
                        }
                        ctx.stroke();
                    } else {
                        ctx.beginPath();
                        ctx.arc(sux, suy, userSize, 0, Math.PI * 2);
                        ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
                        ctx.fill();
                        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
                        ctx.font = `bold ${userSize * 0.7}px "Noto Sans SC"`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(user.name.charAt(0), sux, suy);
                    }
                } else {
                    ctx.beginPath();
                    ctx.arc(sux, suy, userSize, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
                    ctx.fill();
                    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.95})`;
                    ctx.font = `bold ${userSize * 0.7}px "Noto Sans SC"`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(user.name.charAt(0), sux, suy);
                }
                
                const nameSize = Math.max(10, Math.min(12 * scale, 18));
                ctx.font = `${nameSize}px -apple-system, "Noto Sans SC"`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                if (user.isSuperAdmin) {
                    ctx.fillStyle = `rgba(234, 179, 8, ${alpha})`;
                    ctx.font = `${Math.round(nameSize)}px -apple-system, "Noto Sans SC", sans-serif`;
                    ctx.fillText(user.name + ' 站长', sux, suy + userSize + 5 * scale);
                } else if (user.isAdmin) {
                    ctx.fillStyle = `rgba(249, 115, 22, ${alpha})`;
                    ctx.font = `${Math.round(nameSize)}px -apple-system, "Noto Sans SC", sans-serif`;
                    ctx.fillText(user.name + ' 管理员', sux, suy + userSize + 5 * scale);
                } else if (isFriend) {
                    ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
                    ctx.font = `${nameSize}px -apple-system, "Noto Sans SC", sans-serif`;
                    ctx.font = `${Math.round(nameSize)}px -apple-system, "Noto Sans SC", sans-serif`;
                    ctx.fillText(user.name, sux, suy + userSize + 5 * scale);
                } else {
                    ctx.fillStyle = `rgba(29, 29, 31, ${alpha})`;
                    ctx.fillText(user.name, sux, suy + userSize + 5 * scale);
                }
            }
            
            ctx.restore();
        }
        
        function renderCurrentUser() {
            const scale = state.viewport.scale;
            
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            
            const [sux, suy] = worldToScreen(state.user.x, state.user.y);
            const crossSize = Math.max(8, Math.min(18, scale * 12));
            const gap = crossSize * 0.35;
            const thick = Math.max(1.5, scale * 1.5);
            
            ctx.strokeStyle = state.user.color;
            ctx.lineWidth = thick;
            ctx.lineCap = 'round';
            ctx.globalAlpha = 0.85;
            
            ctx.beginPath();
            ctx.moveTo(sux - crossSize, suy);
            ctx.lineTo(sux - gap, suy);
            ctx.moveTo(sux + gap, suy);
            ctx.lineTo(sux + crossSize, suy);
            ctx.moveTo(sux, suy - crossSize);
            ctx.lineTo(sux, suy - gap);
            ctx.moveTo(sux, suy + gap);
            ctx.lineTo(sux, suy + crossSize);
            ctx.stroke();
            
            ctx.globalAlpha = 0.25;
            ctx.lineWidth = thick * 2.5;
            ctx.beginPath();
            ctx.arc(sux, suy, crossSize * 0.6, 0, Math.PI * 2);
            ctx.stroke();
            
            ctx.restore();
        }
