const mysql = require('mysql2');
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

async function updateRoomConstraint() {
    try {
        // Drop the existing unique constraint on room_number
        await pool.promise().query('ALTER TABLE rooms DROP INDEX room_number');
        
        // Add a new unique constraint on room_number and hostel_name combination
        await pool.promise().query('ALTER TABLE rooms ADD UNIQUE INDEX room_number_hostel (room_number, hostel_name)');
        
        console.log('Successfully updated room number constraint');
    } catch (error) {
        console.error('Error updating room constraint:', error);
    } finally {
        pool.end();
    }
}

updateRoomConstraint(); 