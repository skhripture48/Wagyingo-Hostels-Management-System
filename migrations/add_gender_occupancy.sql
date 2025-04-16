-- Add gender_occupancy column to rooms table
ALTER TABLE rooms
ADD COLUMN gender_occupancy ENUM('male', 'female') DEFAULT NULL;

-- Update existing partially occupied or fully occupied rooms to have NULL gender_occupancy
UPDATE rooms 
SET gender_occupancy = NULL 
WHERE status = 'available';

-- Create an index on gender_occupancy for better query performance
CREATE INDEX idx_gender_occupancy ON rooms(gender_occupancy); 