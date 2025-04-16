-- Drop the existing bookings table
DROP TABLE IF EXISTS bookings;

-- Create the updated bookings table with new fields
CREATE TABLE bookings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    room_id INT NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    academic_level ENUM('Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6', 'Postgraduate', 'Service Personnel') NOT NULL,
    program VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    nationality VARCHAR(50) NOT NULL,
    gender ENUM('Male', 'Female', 'Other') NOT NULL,
    guardian_name VARCHAR(100) NOT NULL,
    guardian_relationship VARCHAR(50) NOT NULL,
    guardian_phone VARCHAR(20) NOT NULL,
    status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
); 

UPDATE rooms 
SET status = 'available' 
WHERE hostel_name = 'Wagyingo Main Hostel' 
AND room_number IN ('M101', 'M102', 'M103');

UPDATE bookings b
JOIN rooms r ON b.room_id = r.id
SET b.status = 'cancelled'
WHERE r.hostel_name = 'Wagyingo Main Hostel'
AND r.room_number IN ('M101', 'M102', 'M103'); 