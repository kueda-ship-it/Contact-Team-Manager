// Service Worker for Contact Team Manager
// SW_VERSION を変更すると、ブラウザが SW の更新を検出して再インストールする
const SW_VERSION = '2026-04-21-3';

self.addEventListener('install', (event) => {
    console.log(`[sw] install (version=${SW_VERSION})`);
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log(`[sw] activate (version=${SW_VERSION})`);
    event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
    console.log('[sw] notificationclick fired', { data: event.notification.data });
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/';

    event.waitUntil((async () => {
        // 1) BroadcastChannel で全クライアントへ送信（postMessage より確実）
        try {
            const bc = new BroadcastChannel('notification-clicks');
            bc.postMessage({ type: 'notification-click', url: targetUrl });
            bc.close();
            console.log('[sw] BroadcastChannel sent');
        } catch (e) {
            console.warn('[sw] BroadcastChannel failed', e);
        }

        const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        console.log(`[sw] found ${allClients.length} window clients`);

        // 2) 既存のアプリウィンドウを探す
        const appClients = allClients.filter(c =>
            c.url.startsWith(self.registration.scope) ||
            c.url.includes('/Contact-Team-Manager/')
        );
        console.log(`[sw] ${appClients.length} match app scope`);

        if (appClients.length > 0) {
            const client = appClients[0];
            // 念のため traditional postMessage も投げる
            try { client.postMessage({ type: 'notification-click', url: targetUrl }); } catch {}
            try {
                await client.focus();
                console.log('[sw] focused existing client');
            } catch (e) {
                console.warn('[sw] focus failed, opening new window', e);
                if (clients.openWindow) await clients.openWindow(targetUrl);
            }
            return;
        }

        // 3) 既存のアプリウィンドウが無い場合は新規ウィンドウ
        if (clients.openWindow) {
            console.log('[sw] no app client; opening new window:', targetUrl);
            await clients.openWindow(targetUrl);
        }
    })());
});
