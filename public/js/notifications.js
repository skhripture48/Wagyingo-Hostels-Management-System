// Initialize notification system
document.addEventListener('DOMContentLoaded', async () => {
    // Check if browser supports notifications
    if ('Notification' in window) {
        console.log('Notifications are supported');
        
        // If permission is not granted or denied, ask for permission
        if (Notification.permission === 'default') {
            try {
                console.log('Requesting notification permission...');
                const permission = await Notification.requestPermission();
                console.log('Permission result:', permission);
                if (permission === 'granted') {
                    await registerServiceWorker();
                }
            } catch (error) {
                console.error('Error requesting notification permission:', error);
            }
        } else if (Notification.permission === 'granted') {
            // If permission was already granted, register service worker
            console.log('Permission already granted, registering service worker...');
            await registerServiceWorker();
        }
    } else {
        console.log('Notifications are not supported');
    }

    // Load notifications if user is logged in
    const token = localStorage.getItem('token');
    if (token) {
        await loadNotifications();
        startNotificationPolling();
    }
});

// Register service worker and subscribe to push notifications
async function registerServiceWorker() {
    try {
        console.log('Registering service worker...');
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        console.log('Service Worker registered');

        // Get the VAPID public key from the server
        console.log('Fetching VAPID public key...');
        const response = await fetch('/api/notifications/vapid-public-key');
        const { publicKey } = await response.json();
        console.log('VAPID public key received');

        // Convert VAPID public key to Uint8Array
        const publicKeyArray = urlBase64ToUint8Array(publicKey);

        // Subscribe to push notifications
        console.log('Subscribing to push notifications...');
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: publicKeyArray
        });
        console.log('Push notification subscription successful');

        // Save the subscription to the server
        console.log('Saving subscription to server...');
        const saveResponse = await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ 
                subscription,
                role: 'user'
            })
        });

        if (!saveResponse.ok) {
            const error = await saveResponse.json();
            throw new Error(error.error || 'Failed to save push subscription');
        }

        console.log('Push subscription saved successfully');
        return subscription;
    } catch (error) {
        console.error('Push subscription failed:', error);
        throw error;
    }
}

// Helper function to convert VAPID key from base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Function to show a notification
function showNotification(message, type = 'info') {
    // Show in-app notification
    const toast = document.createElement('div');
    toast.className = `toast align-items-center text-white bg-${type} border-0`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    toast.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
    `;
    
    document.body.appendChild(toast);
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
    
    // If browser notifications are supported and permission is granted, show browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
        const notification = new Notification('Wagyingo Hostels', {
            body: message,
            icon: '/images/logo.png'
        });
    }
}

// Load notifications from server
async function loadNotifications() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/notifications', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load notifications');
        }
        
        const notifications = await response.json();
        
        // Update notification count
        const countElement = document.getElementById('notificationCount');
        if (countElement) {
            // Filter unread notifications
            const unreadNotifications = notifications.filter(n => !n.viewed);
            const unreadCount = unreadNotifications.length;
            
            countElement.textContent = unreadCount;
            countElement.style.display = unreadCount > 0 ? 'block' : 'none';
        }
        
        // Update notifications list
        const listElement = document.getElementById('notificationsList');
        if (listElement) {
            if (notifications.length === 0) {
                listElement.innerHTML = '<li><a class="dropdown-item" href="#">No new notifications</a></li>';
            } else {
                listElement.innerHTML = notifications.map(notification => {
                    // Construct the proper link based on notification type
                    let itemLink = '';
                    if (notification.type === 'maintenance') {
                        itemLink = `/maintenance.html?id=${notification.notification_id}#request-${notification.notification_id}`;
                    } else if (notification.type === 'announcement') {
                        itemLink = `/announcements.html?id=${notification.notification_id}#announcement-${notification.notification_id}`;
                    }
                    
                    return `
                        <li>
                            <a class="dropdown-item ${notification.viewed ? 'text-muted' : 'fw-bold'}" 
                               href="javascript:void(0)"
                               onclick="handleNotificationClick(event, '${notification.type}', ${notification.notification_id}, '${itemLink}')">
                                <div class="small text-muted">${new Date(notification.created_at).toLocaleDateString()}</div>
                                ${notification.message}
                            </a>
                        </li>
                    `;
                }).join('');
            }
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        // Update UI to show error state
        const countElement = document.getElementById('notificationCount');
        const listElement = document.getElementById('notificationsList');
        if (countElement) countElement.style.display = 'none';
        if (listElement) {
            listElement.innerHTML = '<li><a class="dropdown-item text-danger" href="#">Error loading notifications</a></li>';
        }
    }
}

// Handle notification click
async function handleNotificationClick(event, type, id, link) {
    event.preventDefault();
    
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Mark notification as viewed
        const response = await fetch(`/api/notifications/${type}/${id}/viewed`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to mark notification as viewed');
        }

        // Update the notification's appearance immediately
        event.currentTarget.classList.add('text-muted');
        
        // Update notification count immediately
        const countElement = document.getElementById('notificationCount');
        const currentCount = parseInt(countElement.textContent);
        if (currentCount > 0) {
            countElement.textContent = currentCount - 1;
            if (currentCount - 1 === 0) {
                countElement.style.display = 'none';
            }
        }
        
        // Navigate to the link
        window.location.href = link;
    } catch (error) {
        console.error('Error handling notification click:', error);
        // If there's an error, still try to navigate
        window.location.href = link;
    }
}

// Start polling for new notifications
function startNotificationPolling() {
    setInterval(loadNotifications, 30000); // Poll every 30 seconds
} 