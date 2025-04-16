-- Create the database
CREATE DATABASE IF NOT EXISTS hostel_booking;
USE hostel_booking;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    preferred_hostel ENUM('Wagyingo Main Hostel', 'Wagyingo Onyx Hostel', 'Wagyingo Opal Hostel'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id INT PRIMARY KEY AUTO_INCREMENT,
    room_number VARCHAR(10) NOT NULL,
    hostel_name ENUM('Wagyingo Main Hostel', 'Wagyingo Onyx Hostel', 'Wagyingo Opal Hostel') NOT NULL,
    room_type ENUM('Single', 'Double', 'Triple', 'Quad') NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    status ENUM('available', 'partially_occupied', 'fully_occupied') DEFAULT 'available',
    current_occupants INT DEFAULT 0,
    max_occupants INT DEFAULT 1,
    gender_occupancy ENUM('male', 'female') DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Update max_occupants based on room_type
UPDATE rooms SET max_occupants = 
    CASE 
        WHEN room_type = 'Single' THEN 1
        WHEN room_type = 'Double' THEN 2
        WHEN room_type = 'Triple' THEN 3
        WHEN room_type = 'Quad' THEN 4
    END;

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    room_id INT NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    academic_level VARCHAR(50) NOT NULL,
    program VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    nationality VARCHAR(50) NOT NULL,
    gender ENUM('Male', 'Female') NOT NULL,
    guardian_name VARCHAR(100) NOT NULL,
    guardian_relationship VARCHAR(50) NOT NULL,
    guardian_phone VARCHAR(20) NOT NULL,
    status ENUM('pending', 'approved', 'cancelled') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    payment_method ENUM('mobile_money', 'bank') NOT NULL,
    payment_status ENUM('pending', 'paid', 'rejected') DEFAULT 'pending',
    receipt_path VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

-- Table for storing push notification subscriptions
CREATE TABLE IF NOT EXISTS user_push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    push_subscription JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert sample rooms for each hostel
INSERT INTO rooms (room_number, hostel_name, room_type, price) VALUES
-- Wagyingo Main Hostel
('M101', 'Wagyingo Main Hostel', 'Single', 5000),
('M102', 'Wagyingo Main Hostel', 'Double', 8000),
('M103', 'Wagyingo Main Hostel', 'Triple', 12000),

-- Wagyingo Onyx Hostel
('O101', 'Wagyingo Onyx Hostel', 'Single', 5500),
('O102', 'Wagyingo Onyx Hostel', 'Double', 8500),
('O103', 'Wagyingo Onyx Hostel', 'Triple', 12500),

-- Wagyingo Opal Hostel
('P101', 'Wagyingo Opal Hostel', 'Single', 6000),
('P102', 'Wagyingo Opal Hostel', 'Double', 9000),
('P103', 'Wagyingo Opal Hostel', 'Triple', 13000); 