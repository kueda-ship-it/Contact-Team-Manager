
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
            // 1. Try to find an existing window that is open to the app
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                // Check if the client is within the app scope (roughly)
                // We use 'Contact-Team-Manager' or just check if it's the same origin
                if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
                    if (targetUrl) {
                        client.navigate(targetUrl);
                    }
                    return client.focus();
                }
            }

            // 2. If no window is open, open a new one
            if (clients.openWindow) {
                // Ensure we open a URL relative to the scope
                // If targetUrl is absolute, use it. If relative, append to scope.
                // Assuming targetUrl is something like '/thread/123' or just '/'

                // Construct absolute URL if needed, or just let openWindow handle it
                // Ideally, we want to open the PWA scope.
                return clients.openWindow(targetUrl);
            }
        })
    );
});
