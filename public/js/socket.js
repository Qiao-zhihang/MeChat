// Socket.IO event wiring.

        const $ = id => document.getElementById(id);
        const $$ = selector => document.querySelectorAll(selector);
        const entryScreen = $('entryScreen');
        const messageInputContainer = $('messageInputContainer');
        const messageInput = $('messageInput');
        const onlineCount = $('onlineCount');
        const xCoord = $('xCoord');
        const yCoord = $('yCoord');
        const teleportDialog = $('teleportDialog');
        const messageDetail = $('messageDetail');

        function compareMessages(a, b) {
            const timeDiff = (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0);
            return timeDiff || String(a.id).localeCompare(String(b.id));
        }
        
        socket.on('connect', () => {
            console.log('已连接服务器');
            document.querySelectorAll('.enter-btn').forEach(btn => { btn.disabled = false; });
        });
        
        socket.on('disconnect', () => {
            console.log('断开连接');
        });
        
        socket.on('connect_error', () => {
            console.log('无法连接到服务器');
        });
        
        socket.on('reconnect', () => {
            console.log('重新连接服务器');
            if (state.user.id) {
                doSocketRegister(state.user.avatar);
            }
        });
        
        socket.on('registered', data => {
            document.querySelectorAll('.enter-btn').forEach(btn => setButtonLoading(btn, false));
            if (!data.success) {
                if (restoringSession) {
                    restoringSession = false;
                    clearStoredSession();
                    state.user.id = null;
                }
                showToast(data.error || '登录状态已失效，请重新登录', 'error');
                return;
            }
            if (data.success) {
                Object.assign(state.user, data.user);
                state.user.id = data.user.id;
                state.user.name = data.user.nickname;
                state.user.username = data.user.username || '';
                state.user.bio = data.user.bio || '';
                selectedColor = data.user.color || selectedColor;
                state.viewport.x = state.user.x;
                state.viewport.y = state.user.y;
                state.otherUsers = data.onlineUsers.filter(u => u.id !== state.user.id).map(u => ({
                    ...u,
                    name: u.nickname
                }));
                state.portals = data.portals || [];
                state.messages = (data.recentMessages || []).slice().sort(compareMessages);
                state.isAdmin = !!data.isAdmin;
                state.isSuperAdmin = !!data.isSuperAdmin;
                state.messages.forEach(msg => preMeasureMessage(msg));
                localStorage.setItem('mechat_user_id', data.user.id);
                localStorage.setItem('mechat_user_color', data.user.color);
                if (data.sessionToken) localStorage.setItem('mechat_session_token', data.sessionToken);
                persistSessionProfile(data.user);
                restoringSession = false;
                canvas.style.display = 'block';
                entryScreen.style.display = 'none';
                document.querySelector('.online-badge').style.display = '';
                $('coordinatesDisplay').style.display = '';
                document.querySelector('.controls-hint').style.display = '';

                // 移动端：登录成功后显示游戏UI元素
                if (typeof mobileAdapter !== 'undefined' && mobileAdapter.isMobile) {
                    mobileAdapter.onLoginSuccess();
                }

                updateUserCard();
                updateOnlineCount();
                init();
            }
        });
        
        socket.on('user_joined', data => {
            if (!state.otherUsers.find(u => u.id === data.user.id)) {
                state.otherUsers.push({ ...data.user, name: data.user.nickname });
                updateOnlineCount();
            }
        });
        
        socket.on('user_left', data => {
            state.otherUsers = state.otherUsers.filter(u => u.id !== data.userId);
            updateOnlineCount();
        });
        
        socket.on('user_reconnected', data => {
            const existing = state.otherUsers.find(u => u.id === data.userId);
            if (existing) { existing.x = data.x; existing.y = data.y; }
            else { state.otherUsers.push({ id: data.userId, nickname: data.nickname, name: data.nickname, x: data.x, y: data.y, color: '' }); }
            updateOnlineCount();
        });
        
        socket.on('user_moved', data => {
            const user = state.otherUsers.find(u => u.id === data.userId);
            if (user) { user.x = data.x; user.y = data.y; }
        });
        
        socket.on('new_message', msg => {
            if (!state.messages.find(m => m.id === msg.id)) {
                state.messages.push(msg);
                state.messages.sort(compareMessages);
                preMeasureMessage(msg);
                if (state.messages.length > MAX_MESSAGES) {
                    const removed = state.messages.splice(0, state.messages.length - MAX_MESSAGES);
                    removed.forEach(m => msgMeasureCache.delete(m.id));
                }
            }
        });
        
        socket.on('profile_updated', data => {
            if (data.user) Object.assign(state.user, data.user);
            persistSessionProfile(data.user || state.user);
            if (state.user.color) localStorage.setItem('mechat_user_color', state.user.color);
            setButtonLoading($('saveProfileBtn'), false);
            closeProfilePanel();
            updateUserCard();
        });
        
        socket.on('user_profile_changed', data => {
            const user = state.otherUsers.find(u => u.id === data.userId);
            if (user && data.changes) Object.assign(user, data.changes);
        });
        
        socket.on('friend_added', data => {
            showToast(`${data.fromUser.nickname} 已添加你为好友`, 'success');
            socket.emit('get_friends');
        });

        socket.on('portals_updated', data => {
            state.portals = data.portals || [];
            renderMyPortals();
        });

        socket.on('portal_result', data => {
            if (!data.success) {
                showToast(data.error || '传送门操作失败', 'error');
                return;
            }
            if (data.action === 'created') showToast('传送门已建立', 'success');
            if (data.action === 'updated') showToast('传送门已更新', 'success');
            if (data.action === 'deleted') showToast('传送门已删除', 'success');
            if (data.action === 'created' || data.action === 'updated') resetPortalForm();
            renderMyPortals();
        });

        socket.on('portal_teleported', data => {
            state.user.x = data.x;
            state.user.y = data.y;
            state.viewport.x = data.x;
            state.viewport.y = data.y;
            showToast(`已抵达“${data.portal.name}”`, 'success');
        });
        
        socket.on('friend_removed', data => {
            socket.emit('get_friends');
        });
        
        socket.on('friend_request', data => {
            showToast(`${data.fromUser.nickname} 向你发送了好友申请`, 'info', 5000);
            socket.emit('get_pending_requests');
        });
        
        socket.on('friend_accepted', data => {
            showToast(`${data.toUser.nickname} 接受了你的好友申请`, 'success');
            socket.emit('get_friends');
        });
        
        socket.on('pending_requests', data => {
            renderPendingRequests(data.requests || []);
        });

        socket.on('sent_requests', data => {
            renderSentRequests(data.requests || []);
        });
        
        socket.on('friend_result', data => {
            if (data.success && data.action === 'request_sent') showToast('好友申请已发送！', 'success');
            else if (data.success && data.action === 'accepted') showToast('对方已有你的好友申请，已自动成为好友', 'success');
            else if (data.success && data.action === 'rejected') { /* 静默处理 */ }
              else if (data.success && data.action === 'removed') showToast('已移除好友', 'success');
              else if (!data.success) showToast(data.error || '操作失败', 'error');
              socket.emit('get_friends');
              socket.emit('get_pending_requests');
              socket.emit('get_sent_requests');
          });
        
        socket.on('friends_list', data => {
            renderFriendsList(data.friends || []);
        });
        
        socket.on('block_result', data => {
            if (data.success) {
                if (data.action === 'unblocked') showToast('已取消屏蔽', 'success');
                else { showToast('用户已被屏蔽', 'success'); state.otherUsers = state.otherUsers.filter(u => u.id !== data.targetId); }
                updateOnlineCount();
            } else {
                showToast(data.error || '操作失败', 'error');
            }
        });

        socket.on('private_message', data => { addDmMessage(data, true); });
        socket.on('dm_cleared', data => {
            if (data.targetId === dmTargetId) $('dmMessages').innerHTML = '';
        });

        socket.on('dm_history', data => {
            if (data.targetId !== dmTargetId) return;
            for (const msg of data.messages) {
                const isFrom = msg.from_id !== state.user.id;
                addDmMessage({ content: msg.content, timestamp: msg.timestamp }, isFrom);
            }
        });

        socket.on('admin_result', data => {
            if (data.success) {
                if (data.action === 'delete_message') { state.messages = state.messages.filter(m => m.id !== pendingDeleteMessageId); }
                if (data.action === 'cleanup') showToast(`清理完成，共清理 ${data.cleaned} 个离线用户的数据`, 'success');
                if (data.action === 'kick_guests') showToast(`已注销 ${data.deleted} 个游客账号`, 'success');
                if (data.action === 'mute') state.mutedUsers.add(data.targetId);
                if (data.action === 'unmute') state.mutedUsers.delete(data.targetId);
                if (data.action === 'set_admin' || data.action === 'unset_admin') {
                    socket.emit('admin_get_all_users');
                    const targetUser = state.otherUsers.find(u => u.id === data.targetId);
                    if (targetUser) targetUser.isAdmin = data.action === 'set_admin';
                }
            } else {
                if (data.action === 'delete_message') { showDeleteKeyDialog(pendingDeleteMessageId); $('keyError').style.display = ''; }
                else showToast(data.error || '操作失败', 'error');
            }
        });
        socket.on('became_admin', () => { state.isAdmin = true; showToast('您已被设为管理员', 'success', 5000); });
        socket.on('lost_admin', () => { state.isAdmin = false; showToast('您的管理员身份已被取消', 'warning', 5000); });

        socket.on('message_deleted', data => {
            state.messages = state.messages.filter(m => m.id !== data.messageId);
            const el = document.querySelector(`.msg-bubble[data-id="${data.messageId}"]`);
            if (el) el.remove();
        });

        socket.on('system_broadcast', data => { showBroadcast(data); });

        socket.on('muted', data => { showToast(`您已被管理员 ${data.adminName} 禁言${data.reason ? '，原因：' + data.reason : ''}`, 'warning', 6000); });
        socket.on('unmuted', () => { showToast('您的禁言已被解除', 'success'); });

        socket.on('kicked', data => { showToast(`您被管理员 ${data.adminName} 踢出${data.reason ? '，原因：' + data.reason : ''}`, 'error', 6000); });
        socket.on('banned', data => { showToast(`您被管理员 ${data.adminName} 封禁${data.reason ? '，原因：' + data.reason : ''}`, 'error', 6000); });

        socket.on('messages_cleared', () => { state.messages = []; });

        socket.on('user_info_detail', data => { renderUserInfo(data); });

        socket.on('admin_lists', data => {
            state.mutedUsers.clear();
            (data.muted || []).forEach(u => state.mutedUsers.add(u.user_id));
            renderBannedList(data.banned || []);
            renderMutedList(data.muted || []);
        });

        socket.on('all_users_list', data => { renderAllUsers(data.users || []); });

        socket.on('error', data => {
            document.querySelectorAll('.enter-btn').forEach(btn => setButtonLoading(btn, false));
            if (restoringSession) {
                restoringSession = false;
                clearStoredSession();
                state.user.id = null;
                if (!socket.connected) setTimeout(() => socket.connect(), 0);
            }
            showToast(data.message, 'error');
        });
