// Service Worker for Contact Team Manager
// vite-plugin-pwa の injectManifest 戦略でビルドされる。
// Workbox の precache を埋め込みつつ、独自の notificationclick ハンドラを保持する。
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// SW_VERSION を変更すると、ブラウザが SW の更新を検出して再インストールする
const SW_VERSION = '2026-04-21-5';

self.addEventListener('install', (event) => {
    console.log(`[sw] install (version=${SW_VERSION})`);
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log(`[sw] activate (version=${SW_VERSION})`);
    event.waitUntil(self.clients.claim());
});

// Workbox precache (vite-plugin-pwa が __WB_MANIFEST を注入)
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// SPA ナビゲーションフォールバック
const handler = createHandlerBoundToURL('/Contact-Team-Manager/index.html');
registerRoute(new NavigationRoute(handler));

self.addEventListener('notificationclick', (event) => {
    console.log('[sw] notificationclick fired', { data: event.notification.data });
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/';

    event.waitUntil((async () => {
        // 1) BroadcastChannel で全クライアントへ送信（複数タブ対応）
        try {
            const bc = new BroadcastChannel('notification-clicks');
            bc.postMessage({ type: 'notification-click', url: targetUrl });
            bc.close();
            console.log('[sw] BroadcastChannel sent:', targetUrl);
        } catch (e) {
            console.warn('[sw] BroadcastChannel failed', e);
        }

        const allClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        console.log(`[sw] found ${allClients.length} window clients`);

        // 2) アプリのウィンドウを探す（GitHub Pages のサブパス含む）
        const appClients = allClients.filter(c =>
            c.url.startsWith(self.registration.scope) ||
            c.url.includes('/Contact-Team-Manager/') ||
            c.url.includes('/Contact-Team-Manager-react/')
        );
        console.log(`[sw] ${appClients.length} match app scope`);

        if (appClients.length > 0) {
            const client = appClients[0];

            // postMessage を投げる（focus 前に投げて確実に届ける）
            try {
                client.postMessage({ type: 'notification-click', url: targetUrl });
                console.log('[sw] postMessage sent to existing client');
            } catch (e) {
                console.warn('[sw] postMessage failed', e);
            }

            // フォーカスを試みる
            let focused = false;
            try {
                await client.focus();
                focused = true;
                console.log('[sw] focused existing client');
            } catch (e) {
                console.warn('[sw] focus failed', e);
            }

            // 既存ウィンドウの URL が target と異なる場合は navigate する
            // これにより ?thread=ID URL ハンドラ（App.tsx）が確実に発火する
            try {
                const currentUrl = new URL(client.url);
                const target = new URL(targetUrl);
                const currentThread = currentUrl.searchParams.get('thread');
                const targetThread = target.searchParams.get('thread');

                if (targetThread && currentThread !== targetThread && client.navigate) {
                    console.log(`[sw] navigating client from thread=${currentThread} to thread=${targetThread}`);
                    await client.navigate(targetUrl);
                    return;
                }
            } catch (e) {
                console.warn('[sw] client.navigate failed', e);
            }

            // focus も navigate もダメなら新規ウィンドウ
            if (!focused && clients.openWindow) {
                console.log('[sw] focus failed; opening new window');
                await clients.openWindow(targetUrl);
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
