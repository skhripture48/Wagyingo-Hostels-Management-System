USE hostel_booking;

-- Table for storing push notification subscriptions
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subscription JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
); 