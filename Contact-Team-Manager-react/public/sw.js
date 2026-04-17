
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Find an existing app window and send a postMessage (avoids full page reload)
            for (const client of windowClients) {
                if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
                    client.postMessage({ type: 'notification-click', url: targetUrl });
                    return client.focus();
                }
            }

            // No existing window — open a new one with the URL
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
