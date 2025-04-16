const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticateToken, authorize } = require('../middleware/auth');
const webpush = require('../config/vapid');

// Save push subscription
router.post('/subscribe', async (req, res) => {
    console.log('Subscription request received:', req.body);
    
    try {
        const { subscription, role } = req.body;
        
        if (!subscription) {
            console.error('No subscription object in request');
            return res.status(400).json({ error: 'Subscription object is required' });
        }

        console.log('Processing subscription for role:', role);
        
        // Check for existing subscription
        const [existing] = await pool.query(
            'SELECT id FROM user_push_subscriptions WHERE push_subscription = ?',
            [JSON.stringify(subscription)]
        );

        if (existing.length > 0) {
            // Update existing subscription
            await pool.query(
                'UPDATE user_push_subscriptions SET role = ? WHERE push_subscription = ?',
                [role || 'user', JSON.stringify(subscription)]
            );
            console.log('Updated existing subscription');
        } else {
            // Generate a temporary user ID if not authenticated
            const tempUserId = Math.floor(Math.random() * 1000000);
            
            // Store subscription in the database
            await pool.query(
                'INSERT INTO user_push_subscriptions (user_id, push_subscription, role) VALUES (?, ?, ?)',
                [tempUserId, JSON.stringify(subscription), role || 'user']
            );
            console.log('Created new subscription');
        }

        res.json({ success: true, message: 'Subscription saved successfully' });
    } catch (error) {
        console.error('Error saving subscription:', error);
        res.status(500).json({ 
            error: 'Failed to save subscription', 
            details: error.message 
        });
    }
});

// Helper function to send push notification
async function sendPushNotification(userId, title, body, url, type = '') {
    console.log('Sending push notification:', { userId, title, body, url, type });
    
    try {
        let subscriptionQuery = 'SELECT push_subscription FROM user_push_subscriptions WHERE user_id = ?';
        let queryParams = [userId];

        // If sending to admin/staff, query by role instead of user_id
        if (type === 'maintenance_request') {
            subscriptionQuery = 'SELECT push_subscription FROM user_push_subscriptions WHERE role = ?';
            queryParams = ['admin'];
        }

        console.log('Executing query:', subscriptionQuery, queryParams);
        const [subscriptions] = await pool.query(subscriptionQuery, queryParams);

        if (subscriptions.length === 0) {
            console.log('No subscriptions found for:', userId || 'admin role');
            return;
        }

        console.log(`Found ${subscriptions.length} subscriptions`);

        for (const sub of subscriptions) {
            try {
                const pushSubscription = JSON.parse(sub.push_subscription);
                const payload = JSON.stringify({
                    title,
                    body,
                    url,
                    type,
                    icon: '/assets/logo.png',
                    badge: '/assets/badge.png'
                });

                console.log('Sending notification to subscription:', pushSubscription.endpoint);
                await webpush.sendNotification(pushSubscription, payload);
                console.log('Push notification sent successfully');
            } catch (error) {
                console.error('Error sending individual push notification:', error);
                
                if (error.statusCode === 410) {
                    console.log('Removing invalid subscription');
                    await pool.query(
                        'DELETE FROM user_push_subscriptions WHERE push_subscription = ?',
                        [sub.push_subscription]
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
    console.log('Creating new notification:', req.body);
    
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
            console.log('Sending maintenance request notification to admins');
            await sendPushNotification(
                null,
                'New Maintenance Request',
                message,
                `/admin-dashboard.html#maintenance`,
                'maintenance_request'
            );
        } else if (type === 'maintenance') {
            console.log('Sending maintenance update notification to student');
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
            console.log('Sending announcement notification to all students');
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