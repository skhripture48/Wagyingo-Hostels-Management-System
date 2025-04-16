class NotificationManager {
    constructor() {
        this.isSupported = 'Notification' in window;
        this.permission = this.isSupported ? Notification.permission : 'denied';
    }

    async requestPermission() {
        if (!this.isSupported) {
            console.log('Browser notifications are not supported');
            return false;
        }

        if (this.permission === 'granted') {
            return true;
        }

        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;
            return permission === 'granted';
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }

    async registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('Service workers are not supported');
            return false;
        }

        try {
            const registration = await navigator.serviceWorker.register('/js/service-worker.js');
            console.log('ServiceWorker registration successful');
            return true;
        } catch (error) {
            console.error('ServiceWorker registration failed:', error);
            return false;
        }
    }

    async setup() {
        const hasPermission = await this.requestPermission();
        if (hasPermission) {
            await this.registerServiceWorker();
        }
    }
}

// Create and export a singleton instance
const notificationManager = new NotificationManager();
export default notificationManager; 