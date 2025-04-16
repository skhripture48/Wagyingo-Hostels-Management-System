const pool = require('../config/database');

async function addRoleColumn() {
    try {
        // Check if column exists
        const [columns] = await pool.query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'user_push_subscriptions' 
            AND COLUMN_NAME = 'role'
        `);

        if (columns.length === 0) {
            // Add role column if it doesn't exist
            await pool.query(`
                ALTER TABLE user_push_subscriptions 
                ADD COLUMN role VARCHAR(20) DEFAULT 'user' 
                AFTER push_subscription
            `);
            console.log('Successfully added role column to user_push_subscriptions table');
        } else {
            console.log('Role column already exists');
        }
    } catch (error) {
        console.error('Error adding role column:', error);
    } finally {
        process.exit();
    }
}

addRoleColumn(); 