const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authenticateToken, authorize } = require('../middleware/auth');
const webpush = require('../config/vapid');

// Get all notifications for the current user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const [notifications] = await pool.query(
            'SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark a notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET read = true WHERE id = ? AND recipient_id = ?',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Save push subscription
router.post('/subscribe', async (req, res) => {
    try {
        const { subscription, role } = req.body;
        
        // Generate a temporary user ID if not authenticated
        const tempUserId = Math.floor(Math.random() * 1000000);
        
        // Store subscription in the existing user_push_subscriptions table
        await pool.query(
            'INSERT INTO user_push_subscriptions (user_id, push_subscription, role) VALUES (?, ?, ?)',
            [tempUserId, JSON.stringify(subscription), role || 'user']
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        res.status(500).json({ error: 'Failed to save push subscription' });
    }
});

// Helper function to send push notification
async function sendPushNotification(userId, title, body, url, type = '') {
    try {
        let subscriptionQuery = 'SELECT push_subscription FROM user_push_subscriptions WHERE user_id = ?';
        let queryParams = [userId];

        // If sending to admin/staff, query by role instead of user_id
        if (type === 'maintenance_request') {
            subscriptionQuery = 'SELECT push_subscription FROM user_push_subscriptions WHERE role = ?';
            queryParams = ['admin'];
        }

        const [subscriptions] = await pool.query(subscriptionQuery, queryParams);

        if (subscriptions.length === 0) {
            console.log('No subscriptions found for:', userId);
            return;
        }

        for (const sub of subscriptions) {
            const pushSubscription = JSON.parse(sub.push_subscription);
            const payload = JSON.stringify({
                title,
                body,
                url,
                type,
                icon: '/assets/logo.png',
                badge: '/assets/badge.png'
            });

            try {
                await webpush.sendNotification(pushSubscription, payload);
                console.log('Push notification sent successfully');
            } catch (error) {
                console.error('Error sending push notification:', error);
                // If subscription is invalid, remove it
                if (error.statusCode === 410) {
                    await pool.query(
                        'DELETE FROM user_push_subscriptions WHERE push_subscription = ?',
                        [JSON.stringify(pushSubscription)]
                    );
                }
            }
        }
    } catch (error) {
        console.error('Error in sendPushNotification:', error);
    }
}

// Create notification route
router.post('/', authenticateToken, authorize(['admin', 'manager']), async (req, res) => {
    try {
        const { title, message, type, target_id } = req.body;
        const sender_id = req.user.id;

        // Create the notification in the database
        const [result] = await pool.query(
            'INSERT INTO notifications (sender_id, type, target_id, message) VALUES (?, ?, ?, ?)',
            [sender_id, type, target_id, message]
        );

        // Determine who should receive the push notification
        if (type === 'maintenance_request') {
            // For maintenance requests, notify all admins
            await sendPushNotification(
                null, // Not used for admin notifications
                'New Maintenance Request',
                message,
                `/admin-dashboard.html#maintenance`,
                'maintenance_request'
            );
        } else if (type === 'maintenance') {
            // For maintenance updates, notify the student who created the request
            const [request] = await pool.query(
                'SELECT student_id FROM maintenance_requests WHERE id = ?',
                [target_id]
            );
            if (request.length > 0) {
                await sendPushNotification(
                    request[0].student_id,
                    'Maintenance Update',
                    message,
                    `/maintenance.html?id=${target_id}`
                );
            }
        } else if (type === 'announcement') {
            // For announcements, notify all students
            const [students] = await pool.query(
                'SELECT id FROM users WHERE role = "student"'
            );
            for (const student of students) {
                await sendPushNotification(
                    student.id,
                    'New Announcement',
                    message,
                    '/announcements.html'
                );
            }
        }

        res.status(201).json({ message: 'Notification created successfully' });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ error: 'Failed to create notification' });
    }
});

module.exports = router; 