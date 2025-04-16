-- Update max_occupants for quad rooms
UPDATE rooms 
SET max_occupants = 4 
WHERE room_type = 'Quad';

-- Update current_occupants if they exceed max_occupants
UPDATE rooms 
SET current_occupants = max_occupants 
WHERE room_type = 'Quad' AND current_occupants > max_occupants; 