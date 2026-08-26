// Mobile device adaptation, responsive layout, and virtual joystick.

        // ==================== 移动端自适应系统 v3.0 ====================
        // 核心设计：基于视口百分比(vw/vh/vmin)的真正响应式布局

        const MobileAdapter = {
            isMobile: false,
            joystick: null,
            layout: null,

            init() {
                this.detectDevice();
                if (this.isMobile) {
                    this.enableMobileMode();
                }
                // 监听窗口变化
                window.addEventListener('resize', this.debounce(() => this.handleResize(), 200));
                // 监听屏幕旋转
                screen.orientation?.addEventListener('change', () => setTimeout(() => this.updateLayout(), 100));
            },

            detectDevice() {
                const ua = navigator.userAgent;
                const width = window.innerWidth;
                this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
                               (width < 768 && ('ontouchstart' in window));
                return this.isMobile;
            },

            enableMobileMode() {
                console.log('启用移动端模式');

                // 登录界面存在时，不显示游戏UI元素
                const entryScreen = document.getElementById('entryScreen');
                const isOnLoginScreen = entryScreen && entryScreen.style.display !== 'none';

                if (!isOnLoginScreen) {
                    document.getElementById('joystick-zone').style.display = 'block';
                    // 移动端操作按钮已禁用（用户不需要）
                    // document.getElementById('mobile-actions').style.display = 'flex';

                    this.showGameUI();
                } else {
                    console.log('登录界面可见，隐藏游戏UI元素');
                    this.hideGameUI();
                }

                this.layout = new ResponsiveLayout();
                this.joystick = new JoystickController('joystick-canvas');

                this.bindMobileEvents();

                setTimeout(() => {
                    this.updateLayout();
                }, 100);
            },

            showGameUI() {
                const elements = [
                    { id: 'joystick-zone', display: 'block' },
                    { id: 'messageInputContainer', display: '' },
                    { id: 'coordinatesDisplay', display: '' }
                ];
                elements.forEach(item => {
                    const el = document.getElementById(item.id);
                    if (el) el.style.display = item.display;
                });
            },

            hideGameUI() {
                const elements = ['joystick-zone', 'messageInputContainer', 'coordinatesDisplay'];
                elements.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.style.display = 'none';
                });
            },

            onLoginSuccess() {
                    console.log('登录成功，显示游戏UI元素');
                this.showGameUI();
                setTimeout(() => this.updateLayout(), 50);
            },

            updateLayout() {
                if (this.layout) {
                    this.layout.calculate();
                }
                if (this.joystick) {
                    this.joystick.resize();
                }
            },

            handleResize() {
                this.detectDevice();
                if (this.isMobile && !document.body.classList.contains('mobile-mode')) {
                    this.enableMobileMode();
                }
                this.updateLayout();
            },

            bindMobileEvents() {
                // 使用更可靠的事件绑定方式
                const bindClick = (id, handler) => {
                    const el = document.getElementById(id);
                    if (el) {
                        el.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handler(e);
                        });
                        console.log(`按钮已绑定: ${id}`);
                    } else {
                        console.warn(`未找到元素: ${id}`);
                    }
                };

                // 消息按钮
                bindClick('mobile-message-btn', () => {
                    const container = document.getElementById('messageInputContainer');
                    const btn = document.getElementById('mobile-message-btn');

                    if (container && btn) {
                        const isActive = container.classList.contains('active');
                        if (isActive) {
                            container.classList.remove('active');
                            btn.classList.remove('message-active');
                console.log('消息框已关闭');
                        } else {
                            container.classList.add('active');
                            btn.classList.add('message-active');
                            setTimeout(() => {
                                const input = document.getElementById('messageInput');
                                if (input) input.focus();
                            }, 100);
                console.log('消息框已打开');
                        }
                    }
                });

                // 资料按钮
                bindClick('mobile-profile-btn', () => {
                    if (typeof openProfilePanel === 'function') {
                        openProfilePanel();
                console.log('打开资料面板');
                    } else {
                        console.error('openProfilePanel 函数未定义');
                    }
                });

                bindClick('mobile-portal-btn', () => {
                    if (typeof openPortalPanel === 'function') openPortalPanel();
                });

                // 放大按钮
                bindClick('mobile-zoom-in-btn', () => {
                    if (typeof state !== 'undefined' && state.viewport) {
                        state.viewport.scale = Math.min(3, state.viewport.scale * 1.2);
                        state.viewport.x = state.user?.x || 0;
                        state.viewport.y = state.user?.y || 0;
                console.log(`放大: ${state.viewport.scale.toFixed(2)}`);
                    }
                });

                // 缩小按钮
                bindClick('mobile-zoom-out-btn', () => {
                    if (typeof state !== 'undefined' && state.viewport) {
                        state.viewport.scale = Math.max(0.6, state.viewport.scale * 0.8);
                        state.viewport.x = state.user?.x || 0;
                        state.viewport.y = state.user?.y || 0;
                console.log(`缩小: ${state.viewport.scale.toFixed(2)}`);
                    }
                });

                // Canvas触摸事件
                this.bindCanvasTouch();

                console.log('所有移动端按钮事件已绑定完成');
            },

            bindCanvasTouch() {
                const canvas = document.getElementById('worldCanvas');
                if (!canvas) {
                console.warn('未找到Canvas元素，跳过触摸事件绑定');
                    return;
                }

                let lastTap = 0;

                canvas.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    const now = Date.now();

                    // 双击检测
                    if (now - lastTap < 300) {
                        state.viewport.scale = 1;
                        state.viewport.x = state.user.x;
                        state.viewport.y = state.user.y;
                    }
                    lastTap = now;

                    // 单击处理
                    if (e.touches.length === 1) {
                        this.handleCanvasTap(e.touches[0]);
                    }
                }, { passive: false });

                canvas.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    // 双指缩放
                    if (e.touches.length === 2) {
                        this.handlePinchZoom(e);
                    }
                }, { passive: false });
            },

            handleCanvasTap(touch) {
                // 移动端：如果输入框已打开，先关闭它
                const msgContainer = document.getElementById('messageInputContainer');
                const msgBtn = document.getElementById('mobile-message-btn');
                if (msgContainer && msgContainer.classList.contains('active')) {
                    msgContainer.classList.remove('active');
                    if (msgBtn) msgBtn.classList.remove('message-active');

                    setTimeout(() => {
                        this.updateLayout();
                    }, 50);
                    return;
                }

                const worldPos = this.screenToWorld(touch.clientX, touch.clientY);

                // 检测点击用户（显示菜单）
                for (const user of state.otherUsers) {
                    const dist = Math.hypot(user.x - worldPos.x, user.y - worldPos.y);
                    if (dist < 40 / state.viewport.scale) {
                        showContextMenu(touch.clientX, touch.clientY, user);
                        return;
                    }
                }

                for (const portal of (state.portals || [])) {
                    const dist = Math.hypot(portal.x - worldPos.x, portal.y - worldPos.y);
                    if (dist < 48 / state.viewport.scale) {
                        openPortalDetail(portal);
                        return;
                    }
                }

                // 检测点击消息（显示详情）
                const sorted = [...state.messages].sort((a, b) => {
                    const distA = Math.hypot(a.x - state.user.x, a.y - state.user.y);
                    const distB = Math.hypot(b.x - state.user.x, b.y - state.user.y);
                    return distA - distB;
                });

                for (const msg of sorted) {
                    if (msg.bubbleWidth && msg.bubbleHeight) {
                        if (Math.abs(worldPos.x - msg.x) < msg.bubbleWidth/2 && Math.abs(worldPos.y - msg.y) < msg.bubbleHeight/2) {
                            document.getElementById('detailAuthor').textContent = msg.author;
                            document.getElementById('detailContent').textContent = msg.content;
                            document.getElementById('detailTime').textContent = formatTime(msg.timestamp);
                            document.getElementById('messageDetail').classList.add('active');
                            return;
                        }
                    }
                }

                // 移动端点击屏幕不进行移动/传送（仅摇杆控制）
            },

            handlePinchZoom(e) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const dist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);

                if (this.lastPinchDist) {
                    const scale = dist / this.lastPinchDist;
                    state.viewport.scale = Math.max(0.6, Math.min(3, state.viewport.scale * scale));
                    state.viewport.x = state.user.x;
                    state.viewport.y = state.user.y;
                }
                this.lastPinchDist = dist;
            },

            screenToWorld(clientX, clientY) {
                return {
                    x: (clientX - state.viewport.width / 2) / state.viewport.scale + state.viewport.x,
                    y: (clientY - state.viewport.height / 2) / state.viewport.scale + state.viewport.y
                };
            },

            getJoystickInput() {
                if (!this.joystick) return { x: 0, y: 0 };
                const deadzone = 0.15;
                let x = this.joystick.direction.x;
                let y = this.joystick.direction.y;
                if (Math.abs(x) < deadzone) x = 0;
                if (Math.abs(y) < deadzone) y = 0;
                return { x, y };
            },

            debounce(func, wait) {
                let timeout;
                return (...args) => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func.apply(this, args), wait);
                };
            }
        };

        // ==================== 智能响应式布局引擎 ====================

        class ResponsiveLayout {
            constructor() {
                this.elements = {};
                this.cacheElements();
            }

            cacheElements() {
                // 直接使用原生API，不依赖$()函数
                this.elements = {
                    canvas: document.getElementById('worldCanvas'),
                    userCard: document.getElementById('userCard'),
                    onlineBadge: document.querySelector('.online-badge'),
                    messageContainer: document.getElementById('messageInputContainer'),
                    coordsDisplay: document.getElementById('coordinatesDisplay'),
                    joystickZone: document.getElementById('joystick-zone'),
                    mobileActions: document.getElementById('mobile-actions')
                };

                console.log('元素缓存完成:', {
                    canvas: !!this.elements.canvas,
                    userCard: !!this.elements.userCard,
                    onlineBadge: !!this.elements.onlineBadge,
                    joystickZone: !!this.elements.joystickZone,
                    mobileActions: !!this.elements.mobileActions
                });
            }

            calculate() {
                // 基于视口的真实响应式计算
                const vw = window.innerWidth;    // 视口宽度 (例: 375)
                const vh = window.innerHeight;   // 视口高度 (例: 667)
                const vmin = Math.min(vw, vh);  // 较小边
                const isCompact = vw <= 375;     // 超小屏
                const isShort = vh <= 667;       // 短屏幕

                // 登录界面可见时，只设置canvas，跳过其他UI元素
                const entryScreen = document.getElementById('entryScreen');
                const isOnLoginScreen = entryScreen && entryScreen.style.display !== 'none';

                console.log(`v3.0布局: ${vw}x${vh}, vmin:${vmin}${isOnLoginScreen ? ' [登录界面]' : ''}`);

                // ========== 1. Canvas像素设置 ==========
                if (this.elements.canvas) {
                    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
                    this.elements.canvas.width = Math.floor(vw * dpr);
                    this.elements.canvas.height = Math.floor(vh * dpr);

                    if (state?.viewport) {
                        state.viewport.width = vw;
                        state.viewport.height = vh;
                    }
                }

                // ========== 2-8. 游戏UI元素（登录界面时跳过）==========
                if (!isOnLoginScreen) {
                    // ========== 2. 在线人数 - 右上角 (基于vh) ==========
                    if (this.elements.onlineBadge) {
                        Object.assign(this.elements.onlineBadge.style, {
                            position: 'fixed',
                            top: `${Math.max(vh * 0.08, 50)}px`,
                            right: `${vw * 0.03}px`,
                            left: 'auto',
                            fontSize: `${Math.max(12, vmin * 0.036)}px`,
                            padding: `${vmin * 0.016}px ${vmin * 0.032}px`,
                            zIndex: '10'
                        });
                    }

                    // ========== 3. 用户卡片 - 左上角（与右上角对齐）==========
                    if (this.elements.userCard) {
                        Object.assign(this.elements.userCard.style, {
                            position: 'fixed',
                            top: `${Math.max(vh * 0.08, 50)}px`,
                            left: `${vw * 0.027}px`,
                            right: 'auto',
                            bottom: 'auto',
                            maxWidth: `${vw * 0.52}px`,
                            fontSize: `${Math.max(12, vmin * 0.036)}px`,
                            padding: `${vmin * 0.014}px ${vmin * 0.028}px`,
                            zIndex: '10'
                        });
                    }

                    // ========== 4. 坐标显示 - 底部居中 ==========
                    if (this.elements.coordsDisplay) {
                        Object.assign(this.elements.coordsDisplay.style, {
                            position: 'fixed',
                            top: 'auto',
                            left: '50%',
                            right: 'auto',
                            bottom: `${vh * 0.26}px`,
                            transform: 'translateX(-50%)',
                            fontSize: `${Math.max(10, vmin * 0.028)}px`,
                            opacity: '0.65',
                            zIndex: '10'
                        });
                    }

                    // ========== 5. 消息输入框 - 底部居中 (智能显隐) ==========
                    if (this.elements.messageContainer) {
                        const inputBottom = isShort ? vh * 0.24 : vh * 0.23;
                        const maxWidth = Math.min(vw * 0.62, 280);
                        const isActive = this.elements.messageContainer.classList.contains('active');

                        Object.assign(this.elements.messageContainer.style, {
                            position: 'fixed',
                            top: 'auto',
                            left: '50%',
                            right: 'auto',
                            bottom: `${inputBottom}px`,
                            width: `${maxWidth}px`,
                            maxWidth: `${maxWidth}px`,
                            zIndex: '10',
                            transform: isActive
                                ? 'translateX(-50%) translateY(0)'
                                : 'translateX(-50%) translateY(150%)'
                        });
                    }

                    // ========== 6. 虚拟摇杆 - 左下角 (基于vmin) ==========
                    if (this.elements.joystickZone) {
                        const joystickSize = isCompact ? vmin * 0.25 : vmin * 0.27;

                        Object.assign(this.elements.joystickZone.style, {
                            position: 'fixed',
                            top: 'auto',
                            left: `${vw * 0.035}px`,
                            right: 'auto',
                            bottom: `${vh * 0.028}px`,
                            width: `${joystickSize}px`,
                            height: `${joystickSize}px`,
                            zIndex: '9999'
                        });
                    }

                    // ========== 8. 对话框居中（坐标传送等 - 仅移动端）==========
                    const dialogOverlays = document.querySelectorAll('.dialog-overlay');
                    dialogOverlays.forEach(overlay => {
                        const dialog = overlay.querySelector('.dialog');
                        if (dialog) {
                            Object.assign(dialog.style, {
                                position: 'fixed',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%) scale(0.94)',
                                width: isCompact ? `${vw * 0.82}px` : `${Math.min(vw * 0.78, 340)}px`,
                                maxWidth: 'none',
                                margin: '0'
                            });
                        }
                    });
                }

                console.log('v3.0布局完成');
            }

            setupCanvas(w, h) {
                const canvas = this.elements.canvas;
                if (!canvas) return;

                // 设置Canvas像素尺寸
                canvas.width = w;
                canvas.height = h;

                // 更新state
                state.viewport.width = w;
                state.viewport.height = h;
            }

            setStyle(el, styles) {
                if (!el) return;
                Object.assign(el.style, styles);
            }
        }

        // ==================== 虚拟摇杆控制器 ====================

        class JoystickController {
            constructor() {
                // 使用原生API
                this.zone = document.getElementById('joystick-zone');
                this.canvas = document.getElementById('joystick-canvas');

                if (!this.zone || !this.canvas) {
                    console.error('摇杆元素未找到:', { zone: !!this.zone, canvas: !!this.canvas });
                    return;
                }

                this.ctx = this.canvas.getContext('2d');
                console.log('摇杆初始化成功');

                this.size = 100;
                this.centerX = 50;
                this.centerY = 50;
                this.radius = 38;
                this.stickRadius = 17;

                this.stickX = 0;
                this.stickY = 0;
                this.active = false;
                this.touchId = null;
                this.direction = { x: 0, y: 0 };

                this.bindEvents();
                this.render();
            }

            resize() {
                const rect = this.zone.getBoundingClientRect();
                this.size = Math.min(rect.width, rect.height);
                this.centerX = this.size / 2;
                this.centerY = this.size / 2;
                this.radius = this.size * 0.38;
                this.stickRadius = this.size * 0.17;

                // 更新canvas尺寸
                this.canvas.width = this.size;
                this.canvas.height = this.size;

                this.render();
            }

            bindEvents() {
                this.canvas.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
                this.canvas.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
                this.canvas.addEventListener('touchend', (e) => this.onEnd(e), { passive: false });
                this.canvas.addEventListener('touchcancel', (e) => this.onEnd(e), { passive: false });

                document.addEventListener('touchend', (e) => {
                    if (this.active && !e.target.closest('#joystick-zone')) {
                        this.reset();
                    }
                });
            }

            onStart(e) {
                e.preventDefault();
                if (!this.active) {
                    this.active = true;
                    this.touchId = e.changedTouches[0].identifier;
                    this.updatePosition(e.changedTouches[0]);
                }
            }

            onMove(e) {
                e.preventDefault();
                for (const touch of e.changedTouches) {
                    if (touch.identifier === this.touchId) {
                        this.updatePosition(touch);
                        break;
                    }
                }
            }

            onEnd(e) {
                e.preventDefault();
                for (const touch of e.changedTouches) {
                    if (touch.identifier === this.touchId) {
                        this.reset();
                        break;
                    }
                }
            }

            updatePosition(touch) {
                const rect = this.canvas.getBoundingClientRect();
                const x = touch.clientX - rect.left - this.centerX;
                const y = touch.clientY - rect.top - this.centerY;

                const dist = Math.min(Math.hypot(x, y), this.radius);
                const angle = Math.atan2(y, x);

                this.stickX = Math.cos(angle) * dist;
                this.stickY = Math.sin(angle) * dist;
                this.direction.x = this.stickX / this.radius;
                this.direction.y = this.stickY / this.radius;

                this.render();
            }

            reset() {
                this.active = false;
                this.touchId = null;
                this.stickX = 0;
                this.stickY = 0;
                this.direction.x = 0;
                this.direction.y = 0;
                this.render();
            }

            render() {
                const s = this.size;
                this.ctx.clearRect(0, 0, s, s);

                // 外圈
                this.ctx.beginPath();
                this.ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
                this.ctx.fill();
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
                this.ctx.lineWidth = Math.max(1.5, s * 0.018);
                this.ctx.stroke();

                // 十字线
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                this.ctx.lineWidth = 1;
                const offset = this.radius - s * 0.04;
                this.ctx.beginPath();
                this.ctx.moveTo(this.centerX, this.centerY - offset);
                this.ctx.lineTo(this.centerX, this.centerY + offset);
                this.ctx.moveTo(this.centerX - offset, this.centerY);
                this.ctx.lineTo(this.centerX + offset, this.centerY);
                this.ctx.stroke();

                // 摇杆
                this.ctx.beginPath();
                if (this.active) {
                    this.ctx.arc(this.centerX + this.stickX, this.centerY + this.stickY, this.stickRadius, 0, Math.PI * 2);
                    this.ctx.fillStyle = 'rgba(0, 122, 255, 0.85)';
                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
                } else {
                    this.ctx.arc(this.centerX, this.centerY, this.stickRadius, 0, Math.PI * 2);
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
                    this.ctx.strokeStyle = 'transparent';
                }
                this.ctx.fill();
                if (this.active) {
                    this.ctx.lineWidth = 2;
                    this.ctx.stroke();
                }
            }
        }

        // 初始化移动端适配
        let mobileAdapter = null;

