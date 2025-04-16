const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./src/config/database');
const notificationsRouter = require('./src/routes/notifications');
const { authenticateToken } = require('./src/middleware/auth');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Routes
app.use('/api/notifications', notificationsRouter);

app.put('/api/admin/bookings/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        // Get the booking and room details
        const [booking] = await db.query(`
            SELECT b.room_id, r.room_type, r.current_occupants, r.max_occupants 
            FROM bookings b 
            JOIN rooms r ON b.room_id = r.id 
            WHERE b.id = ?
        `, [id]);

        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }

        // Update the booking status
        await db.query('UPDATE bookings SET status = ? WHERE id = ?', [status, id]);

        // Update room status and occupancy based on the booking status and room type
        if (status === 'approved') {
            if (booking.room_type === 'Single') {
                // For single rooms, mark as fully occupied
                await db.query(`
                    UPDATE rooms 
                    SET status = 'fully_occupied', 
                        current_occupants = max_occupants 
                    WHERE id = ?
                `, [booking.room_id]);
            } else {
                // For double/triple rooms, increment current_occupants
                const newOccupants = booking.current_occupants + 1;
                const newStatus = newOccupants >= booking.max_occupants ? 'fully_occupied' : 'partially_occupied';
                
                await db.query(`
                    UPDATE rooms 
                    SET status = ?, 
                        current_occupants = ? 
                    WHERE id = ?
                `, [newStatus, newOccupants, booking.room_id]);
            }
        } else if (status === 'rejected' || status === 'cancelled') {
            // For rejected/cancelled bookings, decrement occupancy if it was approved
            const [oldBooking] = await db.query('SELECT status FROM bookings WHERE id = ?', [id]);
            if (oldBooking.status === 'approved') {
                const newOccupants = Math.max(0, booking.current_occupants - 1);
                const newStatus = newOccupants === 0 ? 'available' : 'partially_occupied';
                
                await db.query(`
                    UPDATE rooms 
                    SET status = ?, 
                        current_occupants = ? 
                    WHERE id = ?
                `, [newStatus, newOccupants, booking.room_id]);
            }
        }

        res.json({ message: 'Booking status updated successfully' });
    } catch (error) {
        console.error('Error updating booking status:', error);
        res.status(500).json({ error: 'Failed to update booking status' });
    }
});

// Serve static files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 