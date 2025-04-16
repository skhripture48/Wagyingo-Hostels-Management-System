-- Create the database
CREATE DATABASE IF NOT EXISTS hostel_booking;
USE hostel_booking;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
    id INT PRIMARY KEY AUTO_INCREMENT,
    room_number VARCHAR(10) NOT NULL,
    hostel_name ENUM('Wagyingo Main Hostel', 'Wagyingo Onyx Hostel', 'Wagyingo Opal Hostel') NOT NULL,
    room_type ENUM('Single', 'Double', 'Triple') NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    status ENUM('available', 'booked') DEFAULT 'available',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    room_id INT NOT NULL,
    check_in_date DATE NOT NULL,
    check_out_date DATE NOT NULL,
    status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- Maintenance Requests table
CREATE TABLE IF NOT EXISTS maintenance_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    room_id INT NOT NULL,
    category ENUM('plumbing', 'electrical', 'furniture', 'cleaning', 'security', 'others') NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    status ENUM('pending', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending',
    priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- Hostel Updates/Announcements table
CREATE TABLE IF NOT EXISTS hostel_announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hostel_name ENUM('Wagyingo Main Hostel', 'Wagyingo Onyx Hostel', 'Wagyingo Opal Hostel', 'all') NOT NULL,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    priority ENUM('normal', 'important', 'urgent') DEFAULT 'normal',
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Maintenance Updates table (for tracking progress)
CREATE TABLE IF NOT EXISTS maintenance_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    status ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL,
    comment TEXT NOT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES maintenance_requests(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Resident Feedback table
CREATE TABLE IF NOT EXISTS resident_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    category ENUM('general', 'facilities', 'services', 'security', 'cleanliness', 'others') NOT NULL,
    title VARCHAR(100) NOT NULL,
    content TEXT NOT NULL,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    status ENUM('pending', 'reviewed', 'addressed') DEFAULT 'pending',
    is_anonymous BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Community Events table
CREATE TABLE IF NOT EXISTS community_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    event_date TIMESTAMP NOT NULL,
    location VARCHAR(100) NOT NULL,
    hostel_name ENUM('Wagyingo Main Hostel', 'Wagyingo Onyx Hostel', 'Wagyingo Opal Hostel', 'all') NOT NULL,
    max_participants INT NULL,
    registration_deadline TIMESTAMP NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Event Registrations table
CREATE TABLE IF NOT EXISTS event_registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status ENUM('registered', 'cancelled', 'attended') DEFAULT 'registered',
    FOREIGN KEY (event_id) REFERENCES community_events(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
); 