-- Create maintenance_requests table
CREATE TABLE IF NOT EXISTS maintenance_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    room_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category ENUM('plumbing', 'electrical', 'furniture', 'appliance', 'other') NOT NULL,
    priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL,
    status ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
);

-- Create maintenance_updates table
CREATE TABLE IF NOT EXISTS maintenance_updates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    maintenance_request_id INT NOT NULL,
    status ENUM('pending', 'in_progress', 'completed', 'cancelled') NOT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (maintenance_request_id) REFERENCES maintenance_requests(id)
);

-- Create announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    hostel_name VARCHAR(100) NOT NULL,
    priority ENUM('normal', 'important', 'urgent') NOT NULL DEFAULT 'normal',
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create community_events table
CREATE TABLE IF NOT EXISTS community_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    hostel_name VARCHAR(100) NOT NULL,
    event_date DATE NOT NULL,
    event_time TIME NOT NULL,
    location VARCHAR(255) NOT NULL,
    capacity INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create event_registrations table
CREATE TABLE IF NOT EXISTS event_registrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    registration_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES community_events(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
); 