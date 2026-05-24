const CACHE_NAME = 'mechat-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/public/og-image.png',
    'https://cdn.tailwindcss.com',
    'https://cdn.socket.io/4.7.2/socket.io.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// 安装事件 - 缓存核心资源
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('缓存已打开');
                return cache.addAll(urlsToCache);
            })
            .catch((err) => {
                console.log('缓存失败:', err);
            })
    );
    self.skipWaiting();
});

// 激活事件
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('删除旧缓存:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
    // 对非GET请求（如Socket.IO）不进行缓存
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 缓存命中，返回缓存的资源
                if (response) {
                    return response;
                }

                // 缓存未命中，发起网络请求
                return fetch(event.request).then(
                    (response) => {
                        // 检查是否为有效响应
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // 克隆响应，因为响应只能被消费一次
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    }
                ).catch(() => {
                    // 网络请求失败，返回离线页面（如果请求的是HTML）
                    if (event.request.headers.get('accept').includes('text/html')) {
                        return caches.match('/index.html');
                    }
                });
            })
    );
});

// 后台同步（用于消息队列）
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-messages') {
        event.waitUntil(syncMessages());
    }
});

async function syncMessages() {
    // 同步离线时发送的消息
    console.log('后台同步消息');
}

// 推送通知
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : '您有新消息',
        icon: '/public/icon-192.png',
        badge: '/public/icon-72.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            { action: 'open', title: '打开' },
            { action: 'close', title: '关闭' }
        ]
    };

    event.showNotification('MeChat 新消息', options);
});

// 通知点击事件
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});
