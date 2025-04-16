// Service Worker for push notifications
self.addEventListener('install', (event) => {
    console.log('Service Worker installed');
    // Skip waiting to activate the service worker immediately
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    console.log('Service Worker activated');
    // Take control of all pages immediately
    event.waitUntil(clients.claim());
});

self.addEventListener('push', function(event) {
    console.log('Push event received in service worker');
    
    if (!event.data) {
        console.log('No data in push event');
        return;
    }

    try {
        const data = event.data.json();
        console.log('Push data received:', data);
        
        // Default notification options
        const options = {
            body: data.body,
            icon: '/images/logo.png',
            badge: '/images/logo.png',
            vibrate: [100, 50, 100],
            data: {
                url: data.url || '/admin-dashboard.html'
            },
            requireInteraction: true, // Keep notification visible until user interacts with it
            actions: []
        };

        // Add specific actions based on notification type
        if (data.type === 'maintenance_request') {
            options.actions = [
                {
                    action: 'view',
                    title: 'View Request'
                },
                {
                    action: 'approve',
                    title: 'Mark In Progress'
                }
            ];
            // If URL not provided, default to maintenance section
            options.data.url = data.url || '/admin-dashboard.html#maintenance';
        }

        event.waitUntil(
            self.registration.showNotification(data.title, options)
            .then(() => {
                console.log('Notification shown successfully');
                // Broadcast message to client
                return self.clients.matchAll()
                    .then(clients => {
                        clients.forEach(client => {
                            client.postMessage({
                                type: 'notification',
                                title: data.title,
                                body: data.body,
                                data: options.data
                            });
                        });
                    });
            })
            .catch(error => {
                console.error('Error showing notification:', error);
            })
        );
    } catch (error) {
        console.error('Error processing push event:', error);
    }
});

self.addEventListener('notificationclick', function(event) {
    console.log('Notification clicked:', event);
    
    event.notification.close();

    // Handle action clicks
    if (event.action === 'approve') {
        // Store the action to be handled when the page opens
        event.waitUntil(
            clients.openWindow(event.notification.data.url + '&action=approve')
        );
        return;
    }

    // Default behavior - open the URL
    if (event.notification.data && event.notification.data.url) {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
            .then((windowClient) => {
                console.log('Opened window:', windowClient);
            })
            .catch(error => {
                console.error('Error opening window:', error);
            })
        );
    }
}); 