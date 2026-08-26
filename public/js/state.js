// Shared client state and rendering caches.

        const state = {
            user: { id: null, name: '匿名', x: 0, y: 0, color: '#00d4ff', avatar: null },
            otherUsers: [],
            messages: [],
            portals: [],
            viewport: { x: 0, y: 0, scale: 1, width: window.innerWidth, height: window.innerHeight },
            keys: {},
            movementDisabled: false,
            isAdmin: false,
            isSuperAdmin: false,
            mutedUsers: new Set()
        };

        function isTypingInInput() {
            const tag = document.activeElement?.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        }

        const userAvatars = new Map();
        const msgMeasureCache = new Map();
        let MAX_RENDER_MESSAGES = 100;
        const MAX_MESSAGES = 5000;
        
        const COLORS = ['#007aff', '#34c759', '#ff9500', '#af52de', '#ff2d55', '#00c7be', '#ff6482', '#64d2ff', '#30d158', '#ff453a', '#bf5af2', '#ffd60a'];
        let selectedColor = state.user.color;
        let contextMenuTarget = null;
        let myFriends = [];
        let selectedPortal = null;
