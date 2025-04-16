const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function createAdminUser() {
    // Default admin credentials
    const adminUser = {
        username: 'admin',
        email: 'admin@wagyingo.com',
        password: 'admin123', // This is the default password
        full_name: 'System Administrator'
    };

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(adminUser.password, 10);

        // Check if admin user already exists
        const [existingAdmin] = await pool.promise().query(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [adminUser.username, adminUser.email]
        );

        if (existingAdmin.length > 0) {
            console.log('Admin user already exists');
            process.exit(0);
        }

        // Create admin user
        const [result] = await pool.promise().query(
            `INSERT INTO users (username, email, password, full_name, role, status)
             VALUES (?, ?, ?, ?, 'admin', 'ACTIVE')`,
            [
                adminUser.username,
                adminUser.email,
                hashedPassword,
                adminUser.full_name
            ]
        );

        console.log('Admin user created successfully!');
        console.log('----------------------------------------');
        console.log('Use these credentials to login:');
        console.log('Username:', adminUser.username);
        console.log('Email:', adminUser.email);
        console.log('Password:', adminUser.password);
        console.log('----------------------------------------');
        console.log('IMPORTANT: Please change your password after first login!');

    } catch (error) {
        console.error('Error creating admin user:', error);
        console.error('Error details:', error.message);
    } finally {
        pool.end();
    }
}

createAdminUser(); 