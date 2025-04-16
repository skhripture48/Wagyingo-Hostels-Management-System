const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'hostel_booking',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Convert pool to use promises
const promisePool = pool.promise();

// Test the connection
promisePool.query('SELECT 1')
    .then(() => {
        console.log('Connected to MySQL database');
    })
    .catch((err) => {
        console.error('Error connecting to the database:', err);
    });

module.exports = promisePool; 