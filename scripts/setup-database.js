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

async function setupDatabase() {
    try {
        // Drop existing tables in correct order (due to foreign key constraints)
        console.log('Dropping existing tables...');
        await pool.promise().query('DROP TABLE IF EXISTS bookings');
        await pool.promise().query('DROP TABLE IF EXISTS rooms');
        await pool.promise().query('DROP TABLE IF EXISTS users');
        console.log('Existing tables dropped successfully');

        // Create users table with updated structure
        console.log('Creating users table...');
        await pool.promise().query(`
            CREATE TABLE users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                preferred_hostel VARCHAR(255),
                role ENUM('user', 'admin') DEFAULT 'user',
                status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('Users table created successfully');

        // Create rooms table
        console.log('Creating rooms table...');
        await pool.promise().query(`
            CREATE TABLE rooms (
                id INT PRIMARY KEY AUTO_INCREMENT,
                room_number VARCHAR(50) UNIQUE NOT NULL,
                room_type ENUM('single', 'double', 'triple', 'quad') NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                hostel_name VARCHAR(255) NOT NULL,
                status ENUM('AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'BOOKED') DEFAULT 'AVAILABLE',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('Rooms table created successfully');

        // Create bookings table
        console.log('Creating bookings table...');
        await pool.promise().query(`
            CREATE TABLE bookings (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                room_id INT NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                academic_level VARCHAR(100),
                program VARCHAR(255),
                phone VARCHAR(50),
                nationality VARCHAR(100),
                gender ENUM('male', 'female', 'other'),
                guardian_name VARCHAR(255),
                guardian_relationship VARCHAR(100),
                guardian_phone VARCHAR(50),
                status ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') DEFAULT 'PENDING',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
            )
        `);
        console.log('Bookings table created successfully');

        // Insert sample rooms
        console.log('Inserting sample rooms...');
        await pool.promise().query(`
            INSERT INTO rooms (room_number, room_type, price, hostel_name, status) VALUES
            -- Wagyingo Main Hostel
            ('M101', 'single', 5000, 'Wagyingo Main Hostel', 'AVAILABLE'),
            ('M102', 'single', 5000, 'Wagyingo Main Hostel', 'AVAILABLE'),
            ('M103', 'double', 8000, 'Wagyingo Main Hostel', 'AVAILABLE'),
            ('M104', 'double', 8000, 'Wagyingo Main Hostel', 'AVAILABLE'),
            ('M105', 'double', 8000, 'Wagyingo Main Hostel', 'AVAILABLE'),
            
            -- Wagyingo Onyx Hostel
            ('O101', 'single', 5500, 'Wagyingo Onyx Hostel', 'AVAILABLE'),
            ('O102', 'single', 5500, 'Wagyingo Onyx Hostel', 'AVAILABLE'),
            ('O103', 'double', 8500, 'Wagyingo Onyx Hostel', 'AVAILABLE'),
            ('O104', 'double', 8500, 'Wagyingo Onyx Hostel', 'AVAILABLE'),
            ('O105', 'double', 8500, 'Wagyingo Onyx Hostel', 'AVAILABLE'),
            
            -- Wagyingo Opal Hostel
            ('P101', 'single', 6000, 'Wagyingo Opal Hostel', 'AVAILABLE'),
            ('P102', 'single', 6000, 'Wagyingo Opal Hostel', 'AVAILABLE'),
            ('P103', 'double', 9000, 'Wagyingo Opal Hostel', 'AVAILABLE'),
            ('P104', 'double', 9000, 'Wagyingo Opal Hostel', 'AVAILABLE'),
            ('P105', 'double', 9000, 'Wagyingo Opal Hostel', 'AVAILABLE')
        `);
        console.log('Sample rooms inserted successfully');

        console.log('Database setup completed successfully');
    } catch (error) {
        console.error('Error setting up database:', error);
        console.error('Error details:', error.message);
    } finally {
        pool.end();
    }
}

setupDatabase(); 