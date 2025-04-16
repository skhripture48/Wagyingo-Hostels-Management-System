self.addEventListener('push', function(event) {
    if (!event.data) return;

    const data = event.data.json();
    
    const options = {
        body: data.body,
        icon: '/images/logo.png',
        badge: '/images/badge.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    if (event.notification.data && event.notification.data.url) {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
}); 