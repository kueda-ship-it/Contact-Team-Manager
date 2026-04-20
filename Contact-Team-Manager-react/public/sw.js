
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/';
    const targetOrigin = (() => {
        try { return new URL(targetUrl).origin; } catch { return self.location.origin; }
    })();

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // 同一 origin のウィンドウを優先してフォーカス + postMessage。
            // scope 完全一致だと dev など base path ずれで拾えないので origin で判定する。
            for (const client of windowClients) {
                try {
                    const clientOrigin = new URL(client.url).origin;
                    if (clientOrigin === targetOrigin && 'focus' in client) {
                        client.postMessage({ type: 'notification-click', url: targetUrl });
                        return client.focus();
                    }
                } catch { /* ignore malformed URLs */ }
            }

            // 同一 scope に制限した上でもう一度（将来別 origin 混入時の保険）
            for (const client of windowClients) {
                if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
                    client.postMessage({ type: 'notification-click', url: targetUrl });
                    return client.focus();
                }
            }

            // 既存ウィンドウ無し → 新規ウィンドウで開く
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
