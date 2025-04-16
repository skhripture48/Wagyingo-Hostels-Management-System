const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
const { sendVerificationEmail } = require('./config/email');
const webpush = require('web-push');
const WebSocket = require('ws');
require('dotenv').config();
const pool = require('./db');
const { authenticateToken } = require('../middleware/auth');

// Configuration for message cleanup
const CLEANUP_CONFIG = {
    retentionPeriod: process.env.CHAT_RETENTION_HOURS || 24, // hours
    backupEnabled: process.env.CHAT_BACKUP_ENABLED === 'true' || true,
    backupDir: path.join(__dirname, '../backups/chat')
};

// Function to create backup of messages before deletion
async function backupMessages(cutoffDate) {
    try {
        // Create backup directory if it doesn't exist
        if (!fs.existsSync(CLEANUP_CONFIG.backupDir)) {
            fs.mkdirSync(CLEANUP_CONFIG.backupDir, { recursive: true });
        }

        // Get messages to be deleted
        const [messages] = await pool.promise().query(`
            SELECT * FROM chat_messages 
            WHERE created_at < ?
        `, [cutoffDate]);

        if (messages.length > 0) {
            // Create backup file with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(CLEANUP_CONFIG.backupDir, `chat_backup_${timestamp}.json`);
            
            // Write messages to backup file
            fs.writeFileSync(backupFile, JSON.stringify(messages, null, 2));
            console.log(`Backup created: ${backupFile} with ${messages.length} messages`);

            // Backup associated files
            const uploadsBackupDir = path.join(CLEANUP_CONFIG.backupDir, `files_${timestamp}`);
            fs.mkdirSync(uploadsBackupDir, { recursive: true });

            // Copy files that have URLs in the messages
            for (const message of messages) {
                if (message.file_url) {
                    const originalPath = path.join(__dirname, '../public', message.file_url);
                    if (fs.existsSync(originalPath)) {
                        const fileName = path.basename(message.file_url);
                        const backupPath = path.join(uploadsBackupDir, fileName);
                        fs.copyFileSync(originalPath, backupPath);
                    }
                }
            }
            console.log(`Files backup created in: ${uploadsBackupDir}`);
        }
        return true;
    } catch (error) {
        console.error('Error creating backup:', error);
        return false;
    }
}

// Function to clean up old chat messages
async function cleanupOldMessages() {
    try {
        const retentionHours = CLEANUP_CONFIG.retentionPeriod;
        const cutoffDate = new Date(Date.now() - (retentionHours * 60 * 60 * 1000));
        
        console.log(`Starting cleanup of messages older than ${retentionHours} hours`);
        
        // Backup messages if enabled
        if (CLEANUP_CONFIG.backupEnabled) {
            await backupMessages(cutoffDate);
        }

        // Get files to delete before deleting messages
        const [files] = await pool.promise().query(
            'SELECT file_url FROM chat_messages WHERE created_at < ? AND file_url IS NOT NULL',
            [cutoffDate]
        );

        // Delete old messages
        const [result] = await pool.promise().query(
            'DELETE FROM chat_messages WHERE created_at < ?',
            [cutoffDate]
        );

        console.log(`Cleaned up ${result.affectedRows} old chat messages (retention: ${retentionHours} hours)`);

        // Delete associated files
        for (const file of files) {
            if (file.file_url) {
                try {
                    const filePath = path.join(__dirname, '..', 'public', file.file_url);
                    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                        await fs.promises.unlink(filePath);
                        console.log(`Deleted old file: ${filePath}`);
                    }
                } catch (error) {
                    console.error(`Error deleting file ${file.file_url}:`, error);
                }
            }
        }
    } catch (error) {
        console.error('Error during message cleanup:', error);
    }
}

// Run cleanup every 24 hours
setInterval(cleanupOldMessages, 24 * 60 * 60 * 1000);

// Run initial cleanup when server starts
cleanupOldMessages();

const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });
const port = process.env.PORT || 3000;

// Initialize database tables and columns
(async () => {
    try {
        // Create notification_log table if it doesn't exist
        await pool.promise().query(`
            CREATE TABLE IF NOT EXISTS notification_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                body TEXT NOT NULL,
                url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_title_created (title, created_at)
            )
        `);

        // Check and add columns to chat_messages table
        const [columns] = await pool.promise().query(`
            SELECT COLUMN_NAME 
            FROM INFORMATION_SCHEMA.COLUMNS 
            WHERE TABLE_NAME = 'chat_messages'
        `);
        
        const columnNames = columns.map(col => col.COLUMN_NAME);
        
        // Add is_deleted and is_edited if they don't exist
        if (!columnNames.includes('is_deleted') || !columnNames.includes('is_edited')) {
            await pool.promise().query(`
                ALTER TABLE chat_messages 
                ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE
            `);
            console.log('Added is_deleted and is_edited columns to chat_messages table');
        }

        // Add reply_to if it doesn't exist
        if (!columnNames.includes('reply_to')) {
            await pool.promise().query(`
                ALTER TABLE chat_messages 
                ADD COLUMN reply_to INT,
                ADD CONSTRAINT fk_reply_to 
                FOREIGN KEY (reply_to) 
                REFERENCES chat_messages(id) 
                ON DELETE SET NULL
            `);
            console.log('Added reply_to column to chat_messages table');
        }

    } catch (error) {
        console.error('Error initializing database:', error);
    }
})();

// Add role column to user_push_subscriptions table if it doesn't exist
pool.promise().query(`
    SELECT COLUMN_NAME 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'user_push_subscriptions' 
    AND COLUMN_NAME = 'role'
`).then(([columns]) => {
    if (columns.length === 0) {
        return pool.promise().query(`
            ALTER TABLE user_push_subscriptions 
            ADD COLUMN role VARCHAR(20) DEFAULT 'user' 
            AFTER push_subscription
        `);
    }
}).catch(error => {
    console.error('Error checking/adding role column:', error);
});

// Set VAPID details
webpush.setVapidDetails(
    'mailto:admin@wagyingo.com',
    'BPH_bYeETv82wTTnOSsBJ69_rxSELuBq_i8vVvIumpnYR0KTRVOeuAjg6riPtU299SBTy5BE2TYkQ1gMNb7x_hM',
    'x_WrmsYiaAv7uTfwqTDE1orCe9StBJ1zxakGgYE96kE'
);

// Endpoint to get VAPID public key
app.get('/api/notifications/vapid-public-key', (req, res) => {
    res.json({
        publicKey: 'BPH_bYeETv82wTTnOSsBJ69_rxSELuBq_i8vVvIumpnYR0KTRVOeuAjg6riPtU299SBTy5BE2TYkQ1gMNb7x_hM'
    });
});

// CORS configuration
app.use(cors({
    origin: true, // Allow all origins
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
    name: 'hostelBookingSession',
    store: new MySQLStore({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
    })
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    console.log('Request body:', req.body);
    console.log('Session:', req.session);
    console.log('Headers:', req.headers);
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, path) => {
        console.log('Serving static file:', path);
        // Add CORS headers for static files
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cache-Control', 'no-cache');
        
        // Set correct MIME types
        if (path.endsWith('.css')) {
            res.set('Content-Type', 'text/css');
        } else if (path.endsWith('.js')) {
            res.set('Content-Type', 'application/javascript');
        }
    }
}));

// Add a specific route for assets
app.get('/assets/*', (req, res, next) => {
    console.log('Asset request:', req.path);
    next();
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Determine the destination based on the route
        let uploadPath;
        if (req.path === '/api/bookings/upload-receipt') {
            uploadPath = path.join(__dirname, '..', 'public', 'uploads', 'receipts');
        } else if (req.path === '/api/chat/upload') {
            uploadPath = path.join(__dirname, '..', 'public', 'uploads', 'chat');
        } else {
            uploadPath = path.join(__dirname, '..', 'public', 'uploads');
        }
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Allow images, documents, and common file types
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|txt/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
});

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Test the connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to MySQL database');
    connection.release();
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// User registration
app.post('/api/register', async (req, res) => {
    console.log('Received registration request:', req.body);
    const { username, email, password, full_name, preferred_hostel } = req.body;
    
    // Validate required fields and trim whitespace
    const fields = {
        username: username ? username.trim() : '',
        email: email ? email.trim() : '',
        password: password || '',
        full_name: full_name ? full_name.trim() : '',
        preferred_hostel: preferred_hostel ? preferred_hostel.trim() : ''
    };
    
    // Check for empty fields
    const missingFields = Object.entries(fields)
        .filter(([_, value]) => !value)
        .reduce((acc, [key]) => ({ ...acc, [key]: true }), {});
    
    if (Object.keys(missingFields).length > 0) {
        console.log('Missing or empty fields:', missingFields);
        return res.status(400).json({ 
            error: 'All fields are required',
            missing: missingFields
        });
    }
    
    // Basic validation
    if (fields.password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    if (!fields.email.includes('@')) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    
    try {
        // Check if username or email already exists
        const checkQuery = 'SELECT id, username, email FROM users WHERE username = ? OR email = ?';
        const [existingUsers] = await pool.promise().query(checkQuery, [fields.username, fields.email]);
        
        if (existingUsers.length > 0) {
            const existing = existingUsers[0];
            if (existing.username === fields.username) {
                return res.status(400).json({ error: 'Username already exists' });
            }
            if (existing.email === fields.email) {
                return res.status(400).json({ error: 'Email already exists' });
            }
                    return res.status(400).json({ error: 'Username or email already exists' });
                }
        
        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        // Hash password
        const hashedPassword = await bcrypt.hash(fields.password, 10);
        
        // Insert new user - added status field back as it exists in the table
        const insertQuery = `
            INSERT INTO users (username, email, password, full_name, preferred_hostel, verification_token, is_verified, status) 
            VALUES (?, ?, ?, ?, ?, ?, FALSE, 'ACTIVE')
        `;
        
        const [result] = await pool.promise().query(insertQuery, [
            fields.username,
            fields.email,
            hashedPassword,
            fields.full_name,
            fields.preferred_hostel,
            verificationToken
        ]);
        
        console.log('User registered successfully:', { userId: result.insertId });
        
        try {
            // Send verification email
            const emailSent = await sendVerificationEmail(fields.email, verificationToken);
            
            if (!emailSent) {
                console.log('Failed to send verification email');
            }
        } catch (emailError) {
            console.error('Error sending verification email:', emailError);
            // Continue with registration even if email fails
        }
        
        // Remove session setup - users must verify email first
        
        res.status(201).json({ 
            message: 'Registration successful. Please check your email to verify your account.',
            redirect: '/login.html'  // Always redirect to login page
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Error registering user', 
            details: error.message 
        });
    }
});

// Email verification endpoint
app.get('/api/verify-email', async (req, res) => {
    const { token } = req.query;
    
    if (!token) {
        return res.status(400).json({ error: 'Verification token is required' });
    }
    
    try {
        const [users] = await pool.promise().query(
            'SELECT id, email FROM users WHERE verification_token = ? AND is_verified = FALSE',
            [token]
        );
        
        if (users.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired verification token' });
        }
        
        const user = users[0];
        
        // Update user verification status
        await pool.promise().query(
            'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = ?',
            [user.id]
        );
        
        // Redirect to login page with success message
        res.redirect('/login.html?verified=true');
        
    } catch (error) {
        console.error('Email verification error:', error);
        res.redirect('/login.html?error=verification_failed');
    }
});

// User login
app.post('/api/login', async (req, res) => {
    console.log('Received login request:', req.body);
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    
    try {
        // Use promise-based query for better error handling
        const [users] = await pool.promise().query(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [username, username]
        );
        
        if (users.length === 0) {
                console.log('Login failed: User not found');
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
        const user = users[0];
            const validPassword = await bcrypt.compare(password, user.password);
            
            if (!validPassword) {
                console.log('Login failed: Invalid password');
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
        // Check if email is verified
        if (!user.is_verified) {
            return res.status(403).json({ 
                error: 'Please verify your email address before logging in',
                needsVerification: true
            });
        }
        
        // Store user information in session
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            full_name: user.full_name,
            preferred_hostel: user.preferred_hostel,
            is_verified: user.is_verified
        };
        
        // Save session explicitly
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        
        console.log('Login successful:', { userId: user.id, role: user.role });
        
        // Send all necessary user data in the response
        const userData = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            full_name: user.full_name,
            preferred_hostel: user.preferred_hostel,
            is_verified: user.is_verified
        };
        
        // Redirect admin users to admin dashboard
        if (user.role === 'admin') {
            return res.json({ 
                message: 'Login successful',
                redirect: '/admin-dashboard.html',
                ...userData
            });
        }
        
        return res.json({ 
            message: 'Login successful',
            redirect: '/index.html',
            ...userData
        });
        
    } catch (error) {
        console.error('Login process error:', error);
        return res.status(500).json({ error: 'Error in login process', details: error.message });
    }
});

// Add a middleware to update session activity
app.use((req, res, next) => {
    if (req.session.user) {
        req.session.touch();
    }
    next();
});

// Check session status
app.get('/api/check-session', (req, res) => {
    if (req.session.user) {
        // Update the session's last activity time
        req.session.touch();
        res.json(req.session.user);
    } else {
        res.status(401).json({ error: 'No active session' });
    }
});

// Check hostel access
app.post('/api/check-hostel-access', (req, res) => {
    console.log('Checking hostel access...');
    if (!req.session.userId) {
        console.log('User not logged in');
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const { hostelName } = req.body;
    if (!hostelName) {
        return res.status(400).json({ error: 'Hostel name is required' });
    }

    const query = 'SELECT preferred_hostel FROM users WHERE id = ?';
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error checking hostel access:', err);
            return res.status(500).json({ error: 'Error checking hostel access' });
        }

        connection.query(query, [req.session.userId], (err, results) => {
            connection.release();
            if (err) {
                console.error('Error checking hostel access:', err);
                return res.status(500).json({ error: 'Error checking hostel access' });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            const userPreferredHostel = results[0].preferred_hostel;
            if (userPreferredHostel !== hostelName) {
                console.log('Access denied: User preferred hostel does not match');
                return res.status(403).json({ error: 'You do not have access to this hostel' });
            }

            console.log('Access granted to hostel:', hostelName);
            return res.json({ message: 'Access granted' });
        });
    });
});

// Get available rooms
app.get('/api/rooms', async (req, res) => {
    try {
        if (!req.session.user) {
            console.log('No user in session');
            return res.status(401).json({ error: 'Please login to view rooms' });
        }

        console.log('Session user:', req.session.user);

        // Get user's preferred hostel
        const [userResult] = await pool.promise().query(
            "SELECT preferred_hostel FROM users WHERE id = ?",
            [req.session.user.id]
        );
        const preferredHostel = userResult[0]?.preferred_hostel;

        console.log('User preferred hostel:', preferredHostel);

        // Get requested hostel from query parameters
        const requestedHostel = req.query.hostel;

        console.log('Requested hostel:', requestedHostel);

        // If a specific hostel is requested, check if it matches user's preferred hostel
        if (requestedHostel && requestedHostel !== preferredHostel) {
            console.log('Access denied: Hostel mismatch', { requestedHostel, preferredHostel });
            return res.status(403).json({ error: 'You do not have access to this hostel' });
        }

        // Log the query parameters
        console.log('Fetching rooms with params:', {
            preferredHostel,
            requestedHostel,
            userId: req.session.user.id
        });

        // Get available rooms for the requested hostel or user's preferred hostel
        const [rooms] = await pool.promise().query(
            "SELECT * FROM rooms WHERE status IN ('AVAILABLE', 'PARTIALLY_OCCUPIED') AND hostel_name = ? AND current_occupants < max_occupants",
            [requestedHostel || preferredHostel]
        );

        // Log the results
        console.log('Found rooms:', rooms);

        res.json(rooms);
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({ error: 'Failed to fetch rooms', details: error.message });
    }
});

// Book a room
app.post('/api/bookings', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Please login to book a room' });
        }

        const {
            roomId, fullName, academicLevel, program,
            phone, nationality, gender, guardianName,
            guardianRelationship, guardianPhone
        } = req.body;

        // Get room details including current gender occupancy
        const [rooms] = await pool.promise().query(
            'SELECT * FROM rooms WHERE id = ?',
            [roomId]
        );

        const room = rooms[0];
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }

        if (room.status === 'fully_occupied') {
            return res.status(400).json({ error: 'Room is fully occupied' });
        }

        // Check if adding another occupant would exceed max_occupants
        if (room.current_occupants >= room.max_occupants) {
            return res.status(400).json({ error: 'Room has reached maximum occupancy' });
        }

        // Normalize gender to lowercase for comparison
        const normalizedGender = gender.toLowerCase();
        
        // Check gender compatibility
        if (room.current_occupants > 0 && room.gender_occupancy && 
            room.gender_occupancy.toLowerCase() !== normalizedGender) {
            return res.status(400).json({ 
                error: `This room is currently occupied by ${room.gender_occupancy} students only`
            });
        }

        // Check if user already has an active booking
        const [existingBookings] = await pool.promise().query(
            'SELECT * FROM bookings WHERE user_id = ? AND status IN ("pending", "approved")',
            [req.session.user.id]
        );

        if (existingBookings.length > 0) {
            return res.status(400).json({ error: 'You already have an active booking' });
        }

        const connection = await pool.promise().getConnection();

        try {
            await connection.beginTransaction();

            // Create the booking
            const [bookingResult] = await connection.query(
                `INSERT INTO bookings (
                    user_id, room_id, full_name, academic_level, program, 
                    phone, nationality, gender, guardian_name, 
                    guardian_relationship, guardian_phone, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [
                    req.session.user.id, roomId, fullName, academicLevel, program,
                    phone, nationality, gender, guardianName,
                    guardianRelationship, guardianPhone
                ]
            );

            // Increment current_occupants by 1 when booking is created
            await connection.query(
                `UPDATE rooms 
                 SET status = 'partially_occupied',
                     current_occupants = current_occupants + 1,
                     gender_occupancy = ?
                 WHERE id = ?`,
                [normalizedGender, roomId]
            );

            await connection.commit();

            res.status(201).json({
                message: 'Booking created successfully',
                bookingId: bookingResult.insertId
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ error: 'Failed to create booking', details: error.message });
    }
});

// Get user's booking details
app.get('/api/bookings/user', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Please login first' });
    }
    
    const query = `
        SELECT b.*, r.room_number, r.hostel_name, r.room_type, r.price
        FROM bookings b
        JOIN rooms r ON b.room_id = r.id
        WHERE b.user_id = ? AND b.status != 'cancelled'
        ORDER BY b.created_at DESC
        LIMIT 1
    `;

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error fetching booking details:', err);
            return res.status(500).json({ error: 'Error fetching booking details' });
        }

        connection.query(query, [req.session.user.id], (err, results) => {
            connection.release();
            if (err) {
                console.error('Error fetching booking details:', err);
                return res.status(500).json({ error: 'Error fetching booking details' });
            }

            if (results.length === 0) {
                return res.json(null);
            }

            const booking = results[0];
            return res.json({
                id: booking.id,
                full_name: booking.full_name,
                academic_level: booking.academic_level,
                program: booking.program,
                phone: booking.phone,
                nationality: booking.nationality,
                gender: booking.gender,
                guardian_name: booking.guardian_name,
                guardian_relationship: booking.guardian_relationship,
                guardian_phone: booking.guardian_phone,
                status: booking.status,
                room_number: booking.room_number,
                hostel_name: booking.hostel_name,
                room_type: booking.room_type,
                price: booking.price,
                created_at: booking.created_at
            });
        });
    });
});

// Update booking
app.put('/api/bookings/update', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Please login to update booking' });
        }

        const {
            bookingId, fullName, academicLevel, program, phone,
            nationality, gender, guardianName, guardianRelationship, guardianPhone
        } = req.body;

        // First verify that this booking belongs to the user
        const [verifyResult] = await pool.promise().query(
            'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
            [bookingId, req.session.user.id]
        );

        if (verifyResult.length === 0) {
            return res.status(403).json({ error: 'You do not have permission to update this booking' });
        }

        // Update the booking
        const updateQuery = `
            UPDATE bookings 
            SET full_name = ?, academic_level = ?, program = ?, 
                phone = ?, nationality = ?, gender = ?, 
                guardian_name = ?, guardian_relationship = ?, guardian_phone = ?
            WHERE id = ? AND user_id = ?
        `;

        await pool.promise().query(updateQuery, [
            fullName, academicLevel, program, phone, nationality,
            gender, guardianName, guardianRelationship, guardianPhone,
            bookingId, req.session.user.id
        ]);

        return res.json({ message: 'Booking updated successfully' });
    } catch (error) {
        console.error('Error updating booking:', error);
        res.status(500).json({ error: 'Failed to update booking', details: error.message });
    }
});

// Cancel booking
app.put('/api/bookings/cancel/:id', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Please login first' });
    }

    const bookingId = req.params.id;
    let connection;

    try {
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        // First verify that this booking belongs to the user and get room details
        const [verifyResult] = await connection.query(
            `SELECT b.*, r.current_occupants, r.max_occupants, r.gender_occupancy
             FROM bookings b 
             JOIN rooms r ON b.room_id = r.id 
             WHERE b.id = ? AND b.user_id = ?`,
            [bookingId, req.session.user.id]
        );

        if (verifyResult.length === 0) {
            await connection.rollback();
            return res.status(403).json({ error: 'You do not have permission to cancel this booking' });
        }

        const booking = verifyResult[0];

        // Update booking status
        await connection.query(
            'UPDATE bookings SET status = "cancelled" WHERE id = ?',
            [bookingId]
        );

        // Update room status and occupancy
        const newOccupants = Math.max(0, booking.current_occupants - 1);
        const newStatus = newOccupants === 0 ? 'available' : 'partially_occupied';
        const newGenderOccupancy = newOccupants === 0 ? null : booking.gender_occupancy;
        
        await connection.query(
            `UPDATE rooms 
             SET status = ?, 
                 current_occupants = ?,
                 gender_occupancy = ?
             WHERE id = ?`,
            [newStatus, newOccupants, newGenderOccupancy, booking.room_id]
        );

        await connection.commit();
        return res.json({ message: 'Booking cancelled successfully' });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error cancelling booking:', error);
        return res.status(500).json({ error: 'Failed to cancel booking', details: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Admin Middleware
const checkAdminRole = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    next();
};

// Admin Session Check
app.get('/api/check-admin-session', (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        res.status(200).json({ status: 'authenticated', user: req.session.user });
    } else {
        res.status(401).json({ error: 'Not authenticated as admin' });
    }
});

// Admin Routes
// Get all bookings
app.get('/api/bookings/all', checkAdminRole, async (req, res) => {
    try {
        const query = `
            SELECT b.*, u.full_name, r.room_number 
            FROM bookings b 
            JOIN users u ON b.user_id = u.id 
            JOIN rooms r ON b.room_id = r.id 
            ORDER BY b.created_at DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// Update booking status (admin only)
app.put('/api/admin/bookings/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    let connection;
    
    try {
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        // Get the booking details
        const [bookings] = await connection.query(
            'SELECT b.*, r.current_occupants, r.max_occupants, r.gender_occupancy FROM bookings b JOIN rooms r ON b.room_id = r.id WHERE b.id = ?',
            [id]
        );

        if (bookings.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Booking not found' });
        }

        const booking = bookings[0];
        const roomId = booking.room_id;
        const oldStatus = booking.status.toLowerCase();
        const newStatus = status.toLowerCase();

        // Update booking status
        await connection.query(
            'UPDATE bookings SET status = ? WHERE id = ?',
            [status, id]
        );

        // Handle room status and occupancy updates based on status transition
        if (newStatus === 'rejected' || newStatus === 'cancelled') {
            // Decrement occupants by 1 and update room status
            const newOccupants = Math.max(0, booking.current_occupants - 1);
            const newStatus = newOccupants === 0 ? 'available' : 'partially_occupied';
            const newGenderOccupancy = newOccupants === 0 ? null : booking.gender_occupancy;
            
            await connection.query(
                'UPDATE rooms SET status = ?, current_occupants = ?, gender_occupancy = ? WHERE id = ?',
                [newStatus, newOccupants, newGenderOccupancy, roomId]
            );
        } else if (newStatus === 'approved' && (oldStatus === 'rejected' || oldStatus === 'cancelled')) {
            // Increment occupants by 1 if approving from rejected/cancelled
            const newOccupants = booking.current_occupants + 1;
            const newStatus = newOccupants >= booking.max_occupants ? 'fully_occupied' : 'partially_occupied';
            const newGenderOccupancy = booking.current_occupants === 0 ? 
                booking.gender.toLowerCase() : booking.gender_occupancy;
            
            await connection.query(
                'UPDATE rooms SET status = ?, current_occupants = ?, gender_occupancy = ? WHERE id = ?',
                [newStatus, newOccupants, newGenderOccupancy, roomId]
            );
        }
        // No change in occupants if approving from pending

        await connection.commit();
        res.json({ message: 'Booking status updated successfully' });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error updating booking status:', error);
        res.status(500).json({ message: 'Error updating booking status' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Get all rooms (admin version with more details)
app.get('/api/rooms', checkAdminRole, async (req, res) => {
    try {
        const query = `
            SELECT r.*, 
                   COUNT(b.id) FILTER (WHERE b.status = 'APPROVED') as active_bookings
            FROM rooms r
            LEFT JOIN bookings b ON r.id = b.room_id
            GROUP BY r.id
            ORDER BY r.room_number
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({ error: 'Failed to fetch rooms' });
    }
});

// Add new room
app.post('/api/rooms', checkAdminRole, async (req, res) => {
    const { room_number, room_type, price, hostel_name } = req.body;
    
    try {
        // Validate hostel name
        const validHostels = ['Wagyingo Main Hostel', 'Wagyingo Onyx Hostel', 'Wagyingo Opal Hostel'];
        if (!validHostels.includes(hostel_name)) {
            return res.status(400).json({ error: 'Invalid hostel name' });
        }

        // Validate room type
        const validRoomTypes = ['single', 'double', 'triple', 'quad'];
        if (!validRoomTypes.includes(room_type)) {
            return res.status(400).json({ error: 'Invalid room type' });
        }

        // Set max_occupants based on room type
        let max_occupants;
        switch(room_type) {
            case 'single': max_occupants = 1; break;
            case 'double': max_occupants = 2; break;
            case 'triple': max_occupants = 3; break;
            case 'quad': max_occupants = 4; break;
            default: max_occupants = 1;
        }

        // Check if room number already exists in the same hostel
        const checkQuery = 'SELECT id FROM rooms WHERE room_number = ? AND hostel_name = ?';
        const [existingRooms] = await pool.promise().query(checkQuery, [room_number, hostel_name]);
        
        if (existingRooms.length > 0) {
            return res.status(400).json({ error: `Room number ${room_number} already exists in ${hostel_name}` });
        }

        const query = `
            INSERT INTO rooms (room_number, room_type, price, hostel_name, status, max_occupants, current_occupants) 
            VALUES (?, ?, ?, ?, 'AVAILABLE', ?, 0)
        `;
        
        const [result] = await pool.promise().query(query, [room_number, room_type, price, hostel_name, max_occupants]);
        
        res.status(201).json({
            message: 'Room added successfully',
            roomId: result.insertId
        });
    } catch (error) {
        console.error('Error adding room:', error);
        res.status(500).json({ 
            error: 'Failed to add room',
            details: error.message 
        });
    }
});

// Delete room
app.delete('/api/rooms/:id', checkAdminRole, async (req, res) => {
    const { id } = req.params;
    
    try {
        // Check if room has active bookings
        const [bookings] = await pool.promise().query(
            'SELECT COUNT(*) as count FROM bookings WHERE room_id = ? AND status = "approved"',
            [id]
        );
        
        if (bookings[0].count > 0) {
            return res.status(400).json({ error: 'Cannot delete room with active bookings' });
        }
        
        const [result] = await pool.promise().query(
            'DELETE FROM rooms WHERE id = ?',
            [id]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        res.json({ message: 'Room deleted successfully' });
    } catch (error) {
        console.error('Error deleting room:', error);
        res.status(500).json({ error: 'Failed to delete room' });
    }
});

// Get all users (admin only)
app.get('/api/admin/users', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const [users] = await pool.promise().query(`
            SELECT id, username, email, full_name, preferred_hostel, role, status, created_at, is_verified 
            FROM users 
            ORDER BY created_at DESC
        `);

        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get all bookings (admin only)
app.get('/api/admin/bookings', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const [bookings] = await pool.promise().query(`
            SELECT 
                b.*,
                u.username,
                u.email,
                u.full_name as user_full_name,
                r.room_number,
                r.hostel_name,
                r.room_type,
                r.price
            FROM bookings b
            JOIN users u ON b.user_id = u.id
            JOIN rooms r ON b.room_id = r.id
            ORDER BY b.created_at DESC
        `);

        res.json(bookings);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ error: 'Failed to fetch bookings' });
    }
});

// Update user status (admin only)
app.put('/api/admin/users/:id/status', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const { status } = req.body;
        const userId = req.params.id;

        if (!['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        await pool.promise().query(
            'UPDATE users SET status = ? WHERE id = ?',
            [status, userId]
        );

        res.json({ message: 'User status updated successfully' });
    } catch (error) {
        console.error('Error updating user status:', error);
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

// Add new user
app.post('/api/users', checkAdminRole, async (req, res) => {
    const { full_name, email, password, role } = req.body;
    
    try {
        // Check if email already exists
        const checkQuery = 'SELECT id FROM users WHERE email = $1';
        const checkResult = await pool.query(checkQuery, [email]);
        
        if (checkResult.rows.length > 0) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const query = `
            INSERT INTO users (full_name, email, password, role, status) 
            VALUES ($1, $2, $3, $4, 'ACTIVE') 
            RETURNING id, full_name, email, role, status
        `;
        const result = await pool.query(query, [full_name, email, hashedPassword, role]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding user:', error);
        res.status(500).json({ error: 'Failed to add user' });
    }
});

// Delete user
app.delete('/api/users/:id', checkAdminRole, async (req, res) => {
    const { id } = req.params;
    let connection;
    
    try {
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        // Check if user has active bookings
        const [bookings] = await connection.query(
            'SELECT COUNT(*) as count FROM bookings WHERE user_id = ? AND status = ?',
            [id, 'approved']
        );
        
        if (bookings[0].count > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Cannot delete user with active bookings' });
        }
        
        // Delete user's payments
        await connection.query('DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)', [id]);
        
        // Delete user's bookings
        await connection.query('DELETE FROM bookings WHERE user_id = ?', [id]);
        
        // Delete the user
        const [result] = await connection.query('DELETE FROM users WHERE id = ?', [id]);
        
        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'User not found' });
        }
        
        await connection.commit();
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user', details: error.message });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Edit room
app.put('/api/rooms/:id', checkAdminRole, async (req, res) => {
    const { id } = req.params;
    const { room_number, room_type, price, status, hostel_name, gender_occupancy } = req.body;
    
    try {
        // Validate hostel name
        const validHostels = ['Wagyingo Main Hostel', 'Wagyingo Onyx Hostel', 'Wagyingo Opal Hostel'];
        if (!validHostels.includes(hostel_name)) {
            return res.status(400).json({ error: 'Invalid hostel name' });
        }

        // Check if room exists
        const checkQuery = 'SELECT id FROM rooms WHERE id = ?';
        const [checkResult] = await pool.promise().query(checkQuery, [id]);
        
        if (checkResult.length === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        // Update room
        const query = `
            UPDATE rooms 
            SET room_number = ?, 
                room_type = ?, 
                price = ?, 
                status = ?,
                hostel_name = ?,
                gender_occupancy = CASE 
                    WHEN ? = 'available' THEN NULL
                    ELSE ?
                END,
                current_occupants = CASE 
                    WHEN ? = 'available' THEN 0
                    WHEN ? = 'fully_occupied' THEN max_occupants
                    WHEN ? = 'partially_occupied' THEN 1
                    ELSE current_occupants
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        const [result] = await pool.promise().query(query, [
            room_number, room_type, price, status, hostel_name,
            status, gender_occupancy, // For gender_occupancy CASE
            status, status, status, // For current_occupants CASE
            id
        ]);
        res.json({ message: 'Room updated successfully' });
    } catch (error) {
        console.error('Error updating room:', error);
        res.status(500).json({ error: 'Failed to update room' });
    }
});

// Edit user
app.put('/api/users/:id', checkAdminRole, async (req, res) => {
    const { id } = req.params;
    const { full_name, email, role, status, password } = req.body;
    
    try {
        // Check if user exists
        const checkQuery = 'SELECT id FROM users WHERE id = ?';
        const [checkResult] = await pool.promise().query(checkQuery, [id]);
        
        if (checkResult.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check if email is already taken by another user
        if (email) {
            const emailQuery = 'SELECT id FROM users WHERE email = ? AND id != ?';
            const [emailResult] = await pool.promise().query(emailQuery, [email, id]);
            
            if (emailResult.length > 0) {
                return res.status(400).json({ error: 'Email already in use' });
            }
        }
        
        // Build update query dynamically based on provided fields
        const updates = [];
        const values = [];
        
        if (full_name) {
            updates.push('full_name = ?');
            values.push(full_name);
        }
        
        if (email) {
            updates.push('email = ?');
            values.push(email);
        }
        
        if (role) {
            updates.push('role = ?');
            values.push(role);
        }
        
        if (status) {
            updates.push('status = ?');
            values.push(status);
        }
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            updates.push('password = ?');
            values.push(hashedPassword);
        }
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        
        // Add user ID as the last parameter
        values.push(id);
        
        const query = `
            UPDATE users 
            SET ${updates.join(', ')} 
            WHERE id = ?
        `;
        
        const [result] = await pool.promise().query(query, values);
        
        // Fetch the updated user
        const [updatedUser] = await pool.promise().query(
            'SELECT id, username, email, full_name, preferred_hostel, role, status, created_at, updated_at FROM users WHERE id = ?',
            [id]
        );
        
        res.json(updatedUser[0]);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Get all rooms (admin only)
app.get('/api/admin/rooms', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const [rooms] = await pool.promise().query(`
            SELECT r.*, 
                   COUNT(b.id) as total_bookings,
                   COUNT(CASE WHEN b.status = 'APPROVED' THEN 1 END) as active_bookings
            FROM rooms r
            LEFT JOIN bookings b ON r.id = b.room_id
            GROUP BY r.id
            ORDER BY r.room_number
        `);

        res.json(rooms);
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).json({ error: 'Failed to fetch rooms' });
    }
});

// Get single room by ID (admin only)
app.get('/api/admin/rooms/:id', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const [rooms] = await pool.promise().query(
            'SELECT * FROM rooms WHERE id = ?',
            [req.params.id]
        );

        if (rooms.length === 0) {
            return res.status(404).json({ error: 'Room not found' });
        }

        res.json(rooms[0]);
    } catch (error) {
        console.error('Error fetching room:', error);
        res.status(500).json({ error: 'Failed to fetch room' });
    }
});

// Get booking details by ID (admin view)
app.get('/api/bookings/:id', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Please login first' });
    }

    const bookingId = req.params.id;
    
    const query = `
        SELECT b.*, r.room_number, r.hostel_name, r.room_type, r.price,
               u.username, u.email, u.full_name as user_full_name
        FROM bookings b
        JOIN rooms r ON b.room_id = r.id
        JOIN users u ON b.user_id = u.id
        WHERE b.id = ?
    `;

    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error getting booking details:', err);
            return res.status(500).json({ error: 'Error getting booking details' });
        }

        connection.query(query, [bookingId], (err, results) => {
            connection.release();
            if (err) {
                console.error('Error getting booking details:', err);
                return res.status(500).json({ error: 'Error getting booking details' });
            }

            if (results.length === 0) {
                return res.status(404).json({ error: 'Booking not found' });
            }

            const booking = results[0];
            return res.json({
                id: booking.id,
                username: booking.username,
                email: booking.email,
                full_name: booking.user_full_name || booking.full_name,
                academic_level: booking.academic_level,
                program: booking.program,
                phone: booking.phone,
                nationality: booking.nationality,
                gender: booking.gender,
                guardian_name: booking.guardian_name,
                guardian_relationship: booking.guardian_relationship,
                guardian_phone: booking.guardian_phone,
                status: booking.status,
                room_number: booking.room_number,
                hostel_name: booking.hostel_name,
                room_type: booking.room_type,
                price: booking.price,
                created_at: booking.created_at
            });
        });
    });
});

// User logout
app.post('/api/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.clearCookie('hostelBookingSession');
        res.json({ message: 'Logged out successfully' });
    });
});

// Middleware to check if user is logged in
const checkSession = (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Please login first' });
    }
    next();
};

// Upload payment receipt
app.post('/api/bookings/upload-receipt', checkSession, upload.single('receipt'), async (req, res) => {
    let connection;
    try {
        console.log('Receipt upload request received:', {
            file: req.file,
            body: req.body,
            user: req.session.user
        });

        if (!req.file) {
            console.log('No file uploaded');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { bookingId, paymentMethod } = req.body;
        
        if (!bookingId || !paymentMethod) {
            console.log('Missing required fields:', { bookingId, paymentMethod });
            return res.status(400).json({ error: 'Booking ID and payment method are required' });
        }

        // Validate payment method
        if (!['mobile_money', 'bank'].includes(paymentMethod)) {
            console.log('Invalid payment method:', paymentMethod);
            return res.status(400).json({ error: 'Invalid payment method. Must be mobile_money or bank' });
        }

        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        try {
            // Verify the booking belongs to the user
            const [booking] = await connection.query(
                'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
                [bookingId, req.session.user.id]
            );

            if (booking.length === 0) {
                console.log('Booking not found or unauthorized:', { bookingId, userId: req.session.user.id });
                throw new Error('Booking not found or unauthorized');
            }

            // Store the relative path from public directory
            const relativePath = path.join('uploads', 'receipts', req.file.filename).replace(/\\/g, '/');
            console.log('Storing relative path:', relativePath);

            // Check if payment record exists
            const [existingPayment] = await connection.query(
                'SELECT * FROM payments WHERE booking_id = ?',
                [bookingId]
            );

            if (existingPayment.length > 0) {
                // Delete old receipt file if it exists
                if (existingPayment[0].receipt_path) {
                    const oldFilePath = path.join(__dirname, '../public', existingPayment[0].receipt_path);
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                    }
                }
                // Update existing payment record
                await connection.query(
                    'UPDATE payments SET payment_method = ?, receipt_path = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?',
                    [paymentMethod, relativePath, 'pending', bookingId]
                );
            } else {
                // Create new payment record
                await connection.query(
                    'INSERT INTO payments (booking_id, payment_method, receipt_path, payment_status) VALUES (?, ?, ?, ?)',
                    [bookingId, paymentMethod, relativePath, 'pending']
                );
            }

            await connection.commit();

            console.log('Receipt uploaded successfully:', {
                bookingId,
                paymentMethod,
                filePath: relativePath
            });

            res.json({ 
                message: 'Receipt uploaded successfully',
                receiptPath: relativePath
            });
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw error;
        }
    } catch (error) {
        console.error('Error uploading receipt:', error);
        res.status(500).json({ 
            error: 'Failed to upload receipt',
            details: error.message 
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Get payment status
app.get('/api/bookings/:id/payment-status', checkSession, async (req, res) => {
    try {
        // Check if user is admin
        const isAdmin = req.session.user.role === 'admin';
        
        // If admin, skip the user check
        if (!isAdmin) {
            // For regular users, check if the booking belongs to them
            const [booking] = await pool.promise().query(
                'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
                [req.params.id, req.session.user.id]
            );

            if (booking.length === 0) {
                return res.status(404).json({ error: 'Booking not found' });
            }
        }

        // Get payment details
        const [payment] = await pool.promise().query(
            'SELECT payment_status, payment_method, receipt_path, created_at FROM payments WHERE booking_id = ?',
            [req.params.id]
        );

        if (payment.length === 0) {
            return res.json({
                payment_status: null,
                payment_method: null,
                receipt_path: null,
                created_at: null
            });
        }

        res.json(payment[0]);
    } catch (error) {
        console.error('Error fetching payment status:', error);
        res.status(500).json({ error: 'Failed to fetch payment status' });
    }
});

// Update payment status (admin only)
app.put('/api/bookings/:id/payment-status', checkAdminRole, async (req, res) => {
    let connection;
    try {
        const { status } = req.body;
        const bookingId = req.params.id;

        if (!['pending', 'paid', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid payment status' });
        }

        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        try {
            // Update payment status in payments table
            const [result] = await connection.query(
                'UPDATE payments SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE booking_id = ?',
                [status, bookingId]
            );

            if (result.affectedRows === 0) {
                throw new Error('Payment record not found');
            }

            // If payment is approved, update booking status
            if (status === 'paid') {
                await connection.query(
                    'UPDATE bookings SET status = ? WHERE id = ?',
                    ['approved', bookingId]
                );
            }

            await connection.commit();
            res.json({ message: 'Payment status updated successfully' });
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw error;
        }
    } catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ 
            error: 'Failed to update payment status',
            details: error.message 
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Delete receipt
app.delete('/api/bookings/:id/delete-receipt', checkSession, async (req, res) => {
    let connection;
    try {
        const bookingId = req.params.id;

        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        try {
            // Verify the booking belongs to the user
            const [booking] = await connection.query(
                'SELECT * FROM bookings WHERE id = ? AND user_id = ?',
                [bookingId, req.session.user.id]
            );

            if (booking.length === 0) {
                throw new Error('Booking not found or unauthorized');
            }

            // Get the receipt path before deleting
            const [payment] = await connection.query(
                'SELECT receipt_path FROM payments WHERE booking_id = ?',
                [bookingId]
            );

            if (payment.length === 0) {
                throw new Error('No receipt found for this booking');
            }

            // Delete the physical file
            const filePath = path.join(__dirname, '../public', payment[0].receipt_path);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // Delete the payment record
            await connection.query(
                'DELETE FROM payments WHERE booking_id = ?',
                [bookingId]
            );

            await connection.commit();

            console.log('Receipt deleted successfully:', {
                bookingId,
                filePath: payment[0].receipt_path
            });

            res.json({ message: 'Receipt deleted successfully' });
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw error;
        }
    } catch (error) {
        console.error('Error deleting receipt:', error);
        res.status(500).json({ 
            error: 'Failed to delete receipt',
            details: error.message 
        });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something broke!', details: err.message });
});

// Get single user details (admin only)
app.get('/api/admin/users/:id', async (req, res) => {
    try {
        if (!req.session.user || req.session.user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin only.' });
        }

        const userId = req.params.id;
        const [users] = await pool.promise().query(`
            SELECT id, username, email, full_name, role, status, created_at, is_verified 
            FROM users 
            WHERE id = ?
        `, [userId]);

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(users[0]);
    } catch (error) {
        console.error('Error fetching user details:', error);
        res.status(500).json({ error: 'Failed to fetch user details' });
    }
});

// Middleware to check if user is a resident
const checkResidentStatus = async (req, res, next) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        // Check if user has an approved booking with paid status
        const [bookings] = await pool.promise().query(`
            SELECT b.id, r.hostel_name 
            FROM bookings b
            JOIN payments p ON b.id = p.booking_id
            JOIN rooms r ON b.room_id = r.id
            WHERE b.user_id = ? 
            AND b.status = 'approved'
            AND p.payment_status = 'paid'
            LIMIT 1
        `, [req.session.user.id]);

        // Add resident status to request object
        req.isResident = bookings.length > 0;
        req.hostel_name = bookings.length > 0 ? bookings[0].hostel_name : null;
        
        // Continue to the next middleware or route handler
        next();
    } catch (error) {
        console.error('Error checking resident status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Check resident status
app.get('/api/check-resident-status', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const [bookings] = await pool.promise().query(`
            SELECT b.id, r.hostel_name 
            FROM bookings b
            JOIN payments p ON b.id = p.booking_id
            JOIN rooms r ON b.room_id = r.id
            WHERE b.user_id = ? 
            AND b.status = 'approved'
            AND p.payment_status = 'paid'
            LIMIT 1
        `, [req.session.user.id]);

        res.json({
            id: req.session.user.id,
            isResident: bookings.length > 0,
            username: req.session.user.username,
            hostel_name: bookings.length > 0 ? bookings[0].hostel_name : null
        });
    } catch (error) {
        console.error('Error checking resident status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get recent announcements
app.get('/api/announcements/recent', checkResidentStatus, async (req, res) => {
    try {
        const [announcements] = await pool.promise().query(`
            SELECT * FROM hostel_announcements
            WHERE (hostel_name = ? OR hostel_name = 'all')
            AND (end_date IS NULL OR end_date > NOW())
            ORDER BY priority DESC, created_at DESC
            LIMIT 5
        `, [req.session.user.preferred_hostel]);

        res.json(announcements);
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

// Get user's recent maintenance requests
app.get('/api/maintenance/recent', checkResidentStatus, async (req, res) => {
    try {
        const [requests] = await pool.promise().query(`
            SELECT m.*, r.room_number, r.hostel_name
            FROM maintenance_requests m
            JOIN rooms r ON m.room_id = r.id
            WHERE m.user_id = ?
            ORDER BY m.created_at DESC
            LIMIT 5
        `, [req.session.user.id]);

        res.json(requests);
    } catch (error) {
        console.error('Error fetching maintenance requests:', error);
        res.status(500).json({ error: 'Failed to fetch maintenance requests' });
    }
});

// Create new maintenance request
app.post('/api/maintenance', checkResidentStatus, async (req, res) => {
    const { category, title, description, priority } = req.body;

    try {
        // Get user's current room from active booking
        const [bookings] = await pool.promise().query(`
            SELECT b.room_id
            FROM bookings b
            JOIN payments p ON b.id = p.booking_id
            WHERE b.user_id = ? 
            AND b.status = 'approved'
            AND p.payment_status = 'paid'
            ORDER BY b.created_at DESC
            LIMIT 1
        `, [req.session.user.id]);

        if (bookings.length === 0) {
            return res.status(400).json({ error: 'No active booking found' });
        }

        const room_id = bookings[0].room_id;

        // Create the maintenance request
        const [result] = await pool.promise().query(`
            INSERT INTO maintenance_requests 
            (user_id, room_id, title, category, priority, description, status) 
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `, [req.session.user.id, room_id, title, category, priority, description]);

        // Create initial status update
        await pool.promise().query(`
            INSERT INTO maintenance_updates 
            (request_id, status, comment, created_by)
            VALUES (?, 'pending', 'Request submitted', ?)
        `, [result.insertId, req.session.user.id]);

        // Send push notification to all admin users
        console.log('Sending push notification for new maintenance request');
        await sendPushNotification(
            null,
            'New Maintenance Request',
            `New ${priority} priority request: ${title}`,
            `/admin-dashboard.html#maintenance`,
            'admin'
        );

        res.status(201).json({
            id: result.insertId,
            message: 'Maintenance request created successfully'
        });
    } catch (error) {
        console.error('Error creating maintenance request:', error);
        res.status(500).json({ error: 'Failed to create maintenance request' });
    }
});

// Get upcoming events
app.get('/api/events/upcoming', checkResidentStatus, async (req, res) => {
    try {
        console.log('Fetching upcoming events for user:', req.session.user.id, 'hostel:', req.session.user.preferred_hostel);
        
        // Get events and check if user is registered
        const [events] = await pool.promise().query(`
            SELECT 
                e.*,
                CASE WHEN er.id IS NOT NULL THEN true ELSE false END as is_registered,
                (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id) as registered_count
            FROM community_events e
            LEFT JOIN event_registrations er ON e.id = er.event_id AND er.user_id = ?
            WHERE (e.hostel_name = ? OR e.hostel_name = 'all')
            ORDER BY e.event_date ASC
        `, [req.session.user.id, req.session.user.preferred_hostel]);

        console.log('Found events:', events.length);
        res.json(events);
    } catch (error) {
        console.error('Error fetching events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

// Register for an event
app.post('/api/events/:id/register', checkResidentStatus, async (req, res) => {
    const eventId = req.params.id;
    let connection;

    try {
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        // Check if event exists and has space
        const [events] = await connection.query(`
            SELECT id, max_participants,
                (SELECT COUNT(*) FROM event_registrations WHERE event_id = ?) as current_participants
            FROM community_events 
            WHERE id = ? AND event_date > NOW()
        `, [eventId, eventId]);

        if (events.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Event not found or has already passed' });
        }

        const event = events[0];
        if (event.max_participants && event.current_participants >= event.max_participants) {
            await connection.rollback();
            return res.status(400).json({ error: 'Event is full' });
        }

        // Check if already registered
        const [registrations] = await connection.query(
            'SELECT id FROM event_registrations WHERE event_id = ? AND user_id = ?',
            [eventId, req.session.user.id]
        );

        if (registrations.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Already registered for this event' });
        }

        // Register for the event
        await connection.query(
            'INSERT INTO event_registrations (event_id, user_id) VALUES (?, ?)',
            [eventId, req.session.user.id]
        );

        await connection.commit();
        res.json({ message: 'Successfully registered for event' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error registering for event:', error);
        res.status(500).json({ error: 'Failed to register for event' });
    } finally {
        if (connection) connection.release();
    }
});

// Get user notifications
app.get('/api/notifications', checkSession, async (req, res) => {
    try {
        console.log('Fetching notifications for user:', req.session.user.id);
        
        // Check if user is authenticated
        if (!req.session.user) {
            console.log('No user in session');
            return res.json([]);
        }

        // Combine different types of notifications
        const notifications = [];

        try {
            // Get maintenance updates with viewed status
            const maintenanceQuery = `
                SELECT DISTINCT 
                    'maintenance' as type,
                    m.id as notification_id,
                    CONCAT('Your maintenance request "', m.title, '" status changed to ', mu.status) as message,
                    mu.created_at,
                    CONCAT('/maintenance.html?id=', m.id) as link,
                    COALESCE(nv.viewed, 0) as viewed
                FROM maintenance_updates mu
                JOIN maintenance_requests m ON mu.request_id = m.id
                LEFT JOIN notification_viewed nv ON 
                    nv.notification_type = 'maintenance' 
                    AND nv.notification_id = m.id 
                    AND nv.user_id = ${req.session.user.id}
                WHERE m.user_id = ${req.session.user.id}
                AND mu.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
                ORDER BY mu.created_at DESC
            `;
            
            const [maintenanceUpdates] = await pool.promise().query(maintenanceQuery);
            
            console.log('Maintenance updates:', maintenanceUpdates);
            notifications.push(...maintenanceUpdates);
        } catch (err) {
            console.error('Error fetching maintenance updates:', err);
        }

        try {
            // Get user's hostel from active booking
            const [userBooking] = await pool.promise().query(`
                SELECT r.hostel_name 
                FROM bookings b
                JOIN payments p ON b.id = p.booking_id
                JOIN rooms r ON b.room_id = r.id
                WHERE b.user_id = ? 
                AND b.status = 'approved' 
                AND p.payment_status = 'paid'
                LIMIT 1
            `, [req.session.user.id]);

            console.log('User booking:', userBooking);
            const userHostel = userBooking.length > 0 ? userBooking[0].hostel_name : 'all';
            console.log('Using hostel:', userHostel);

            // Get new announcements with viewed status
            const announcementQuery = `
                SELECT DISTINCT 
                    'announcement' as type,
                    ha.id as notification_id,
                    CONCAT('New announcement: ', ha.title) as message,
                    ha.created_at,
                    CONCAT('/announcements.html?id=', ha.id) as link,
                    COALESCE(nv.viewed, 0) as viewed
                FROM hostel_announcements ha
                LEFT JOIN notification_viewed nv ON 
                    nv.notification_type = 'announcement' 
                    AND nv.notification_id = ha.id 
                    AND nv.user_id = ${req.session.user.id}
                WHERE (ha.hostel_name = '${userHostel}' OR ha.hostel_name = 'all')
                AND ha.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
                AND (ha.end_date IS NULL OR ha.end_date > NOW())
                ORDER BY ha.created_at DESC
            `;
            
            const [announcements] = await pool.promise().query(announcementQuery);
            
            console.log('Announcements:', announcements);
            notifications.push(...announcements);
        } catch (err) {
            console.error('Error fetching announcements:', err);
        }

        // Sort notifications by date (newest first)
        notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        console.log('Final notifications:', notifications);

        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark notification as viewed
app.post('/api/notifications/:type/:id/viewed', checkSession, async (req, res) => {
    try {
        const { type, id } = req.params;
        
        // Validate notification type
        if (!['maintenance', 'announcement'].includes(type)) {
            return res.status(400).json({ error: 'Invalid notification type' });
        }

        // Insert or update viewed status
        await pool.promise().query(`
            INSERT INTO notification_viewed 
                (user_id, notification_type, notification_id, viewed) 
            VALUES (?, ?, ?, 1)
            ON DUPLICATE KEY UPDATE 
                viewed = 1,
                updated_at = CURRENT_TIMESTAMP
        `, [req.session.user.id, type, id]);

        res.json({ message: 'Notification marked as viewed' });
    } catch (error) {
        console.error('Error marking notification as viewed:', error);
        res.status(500).json({ error: 'Failed to mark notification as viewed' });
    }
});

// Get all payments (admin only)
app.get('/api/admin/payments', checkAdminRole, async (req, res) => {
    try {
        const [payments] = await pool.promise().query(`
            SELECT 
                p.*,
                b.id as booking_id,
                u.full_name as user_full_name,
                r.room_number,
                r.hostel_name,
                r.price as amount
            FROM payments p
            JOIN bookings b ON p.booking_id = b.id
            JOIN users u ON b.user_id = u.id
            JOIN rooms r ON b.room_id = r.id
            ORDER BY p.created_at DESC
        `);

        res.json(payments);
    } catch (error) {
        console.error('Error fetching payments:', error);
        res.status(500).json({ error: 'Failed to fetch payments' });
    }
});

// Update payment status (admin only)
app.put('/api/admin/payments/:id/status', checkAdminRole, async (req, res) => {
    const paymentId = req.params.id;
    const { status } = req.body;
    
    if (!['paid', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }
    
    let connection;
    try {
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();
        
        // Update payment status
        await connection.query(
            'UPDATE payments SET payment_status = ? WHERE id = ?',
            [status, paymentId]
        );
        
        // If payment is approved, update booking status
        if (status === 'paid') {
            const [payments] = await connection.query(
                'SELECT booking_id FROM payments WHERE id = ?',
                [paymentId]
            );
            
            if (payments.length > 0) {
                await connection.query(
                    'UPDATE bookings SET status = "approved" WHERE id = ?',
                    [payments[0].booking_id]
                );
            }
        }
        
        await connection.commit();
        res.json({ message: 'Payment status updated successfully' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('Error updating payment status:', error);
        res.status(500).json({ error: 'Failed to update payment status' });
    } finally {
        if (connection) connection.release();
    }
});

// Admin Residents Portal Management API Endpoints

// Admin session check middleware
const checkAdminSession = (req, res, next) => {
  if (!req.session || !req.session.user || req.session.user.role !== 'admin') {
    return res.status(401).json({ error: 'Unauthorized: Admin access required' });
  }
  next();
};

// Admin API endpoints for residents portal management
app.get('/api/admin/maintenance', checkAdminSession, async (req, res) => {
    try {
        const query = `
            SELECT 
                mr.id, 
                mr.title, 
                mr.description, 
                mr.category, 
                mr.priority, 
                mr.status, 
                mr.created_at,
                u.full_name as student_name,
                r.room_number
            FROM maintenance_requests mr
            JOIN users u ON mr.user_id = u.id
            JOIN rooms r ON mr.room_id = r.id
            ORDER BY mr.created_at DESC
        `;
        
        const [requests] = await pool.promise().query(query);
        res.json(requests);
    } catch (error) {
        console.error('Error fetching maintenance requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get a specific maintenance request (admin)
app.get('/api/admin/maintenance/:id', checkAdminSession, async (req, res) => {
    try {
        const requestId = req.params.id;
        
        // Get the maintenance request details
        const [requests] = await pool.promise().query(`
            SELECT 
                mr.id, 
                mr.title, 
                mr.description, 
                mr.category, 
                mr.priority, 
                mr.status, 
                mr.created_at,
                u.full_name as student_name,
                r.room_number
            FROM maintenance_requests mr
            JOIN users u ON mr.user_id = u.id
            JOIN rooms r ON mr.room_id = r.id
            WHERE mr.id = ?
        `, [requestId]);
        
        if (requests.length === 0) {
            return res.status(404).json({ error: 'Maintenance request not found' });
        }
        
        // Get the status updates for this request
        const [updates] = await pool.promise().query(`
            SELECT status, comment, created_at
            FROM maintenance_updates
            WHERE request_id = ?
            ORDER BY created_at DESC
        `, [requestId]);
        
        const request = requests[0];
        request.updates = updates;
        
        res.json(request);
    } catch (error) {
        console.error('Error fetching maintenance request details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a maintenance request (admin)
app.post('/api/admin/maintenance', checkAdminSession, async (req, res) => {
    try {
        const { user_id, title, category, priority, description } = req.body;

        // Get the user's most recent approved booking's room
        const [roomResult] = await pool.promise().query(`
            SELECT r.id as room_id
            FROM bookings b
            JOIN rooms r ON b.room_id = r.id
            WHERE b.user_id = ? AND b.status = 'approved'
            ORDER BY b.created_at DESC
            LIMIT 1
        `, [user_id]);

        if (roomResult.length === 0) {
            return res.status(400).json({ error: 'No approved booking found for this user' });
        }

        const room_id = roomResult[0].room_id;

        // Create the maintenance request
        const [result] = await pool.promise().query(`
            INSERT INTO maintenance_requests 
            (user_id, room_id, title, category, priority, description, status) 
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `, [user_id, room_id, title, category, priority, description]);

        // Send push notification to admin
        const [admins] = await pool.promise().query(
            'SELECT id FROM users WHERE role = "admin"'
        );

        for (const admin of admins) {
            await sendPushNotification(
                admin.id,
                'New Maintenance Request',
                `New ${priority} priority request: ${title}`,
                `/admin-dashboard.html#maintenance`,
                'maintenance_request'
            );
        }

        res.json({ 
            success: true, 
            message: 'Maintenance request created successfully',
            request_id: result.insertId 
        });
    } catch (error) {
        console.error('Error creating maintenance request:', error);
        res.status(500).json({ error: 'Failed to create maintenance request' });
    }
});

// Update maintenance request status (admin)
app.put('/api/admin/maintenance/:id/status', checkAdminSession, async (req, res) => {
    try {
        const requestId = req.params.id;
        const { status, comment } = req.body;
        
        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }
        
        // Update the maintenance request status
        await pool.promise().query(`
            UPDATE maintenance_requests
            SET status = ?
            WHERE id = ?
        `, [status, requestId]);
        
        // Add a status update
        await pool.promise().query(`
            INSERT INTO maintenance_updates (request_id, status, comment, created_by)
            VALUES (?, ?, ?, ?)
        `, [requestId, status, comment || `Status updated to ${status}`, req.session.user.id]);
        
        res.json({ message: 'Maintenance request status updated successfully' });
    } catch (error) {
        console.error('Error updating maintenance request status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all residents (admin)
app.get('/api/admin/residents', checkAdminSession, async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT u.id, u.full_name, r.room_number
            FROM users u
            JOIN bookings b ON u.id = b.user_id
            JOIN rooms r ON b.room_id = r.id
            JOIN payments p ON b.id = p.booking_id
            WHERE b.status = 'approved' AND p.payment_status = 'paid'
            ORDER BY u.full_name
        `;
        
        const [residents] = await pool.promise().query(query);
        res.json(residents);
    } catch (error) {
        console.error('Error fetching residents:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all announcements (admin)
app.get('/api/admin/announcements', checkAdminSession, async (req, res) => {
    try {
        const query = `
            SELECT 
                a.id, 
                a.title, 
                a.content, 
                a.hostel_name, 
                a.priority, 
                a.start_date, 
                a.end_date
            FROM hostel_announcements a
            ORDER BY a.start_date DESC
        `;
        
        const [announcements] = await pool.promise().query(query);
        res.json(announcements);
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get a specific announcement (admin)
app.get('/api/admin/announcements/:id', checkAdminSession, async (req, res) => {
    try {
        const announcementId = req.params.id;
        
        const [announcements] = await pool.promise().query(`
            SELECT 
                a.id, 
                a.title, 
                a.content, 
                a.hostel_name, 
                a.priority, 
                a.start_date, 
                a.end_date
            FROM hostel_announcements a
            WHERE a.id = ?
        `, [announcementId]);
        
        if (announcements.length === 0) {
            return res.status(404).json({ error: 'Announcement not found' });
        }
        
        res.json(announcements[0]);
    } catch (error) {
        console.error('Error fetching announcement details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create an announcement (admin)
app.post('/api/admin/announcements', checkAdminSession, async (req, res) => {
    try {
        const { title, content, hostel_name, priority, start_date, end_date } = req.body;
        
        if (!title || !content || !hostel_name || !priority || !start_date) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const [result] = await pool.promise().query(`
            INSERT INTO hostel_announcements (
                title, 
                content, 
                hostel_name, 
                priority, 
                start_date, 
                end_date,
                created_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [title, content, hostel_name, priority, start_date, end_date || null, req.session.user.id]);

        // Send push notifications to all subscribed users
        try {
            console.log('Fetching push subscriptions...');
            // Get all push subscriptions
            const [subscriptions] = await pool.promise().query(
                'SELECT * FROM user_push_subscriptions'
            );
            console.log('Found subscriptions:', subscriptions.length);

            // Prepare notification payload
            const notificationPayload = {
                title: 'New Announcement',
                body: title,
                url: `/announcements.html?id=${result.insertId}`
            };
            console.log('Notification payload:', notificationPayload);

            // Send notification to each subscription
            for (const sub of subscriptions) {
                try {
                    console.log('Raw subscription data:', sub.push_subscription);
                    // The subscription is already an object, no need to parse
                    const pushSubscription = sub.push_subscription;
                    console.log('Using subscription:', pushSubscription);
                    
                    await webpush.sendNotification(
                        pushSubscription,
                        JSON.stringify(notificationPayload)
                    );
                    console.log('Push notification sent successfully');
                } catch (pushError) {
                    console.error('Error sending push notification:', pushError);
                    if (pushError.statusCode === 410) {
                        console.log('Removing invalid subscription');
                        await pool.promise().query(
                            'DELETE FROM user_push_subscriptions WHERE id = ?',
                            [sub.id]
                        );
                    }
                }
            }
        } catch (pushError) {
            console.error('Error in push notification process:', pushError);
        }
        
        res.status(201).json({ 
            id: result.insertId,
            message: 'Announcement created successfully' 
        });
    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete an announcement (admin)
app.delete('/api/admin/announcements/:id', checkAdminSession, async (req, res) => {
    try {
        const announcementId = req.params.id;
        
        await pool.promise().query(`
            DELETE FROM hostel_announcements
            WHERE id = ?
        `, [announcementId]);
        
        res.json({ message: 'Announcement deleted successfully' });
    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all community events (admin)
app.get('/api/admin/events', checkAdminSession, async (req, res) => {
    try {
        const query = `
            SELECT 
                e.id, 
                e.title, 
                e.description, 
                e.hostel_name, 
                e.event_date,
                e.location, 
                e.max_participants as capacity,
                (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id) as registered_count
            FROM community_events e
            ORDER BY e.event_date DESC
        `;
        
        const [events] = await pool.promise().query(query);
        res.json(events);
    } catch (error) {
        console.error('Error fetching community events:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get a specific community event (admin)
app.get('/api/admin/events/:id', checkAdminSession, async (req, res) => {
    try {
        const eventId = req.params.id;
        
        // Get the event details
        const [events] = await pool.promise().query(`
            SELECT 
                e.id, 
                e.title, 
                e.description, 
                e.hostel_name, 
                e.event_date,
                e.location, 
                e.max_participants as capacity,
                (SELECT COUNT(*) FROM event_registrations WHERE event_id = e.id) as registered_count
            FROM community_events e
            WHERE e.id = ?
        `, [eventId]);
        
        if (events.length === 0) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        // Get the registrations for this event
        const [registrations] = await pool.promise().query(`
            SELECT 
                er.id,
                er.registration_date as registered_at,
                u.full_name as student_name
            FROM event_registrations er
            JOIN users u ON er.user_id = u.id
            WHERE er.event_id = ?
            ORDER BY er.registration_date DESC
        `, [eventId]);
        
        const event = events[0];
        event.registrations = registrations;
        
        res.json(event);
    } catch (error) {
        console.error('Error fetching event details:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a community event (admin)
app.post('/api/admin/events', checkAdminSession, async (req, res) => {
    try {
        const { title, description, hostel_name, event_date, event_time, location, capacity } = req.body;
        
        if (!title || !description || !hostel_name || !event_date || !event_time || !location || !capacity) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Combine date and time into a timestamp
        const eventDateTime = new Date(event_date + ' ' + event_time);
        
        const query = `
            INSERT INTO community_events (
                title, 
                description, 
                hostel_name, 
                event_date, 
                location, 
                max_participants,
                created_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const values = [
            title, 
            description, 
            hostel_name.toLowerCase(), 
            eventDateTime, 
            location, 
            parseInt(capacity),
            req.session.user.id // Admin user ID from session
        ];
        
        const [result] = await pool.promise().query(query, values);
        
        res.status(201).json({ 
            id: result.insertId,
            message: 'Community event created successfully' 
        });
    } catch (error) {
        console.error('Error creating community event:', {
            message: error.message,
            code: error.code,
            sqlState: error.sqlState,
            sqlMessage: error.sqlMessage,
            sql: error.sql
        });
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Delete a community event (admin)
app.delete('/api/admin/events/:id', checkAdminSession, async (req, res) => {
    try {
        const eventId = req.params.id;
        
        // First delete all registrations for this event
        await pool.promise().query(`
            DELETE FROM event_registrations
            WHERE event_id = ?
        `, [eventId]);
        
        // Then delete the event
        await pool.promise().query(`
            DELETE FROM community_events
            WHERE id = ?
        `, [eventId]);
        
        res.json({ message: 'Community event deleted successfully' });
    } catch (error) {
        console.error('Error deleting community event:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get all announcements for students
app.get('/api/announcements', checkResidentStatus, async (req, res) => {
    try {
        const [announcements] = await pool.promise().query(`
            SELECT 
                ha.id,
                ha.title,
                ha.content,
                ha.hostel_name,
                ha.priority,
                ha.start_date,
                ha.end_date,
                ha.created_at,
                u.full_name as created_by_name
            FROM hostel_announcements ha
            LEFT JOIN users u ON ha.created_by = u.id
            WHERE (ha.hostel_name = ? OR ha.hostel_name = 'all')
            AND (ha.end_date IS NULL OR ha.end_date > NOW())
            ORDER BY ha.priority DESC, ha.created_at DESC
        `, [req.session.user.preferred_hostel]);

        res.json(announcements);
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

// Get a specific announcement for students
app.get('/api/announcements/:id', checkResidentStatus, async (req, res) => {
    try {
        const [announcements] = await pool.promise().query(`
            SELECT 
                ha.id,
                ha.title,
                ha.content,
                ha.hostel_name,
                ha.priority,
                ha.start_date,
                ha.end_date,
                ha.created_at,
                u.full_name as created_by_name
            FROM hostel_announcements ha
            LEFT JOIN users u ON ha.created_by = u.id
            WHERE ha.id = ?
            AND (ha.hostel_name = ? OR ha.hostel_name = 'all')
        `, [req.params.id, req.session.user.preferred_hostel]);

        if (announcements.length === 0) {
            return res.status(404).json({ error: 'Announcement not found' });
        }

        res.json(announcements[0]);
    } catch (error) {
        console.error('Error fetching announcement:', error);
        res.status(500).json({ error: 'Failed to fetch announcement' });
    }
});

// Get a specific maintenance request for users
app.get('/api/maintenance/:id', checkResidentStatus, async (req, res) => {
    try {
        const requestId = req.params.id;
        const userId = req.session.user.id;
        
        // Get the maintenance request details with room info and updates
        const [requests] = await pool.promise().query(`
            SELECT 
                mr.id, 
                mr.title, 
                mr.description, 
                mr.category, 
                mr.priority, 
                mr.status, 
                mr.created_at,
                r.room_number,
                r.hostel_name
            FROM maintenance_requests mr
            JOIN rooms r ON mr.room_id = r.id
            WHERE mr.id = ? AND mr.user_id = ?
        `, [requestId, userId]);
        
        if (requests.length === 0) {
            return res.status(404).json({ error: 'Maintenance request not found' });
        }
        
        // Get the status updates for this request
        const [updates] = await pool.promise().query(`
            SELECT status, comment, created_at
            FROM maintenance_updates
            WHERE request_id = ?
            ORDER BY created_at DESC
        `, [requestId]);
        
        const request = requests[0];
        request.updates = updates;
        
        res.json(request);
    } catch (error) {
        console.error('Error fetching maintenance request details:', error);
        res.status(500).json({ error: 'Failed to fetch maintenance request details' });
    }
});

// Update maintenance request status (for users)
app.put('/api/maintenance/:id/status', checkResidentStatus, async (req, res) => {
    try {
        const requestId = req.params.id;
        const userId = req.session.user.id;
        const { status, comment } = req.body;
        
        if (!['pending', 'completed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Users can only set status to pending or completed.' });
        }
        
        // Verify the request belongs to the user
        const [requests] = await pool.promise().query(
            'SELECT * FROM maintenance_requests WHERE id = ? AND user_id = ?',
            [requestId, userId]
        );
        
        if (requests.length === 0) {
            return res.status(404).json({ error: 'Maintenance request not found or unauthorized' });
        }
        
        // Update the maintenance request status
        await pool.promise().query(
            'UPDATE maintenance_requests SET status = ? WHERE id = ?',
            [status, requestId]
        );
        
        // Add a status update with user's comment
        await pool.promise().query(
            'INSERT INTO maintenance_updates (request_id, status, comment, created_by) VALUES (?, ?, ?, ?)',
            [requestId, status, comment || `Status updated to ${status} by resident`, userId]
        );
        
        res.json({ 
            message: 'Maintenance request status updated successfully',
            status: status
        });
    } catch (error) {
        console.error('Error updating maintenance request status:', error);
        res.status(500).json({ error: 'Failed to update maintenance request status' });
    }
});

// Store active connections by hostel
const hostelConnections = new Map();
// Store user info for connections
const userConnections = new Map();

// Global Maps for tracking connections
const connectedUsers = new Map(); // Map to store connected users by hostel

wss.on('connection', function connection(ws, req) {
    let userHostel = null;
    let userId = null;
    let username = null;

    ws.on('message', async function incoming(message) {
        try {
            const data = JSON.parse(message);
            console.log('Received WebSocket message:', data);

            switch(data.type) {
                case 'join':
                    userHostel = data.hostel;
                    userId = data.userId;
                    username = data.username;
                    
                    // Store user connection
                    if (!connectedUsers.has(userHostel)) {
                        connectedUsers.set(userHostel, new Map());
                    }
                    connectedUsers.get(userHostel).set(userId, { ws, username });
                    
                    // Send updated online count to all users in the hostel
                    const onlineCount = connectedUsers.get(userHostel).size;
                    const onlineUsers = Array.from(connectedUsers.get(userHostel).values())
                        .map(u => u.username);
                    
                    broadcastToHostel(userHostel, {
                        type: 'users',
                        count: onlineCount,
                        users: onlineUsers
                    });

                    // Send chat history
                    const query = `
                        SELECT 
                            m1.*,
                            m2.message as replied_message,
                            m2.username as replied_username,
                            m2.message_type as replied_message_type,
                            m2.file_name as replied_file_name,
                            m2.file_message as replied_file_message,
                            u.profile_picture
                        FROM chat_messages m1
                        LEFT JOIN chat_messages m2 ON m1.reply_to = m2.id
                        LEFT JOIN users u ON m1.user_id = u.id
                        WHERE m1.hostel_name = ? 
                        ORDER BY m1.created_at DESC 
                        LIMIT 50
                    `;
                    
                    try {
                        const [messages] = await pool.promise().query(query, [userHostel]);
                        
                        // Process messages to include reply details
                        const processedMessages = messages.map(msg => {
                            const message = {
                                id: msg.id,
                                hostel_name: msg.hostel_name,
                                user_id: msg.user_id,
                                username: msg.username,
                                message: msg.message,
                                message_type: msg.message_type,
                                file_url: msg.file_url,
                                file_name: msg.file_name,
                                file_type: msg.file_type,
                                created_at: msg.created_at,
                                is_deleted: msg.is_deleted,
                                is_edited: msg.is_edited,
                                reply_to: msg.reply_to,
                                file_message: msg.file_message,
                                profile_picture: msg.profile_picture || '/uploads/profile/default-avatar.svg'
                            };
                            
                            // Add reply details if this message is a reply
                            if (msg.reply_to && msg.replied_message) {
                                message.reply_details = {
                                    message: msg.replied_message,
                                    username: msg.replied_username,
                                    message_type: msg.replied_message_type,
                                    file_name: msg.replied_file_name,
                                    file_message: msg.replied_file_message
                                };
                            }
                            
                            return message;
                        });

                        ws.send(JSON.stringify({
                            type: 'history',
                            messages: processedMessages.reverse()
                        }));
                    } catch (error) {
                        console.error('Error fetching chat history:', error);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Error loading chat history'
                        }));
                    }
                    break;

                case 'message':
                    if (!userHostel || !userId || !username) {
                        console.error('User not properly initialized');
                        return;
                    }

                    let messageContent = data.message;
                    let messageType = data.message_type || 'text';
                    let fileUrl = data.file_url || null;
                    let fileName = data.file_name || null;
                    let fileType = data.file_type || null;
                    let fileMessage = data.file_message || null;
                    let replyTo = data.reply_to || null;

                    // If this is a reply, verify the original message exists and is in the same hostel
                    if (replyTo) {
                        const [originalMessage] = await pool.promise().query(
                            'SELECT id FROM chat_messages WHERE id = ? AND hostel_name = ?',
                            [replyTo, userHostel]
                        );
                        if (originalMessage.length === 0) {
                            ws.send(JSON.stringify({
                                type: 'error',
                                message: 'Original message not found or not accessible'
                            }));
                            return;
                        }
                    }
                    
                    // Save message to database
                    const insertQuery = `
                        INSERT INTO chat_messages (
                            hostel_name, 
                            user_id, 
                            username, 
                            message,
                            file_message,
                            message_type,
                            file_url,
                            file_name,
                            file_type,
                            reply_to
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    
                    const [result] = await pool.promise().query(insertQuery, [
                        userHostel,
                        userId,
                        username,
                        messageContent,
                        fileMessage,
                        messageType,
                        fileUrl,
                        fileName,
                        fileType,
                        replyTo
                    ]);

                    // If this is a reply, fetch the original message details
                    let replyDetails = null;
                    if (replyTo) {
                        const [originalMessage] = await pool.promise().query(`
                            SELECT id, message, username, message_type, file_name
                            FROM chat_messages 
                            WHERE id = ?
                        `, [replyTo]);
                        if (originalMessage.length > 0) {
                            replyDetails = originalMessage[0];
                        }
                    }

                    // Broadcast message to all users in the hostel
                    const messageData = {
                        type: 'message',
                        id: result.insertId,
                        hostel_name: userHostel,
                        user_id: userId,
                        username: username,
                        message: messageContent,
                        file_message: fileMessage,
                        message_type: messageType,
                        file_url: fileUrl,
                        file_name: fileName,
                        file_type: fileType,
                        reply_to: replyTo,
                        reply_details: replyDetails,
                        created_at: new Date(),
                        is_deleted: false,
                        is_edited: false
                    };

                    if (connectedUsers.has(userHostel)) {
                        connectedUsers.get(userHostel).forEach(({ ws: clientWs }) => {
                            if (clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(JSON.stringify(messageData));
                            }
                        });
                    }
                    break;

                case 'edit_message':
                    if (!userHostel || !userId || !username) {
                        return;
                    }

                    // Verify message ownership and check message type
                    const [messageToEdit] = await pool.promise().query(
                        'SELECT * FROM chat_messages WHERE id = ? AND user_id = ? AND hostel_name = ?',
                        [data.messageId, userId, userHostel]
                    );

                    if (messageToEdit.length === 0) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Message not found or you do not have permission to edit it'
                        }));
                        return;
                    }

                    // Check if this is a file message
                    if (messageToEdit[0].message_type === 'file') {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'File messages cannot be edited. Please delete and upload a new file if needed.'
                        }));
                        return;
                    }

                    // Update message in database (only for text messages)
                    await pool.promise().query(
                        'UPDATE chat_messages SET message = ?, is_edited = TRUE WHERE id = ?',
                        [data.content, data.messageId]
                    );

                    // Broadcast edit to all users in the hostel
                    const editData = {
                        type: 'message_edited',
                        messageId: data.messageId,
                        content: data.content,
                        is_edited: true,
                        edited_at: new Date()
                    };

                    if (connectedUsers.has(userHostel)) {
                        connectedUsers.get(userHostel).forEach(({ ws: clientWs }) => {
                            if (clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(JSON.stringify(editData));
                            }
                        });
                    }
                    break;

                case 'delete_message':
                    if (!userHostel || !userId || !username) {
                        return;
                    }

                    // Verify message ownership
                    const [messageToDelete] = await pool.promise().query(
                        'SELECT * FROM chat_messages WHERE id = ? AND user_id = ? AND hostel_name = ?',
                        [data.messageId, userId, userHostel]
                    );

                    if (messageToDelete.length === 0) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Message not found or you do not have permission to delete it'
                        }));
                        return;
                    }

                    // Mark message as deleted in database
                    await pool.promise().query(
                        'UPDATE chat_messages SET is_deleted = TRUE WHERE id = ?',
                        [data.messageId]
                    );

                    // Broadcast deletion to all users in the hostel
                    const deleteData = {
                        type: 'message_deleted',
                        messageId: data.messageId,
                        is_deleted: true,
                        deleted_at: new Date()
                    };

                    // Broadcast to all users in the hostel using connectedUsers
                    if (connectedUsers.has(userHostel)) {
                        connectedUsers.get(userHostel).forEach(({ ws: clientWs }) => {
                            if (clientWs.readyState === WebSocket.OPEN) {
                                clientWs.send(JSON.stringify(deleteData));
                            }
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Error processing message'
            }));
        }
    });

    ws.on('close', () => {
        if (userHostel && userId && connectedUsers.has(userHostel)) {
            // Remove user from connected users
            connectedUsers.get(userHostel).delete(userId);
            
            // Send updated online count
            const onlineCount = connectedUsers.get(userHostel).size;
            const onlineUsers = Array.from(connectedUsers.get(userHostel).values())
                .map(u => u.username);
            
            broadcastToHostel(userHostel, {
                type: 'users',
                count: onlineCount,
                users: onlineUsers
            });
            
            // Clean up empty hostel
            if (connectedUsers.get(userHostel).size === 0) {
                connectedUsers.delete(userHostel);
            }
        }
    });
});

// Helper function to broadcast to all users in a hostel
function broadcastToHostel(hostel, message) {
    if (!connectedUsers.has(hostel)) return;
    
    connectedUsers.get(hostel).forEach(({ ws }) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(message));
        }
    });
}

// Update the server listen code
server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Check user endpoint
app.get('/api/check-user', async (req, res) => {
    const { username } = req.query;
    
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    
    try {
        const [users] = await pool.promise().query(
            'SELECT email, is_verified FROM users WHERE username = ?',
            [username]
        );
        
        if (users.length === 0) {
            return res.json({ exists: false });
        }
        
        const user = users[0];
        res.json({
            exists: true,
            is_verified: user.is_verified,
            email: user.email
        });
    } catch (error) {
        console.error('Error checking user:', error);
        res.status(500).json({ error: 'Error checking user' });
    }
});

// Resend verification endpoint
app.post('/api/resend-verification', async (req, res) => {
    const { username, new_email } = req.body;
    
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    
    try {
        // Get user details
        const [users] = await pool.promise().query(
            'SELECT id, email, is_verified FROM users WHERE username = ?',
            [username]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = users[0];
        
        // Check if already verified
        if (user.is_verified) {
            return res.status(400).json({ error: 'Email is already verified' });
        }
        
        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        // Update email if provided
        if (new_email && new_email !== user.email) {
            await pool.promise().query(
                'UPDATE users SET email = ?, verification_token = ? WHERE id = ?',
                [new_email, verificationToken, user.id]
            );
        } else {
            await pool.promise().query(
                'UPDATE users SET verification_token = ? WHERE id = ?',
                [verificationToken, user.id]
            );
        }
        
        // Send verification email
        const emailSent = await sendVerificationEmail(new_email || user.email, verificationToken);
        
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send verification email' });
        }
        
        res.json({ 
            message: 'Verification code sent successfully. Please check your email.',
            email_updated: Boolean(new_email)
        });
        
    } catch (error) {
        console.error('Error resending verification:', error);
        res.status(500).json({ error: 'Error resending verification code' });
    }
});

// Push notification subscription endpoint
app.post('/api/notifications/subscribe', async (req, res) => {
    try {
        const { subscription, role } = req.body;
        console.log('Received subscription request:', { subscription, role });
        
        if (!subscription) {
            console.error('No subscription data received');
            return res.status(400).json({ error: 'Subscription data is required' });
        }

        // Get user ID from session if authenticated
        const userId = req.session.user ? req.session.user.id : null;
        const userRole = role || (req.session.user ? req.session.user.role : 'user');
        
        console.log('Processing subscription for:', { userId, userRole });

        // Store subscription in the user_push_subscriptions table
        if (userId) {
            // Check if user already has a subscription
            const [existing] = await pool.promise().query(
                'SELECT id FROM user_push_subscriptions WHERE user_id = ?',
                [userId]
            );
            
            if (existing.length > 0) {
                // Update existing subscription
                await pool.promise().query(
                    'UPDATE user_push_subscriptions SET push_subscription = ?, role = ? WHERE user_id = ?',
                    [JSON.stringify(subscription), userRole, userId]
                );
                console.log('Updated subscription for user:', { userId, userRole });
            } else {
                // Insert new subscription
                await pool.promise().query(
                    'INSERT INTO user_push_subscriptions (user_id, push_subscription, role) VALUES (?, ?, ?)',
                    [userId, JSON.stringify(subscription), userRole]
                );
                console.log('Inserted new subscription for user:', { userId, userRole });
            }
        } else {
            // Insert anonymous subscription
            await pool.promise().query(
                'INSERT INTO user_push_subscriptions (user_id, push_subscription, role) VALUES (NULL, ?, ?)',
                [JSON.stringify(subscription), userRole]
            );
            console.log('Inserted anonymous subscription with role:', userRole);
        }

        res.status(200).json({ 
            success: true,
            message: 'Push subscription saved successfully'
        });
    } catch (error) {
        console.error('Error saving push subscription:', error);
        res.status(500).json({ 
            error: 'Failed to save push subscription',
            details: error.message 
        });
    }
});

// Helper function to send push notification
async function sendPushNotification(userId, title, body, url, targetRole = null) {
    try {
        console.log('Starting push notification process:', { userId, title, body, url, targetRole });
        
        let query = 'SELECT * FROM user_push_subscriptions WHERE ';
        let params = [];

        if (targetRole) {
            // If targetRole is specified, send to all users with that role
            query += 'role = ?';
            params = [targetRole];
            console.log('Sending to all users with role:', targetRole);
        } else if (userId) {
            // If no targetRole but userId is specified, send to that specific user
            query += 'user_id = ?';
            params = [userId];
            console.log('Sending to specific user:', userId);
        } else {
            // If neither is specified, send to all subscriptions
            query += '1=1';
            console.log('Sending to all subscriptions');
        }

        const [subscriptions] = await pool.promise().query(query, params);
        console.log('Found subscriptions:', subscriptions.length);
        console.log('Subscription details:', subscriptions);

        if (subscriptions.length === 0) {
            console.log('No subscriptions found');
            return;
        }

        const notificationPayload = {
            title,
            body,
            url,
            icon: '/assets/logo.png',
            badge: '/assets/badge.png'
        };

        console.log('Preparing to send notifications with payload:', notificationPayload);

        for (const sub of subscriptions) {
            try {
                console.log('Processing subscription:', sub.id);
                const pushSubscription = sub.push_subscription;
                console.log('Using subscription:', pushSubscription);
                
                await webpush.sendNotification(
                    pushSubscription,
                    JSON.stringify(notificationPayload)
                );
                console.log('Push notification sent successfully to subscription:', sub.id);
            } catch (error) {
                console.error('Error sending push notification:', error);
                if (error.statusCode === 410) {
                    console.log('Removing invalid subscription:', sub.id);
                    await pool.promise().query(
                        'DELETE FROM user_push_subscriptions WHERE id = ?',
                        [sub.id]
                    );
                }
            }
        }

    } catch (error) {
        console.error('Error in sendPushNotification:', error);
    }
}

// Create maintenance request
app.post('/api/maintenance-requests', checkSession, async (req, res) => {
    try {
        const { title, description, room_number, priority } = req.body;
        const userId = req.session.user.id;

        const [result] = await pool.promise().query(`
            INSERT INTO maintenance_requests (
                title, 
                description, 
                room_number, 
                priority,
                student_id,
                status
            ) VALUES (?, ?, ?, ?, ?, 'pending')
        `, [title, description, room_number, priority, userId]);

        // Send push notification to admin/staff
        const [staff] = await pool.promise().query(
            'SELECT id FROM users WHERE role IN ("admin", "staff")'
        );
        
        for (const staffMember of staff) {
            await sendPushNotification(
                staffMember.id,
                'New Maintenance Request',
                `New ${priority} priority request: ${title}`,
                `/admin/maintenance.html?id=${result.insertId}`
            );
        }

        res.status(201).json({ 
            id: result.insertId,
            message: 'Maintenance request created successfully' 
        });
    } catch (error) {
        console.error('Error creating maintenance request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update maintenance request status
app.put('/api/maintenance-requests/:id', checkAdminSession, async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body;

        // Update the maintenance request
        await pool.promise().query(`
            UPDATE maintenance_requests 
            SET status = ?, 
                notes = ?,
                updated_at = CURRENT_TIMESTAMP,
                updated_by = ?
            WHERE id = ?
        `, [status, notes, req.session.user.id, id]);

        // Get the maintenance request details
        const [request] = await pool.promise().query(
            'SELECT title, student_id FROM maintenance_requests WHERE id = ?',
            [id]
        );

        if (request.length > 0) {
            // Send push notification to the student
            await sendPushNotification(
                request[0].student_id,
                'Maintenance Request Update',
                `Your request "${request[0].title}" has been ${status}`,
                `/maintenance.html?id=${id}`
            );
        }

        res.json({ message: 'Maintenance request updated successfully' });
    } catch (error) {
        console.error('Error updating maintenance request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Deregister from event
app.post('/api/events/:eventId/deregister', authenticateToken, async (req, res) => {
    try {
        const eventId = req.params.eventId;
        const userId = req.user.id;

        // Check if event exists
        const [events] = await pool.promise().query('SELECT * FROM community_events WHERE id = ?', [eventId]);
        if (events.length === 0) {
            return res.status(404).json({ message: 'Event not found' });
        }

        // Check if user is registered
        const [registration] = await pool.promise().query(
            'SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ?',
            [eventId, userId]
        );

        if (registration.length === 0) {
            return res.status(400).json({ message: 'You are not registered for this event' });
        }

        // Check if event has already passed
        if (new Date(events[0].event_date) < new Date()) {
            return res.status(400).json({ message: 'Cannot deregister from past events' });
        }

        // Remove registration
        await pool.promise().query(
            'DELETE FROM event_registrations WHERE event_id = ? AND user_id = ?',
            [eventId, userId]
        );

        res.json({ message: 'Successfully deregistered from event' });
    } catch (error) {
        console.error('Error deregistering from event:', error);
        res.status(500).json({ message: 'Failed to deregister from event' });
    }
});

// Chat moderation endpoints
app.post('/api/chat/moderate/:messageId', checkAdminSession, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { action, reason } = req.body;

        switch (action) {
            case 'delete':
                await pool.promise().query(
                    'UPDATE chat_messages SET is_deleted = TRUE WHERE id = ?',
                    [messageId]
                );

                // Get message details for notification
                const [messages] = await pool.promise().query(
                    'SELECT hostel_name, user_id FROM chat_messages WHERE id = ?',
                    [messageId]
                );

                if (messages.length > 0) {
                    // Broadcast deletion to hostel
                    broadcastToHostel(messages[0].hostel_name, {
                        type: 'message_moderated',
                        messageId,
                        action: 'deleted',
                        moderator: req.session.user.username,
                        reason
                    });

                    // Notify user
                    await sendPushNotification(
                        messages[0].user_id,
                        'Message Moderated',
                        `Your message was removed by a moderator: ${reason}`,
                        '/community-chat.html'
                    );
                }
                break;

            case 'warn':
                // Get message details
                const [msgDetails] = await pool.promise().query(
                    'SELECT hostel_name, user_id, username FROM chat_messages WHERE id = ?',
                    [messageId]
                );

                if (msgDetails.length > 0) {
                    // Send warning notification
                    await sendPushNotification(
                        msgDetails[0].user_id,
                        'Chat Warning',
                        `You received a warning regarding your message: ${reason}`,
                        '/community-chat.html'
                    );

                    // Add system message about warning
                    await pool.promise().query(`
                        INSERT INTO chat_messages (
                            hostel_name, 
                            user_id, 
                            username, 
                            message, 
                            message_type
                        ) VALUES (?, ?, 'SYSTEM', ?, 'system')
                    `, [
                        msgDetails[0].hostel_name,
                        req.session.user.id,
                        `User ${msgDetails[0].username} has been warned: ${reason}`
                    ]);
                }
                break;
        }

        res.json({ message: 'Moderation action completed successfully' });
    } catch (error) {
        console.error('Error moderating chat message:', error);
        res.status(500).json({ error: 'Failed to moderate message' });
    }
});

// Get chat moderation logs
app.get('/api/chat/moderation-logs', checkAdminSession, async (req, res) => {
    try {
        const [logs] = await pool.promise().query(`
            SELECT 
                m.*,
                u.username as moderator_name,
                t.username as target_user_name
            FROM chat_messages m
            JOIN users u ON m.user_id = u.id
            JOIN users t ON m.message LIKE CONCAT('%', t.username, '%')
            WHERE m.message_type = 'system'
            AND m.message LIKE '%has been warned%'
            ORDER BY m.created_at DESC
            LIMIT 100
        `);

        res.json(logs);
    } catch (error) {
        console.error('Error fetching moderation logs:', error);
        res.status(500).json({ error: 'Failed to fetch moderation logs' });
    }
});

// File upload endpoint with authentication
app.post('/api/chat/upload', checkSession, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Get user info from session
        const userId = req.session.user.id;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        // Get file details
        const file = req.file;
        const fileUrl = `/uploads/${file.filename}`;
        
        // Save file info to database
        const query = `
            INSERT INTO chat_files (user_id, file_name, file_type, file_url)
            VALUES (?, ?, ?, ?)
        `;
        
        const [result] = await pool.promise().query(query, [
            userId,
            file.originalname,
            file.mimetype,
            fileUrl
        ]);

        res.json({
            id: result.insertId, // MySQL provides the inserted ID here
            url: fileUrl,
            fileType: file.mimetype,
            fileName: file.originalname
        });
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).json({ error: 'Failed to upload file' });
    }
});

// Create chat_messages table if it doesn't exist
pool.promise().query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hostel_name VARCHAR(255) NOT NULL,
        user_id INT NOT NULL,
        username VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        message_type VARCHAR(50) DEFAULT 'text',
        file_url VARCHAR(255),
        file_name VARCHAR(255),
        file_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_deleted BOOLEAN DEFAULT FALSE,
        is_edited BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
`).catch(error => {
    if (!error.message.includes('Duplicate column name')) {
        console.error('Error creating chat_messages table:', error);
    }
});

// Add file message columns to chat_messages table if they don't exist
pool.promise().query(`
    SELECT COUNT(*) as count 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'chat_messages' 
    AND COLUMN_NAME IN ('message_type', 'file_url', 'file_name', 'file_type')
`).then(async ([result]) => {
    if (result[0].count < 4) {
        try {
            await pool.promise().query(`
                ALTER TABLE chat_messages 
                ADD COLUMN IF NOT EXISTS message_type VARCHAR(50) DEFAULT 'text',
                ADD COLUMN IF NOT EXISTS file_url TEXT,
                ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
                ADD COLUMN IF NOT EXISTS file_type VARCHAR(100)
            `);
            console.log('Added file message columns to chat_messages table');
        } catch (error) {
            if (!error.message.includes('Duplicate column name')) {
                console.error('Error adding columns to chat_messages table:', error);
            }
        }
    }
}).catch(error => {
    console.error('Error checking chat_messages table columns:', error);
});

// Create chat_settings table if it doesn't exist
pool.promise().query(`
    CREATE TABLE IF NOT EXISTS chat_settings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        setting_key VARCHAR(50) NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
`).then(() => {
    // Insert default settings if they don't exist
    return pool.promise().query(`
        INSERT IGNORE INTO chat_settings (setting_key, setting_value) VALUES 
        ('retention_period', '24'),
        ('backup_enabled', 'true')
    `);
}).catch(error => {
    console.error('Error setting up chat_settings table:', error);
});

// Function to load settings from database
async function loadChatSettings() {
    try {
        const [settings] = await pool.promise().query('SELECT * FROM chat_settings');
        const settingsMap = settings.reduce((acc, setting) => {
            acc[setting.setting_key] = setting.setting_value;
            return acc;
        }, {});
        
        CLEANUP_CONFIG.retentionPeriod = parseInt(settingsMap.retention_period) || 24;
        CLEANUP_CONFIG.backupEnabled = settingsMap.backup_enabled === 'true';
        
        console.log('Chat settings loaded:', CLEANUP_CONFIG);
    } catch (error) {
        console.error('Error loading chat settings:', error);
    }
}

// Load settings when server starts
loadChatSettings();

// Update the chat settings endpoints
app.get('/api/chat/settings', checkAdminSession, async (req, res) => {
    try {
        const [settings] = await pool.promise().query('SELECT * FROM chat_settings');
        const settingsMap = settings.reduce((acc, setting) => {
            acc[setting.setting_key] = setting.setting_value;
            return acc;
        }, {});
        
        res.json({
            retentionPeriod: parseInt(settingsMap.retention_period) || 24,
            backupEnabled: settingsMap.backup_enabled === 'true'
        });
    } catch (error) {
        console.error('Error fetching chat settings:', error);
        res.status(500).json({ error: 'Failed to fetch chat settings' });
    }
});

app.post('/api/chat/settings/retention', checkAdminSession, async (req, res) => {
    try {
        const { retentionPeriod } = req.body;
        if (!retentionPeriod || retentionPeriod < 1) {
            return res.status(400).json({ error: 'Invalid retention period' });
        }
        
        // Update database
        await pool.promise().query(
            'UPDATE chat_settings SET setting_value = ? WHERE setting_key = ?',
            [retentionPeriod.toString(), 'retention_period']
        );
        
        // Update memory
        CLEANUP_CONFIG.retentionPeriod = retentionPeriod;
        
        // Return the updated value
        res.json({ 
            message: 'Retention period updated successfully',
            retentionPeriod: retentionPeriod
        });
    } catch (error) {
        console.error('Error updating retention period:', error);
        res.status(500).json({ error: 'Failed to update retention period' });
    }
});

app.post('/api/chat/settings/backup', checkAdminSession, async (req, res) => {
    try {
        const { backupEnabled } = req.body;
        if (typeof backupEnabled !== 'boolean') {
            return res.status(400).json({ error: 'Invalid backup setting' });
        }
        
        // Update database
        await pool.promise().query(
            'UPDATE chat_settings SET setting_value = ? WHERE setting_key = ?',
            [backupEnabled.toString(), 'backup_enabled']
        );
        
        // Update memory
        CLEANUP_CONFIG.backupEnabled = backupEnabled;
        
        res.json({ message: 'Backup settings updated successfully' });
    } catch (error) {
        console.error('Error updating backup settings:', error);
        res.status(500).json({ error: 'Failed to update backup settings' });
    }
});

app.post('/api/chat/backup/create', checkAdminSession, async (req, res) => {
    try {
        const cutoffDate = new Date();
        const success = await backupMessages(cutoffDate);
        
        if (success) {
            res.json({ message: 'Backup created successfully' });
        } else {
            throw new Error('Backup creation failed');
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

app.get('/api/chat/backup/history', checkAdminSession, async (req, res) => {
    try {
        const backups = [];
        const backupDir = CLEANUP_CONFIG.backupDir;
        
        if (fs.existsSync(backupDir)) {
            const files = fs.readdirSync(backupDir);
            
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(backupDir, file);
                    const stats = fs.statSync(filePath);
                    const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    
                    // Get associated files directory
                    const timestamp = file.replace('chat_backup_', '').replace('.json', '');
                    const filesDir = path.join(backupDir, `files_${timestamp}`);
                    const fileCount = fs.existsSync(filesDir) ? fs.readdirSync(filesDir).length : 0;
                    
                    backups.push({
                        id: timestamp,
                        date: stats.mtime,
                        size: stats.size,
                        messageCount: fileContent.length,
                        fileCount
                    });
                }
            }
        }
        
        // Sort backups by date, newest first
        backups.sort((a, b) => b.date - a.date);
        
        res.json(backups);
    } catch (error) {
        console.error('Error fetching backup history:', error);
        res.status(500).json({ error: 'Failed to fetch backup history' });
    }
});

app.get('/api/chat/backup/download/:id', checkAdminSession, async (req, res) => {
    try {
        const backupId = req.params.id;
        const backupFile = path.join(CLEANUP_CONFIG.backupDir, `chat_backup_${backupId}.json`);
        const filesDir = path.join(CLEANUP_CONFIG.backupDir, `files_${backupId}`);
        
        if (!fs.existsSync(backupFile)) {
            return res.status(404).json({ error: 'Backup not found' });
        }
        
        // Create a temporary zip file
        const zipFile = path.join(CLEANUP_CONFIG.backupDir, `temp_${backupId}.zip`);
        const archive = require('archiver')('zip');
        const output = fs.createWriteStream(zipFile);
        
        output.on('close', () => {
            // Send the zip file
            res.download(zipFile, `chat_backup_${backupId}.zip`, (err) => {
                // Delete the temporary zip file after sending
                fs.unlinkSync(zipFile);
                if (err) {
                    console.error('Error sending backup file:', err);
                }
            });
        });
        
        archive.pipe(output);
        
        // Add the JSON file
        archive.file(backupFile, { name: 'messages.json' });
        
        // Add the files directory if it exists
        if (fs.existsSync(filesDir)) {
            archive.directory(filesDir, 'files');
        }
        
        archive.finalize();
    } catch (error) {
        console.error('Error downloading backup:', error);
        res.status(500).json({ error: 'Failed to download backup' });
    }
});

app.delete('/api/chat/backup/:id', checkAdminSession, async (req, res) => {
    try {
        const backupId = req.params.id;
        const backupFile = path.join(CLEANUP_CONFIG.backupDir, `chat_backup_${backupId}.json`);
        const filesDir = path.join(CLEANUP_CONFIG.backupDir, `files_${backupId}`);
        
        if (fs.existsSync(backupFile)) {
            fs.unlinkSync(backupFile);
        }
        
        if (fs.existsSync(filesDir)) {
            fs.rmSync(filesDir, { recursive: true, force: true });
        }
        
        res.json({ message: 'Backup deleted successfully' });
    } catch (error) {
        console.error('Error deleting backup:', error);
        res.status(500).json({ error: 'Failed to delete backup' });
    }
});

// Clear all chat data
app.post('/api/chat/clear-all', checkAdminSession, async (req, res) => {
    console.log('Clear all chat data endpoint called');
    try {
        // Start a transaction
        console.log('Getting database connection...');
        const connection = await pool.promise().getConnection();
        console.log('Database connection established');
        
        await connection.beginTransaction();
        console.log('Transaction started');

        try {
            // Get all file URLs before deleting messages
            console.log('Fetching file URLs from database...');
            const [files] = await connection.query('SELECT file_url FROM chat_messages WHERE file_url IS NOT NULL');
            console.log(`Found ${files.length} files to delete`);
            
            // Delete all messages from the database
            console.log('Deleting all messages from database...');
            const [deleteResult] = await connection.query('DELETE FROM chat_messages');
            console.log('Delete result:', deleteResult);
            
            // Commit the transaction
            console.log('Committing transaction...');
            await connection.commit();
            console.log('Transaction committed successfully');
            
            // After successful database cleanup, delete the physical files
            console.log('Starting file deletion...');
            let deletedFiles = 0;
            
            // Define directories to check for files
            const directories = [
                path.join(__dirname, '..', 'public', 'uploads', 'chat'),
                path.join(__dirname, '..', 'public', 'chat_files')
            ];

            // Delete files from database records
            for (const file of files) {
                if (file.file_url) {
                    // Try both with and without the 'public' prefix
                    const possiblePaths = [
                        path.join(__dirname, '..', 'public', file.file_url),
                        path.join(__dirname, '..', file.file_url)
                    ];

                    for (const filePath of possiblePaths) {
                        try {
                            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                                await fs.promises.unlink(filePath);
                                console.log('Successfully deleted file:', filePath);
                                deletedFiles++;
                                break; // Stop checking other paths if deletion was successful
                            }
                        } catch (fileError) {
                            console.error('Error checking/deleting file:', filePath, fileError);
                        }
                    }
                }
            }

            // Clean up any remaining files in the chat directories
            for (const directory of directories) {
                try {
                    if (fs.existsSync(directory)) {
                        const files = await fs.promises.readdir(directory);
                        for (const file of files) {
                            const filePath = path.join(directory, file);
                            try {
                                const stats = await fs.promises.stat(filePath);
                                if (stats.isFile()) {
                                    await fs.promises.unlink(filePath);
                                    console.log('Successfully deleted additional file:', filePath);
                                    deletedFiles++;
                                }
                            } catch (fileError) {
                                console.error('Error deleting additional file:', filePath, fileError);
                            }
                        }
                    }
                } catch (dirError) {
                    console.error('Error reading directory:', directory, dirError);
                }
            }

            // Broadcast to all connected clients that chat has been cleared
            console.log('Broadcasting chat cleared message to all clients...');
            let connectedClients = 0;
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({
                        type: 'chat_cleared',
                        message: 'All chat messages have been cleared by an administrator'
                    }));
                    connectedClients++;
                }
            });
            console.log(`Broadcast sent to ${connectedClients} connected clients`);

            console.log('Clear all chat data completed successfully');
            res.json({ 
                message: 'All chat data cleared successfully',
                deletedMessages: deleteResult.affectedRows,
                deletedFiles: deletedFiles
            });
        } catch (error) {
            console.error('Error during transaction, rolling back:', error);
            await connection.rollback();
            throw error;
        } finally {
            console.log('Releasing database connection');
            connection.release();
        }
    } catch (error) {
        console.error('Error clearing chat data:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Failed to clear chat data',
            details: error.message
        });
    }
});

// Profile API endpoints
app.get('/api/profile', checkSession, async (req, res) => {
    let connection;
    try {
        connection = await pool.promise().getConnection();
        const [rows] = await connection.query(
            'SELECT username, email, phone, preferred_hostel, profile_picture FROM users WHERE id = ?',
            [req.session.user.id]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(rows[0]);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.post('/api/profile/update', checkSession, async (req, res) => {
    const { username, phone } = req.body;
    let connection;
    
    try {
        connection = await pool.promise().getConnection();
        await connection.beginTransaction();

        // Check if username is taken by another user
        const [existingUsers] = await connection.query(
            'SELECT id FROM users WHERE username = ? AND id != ?',
            [username, req.session.user.id]
        );
        
        if (existingUsers.length > 0) {
            await connection.rollback();
            return res.status(400).json({ error: 'Username is already taken' });
        }
        
        await connection.query(
            'UPDATE users SET username = ?, phone = ? WHERE id = ?',
            [username, phone, req.session.user.id]
        );

        await connection.commit();
        res.json({ username, phone });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.get('/api/profile/stats', checkSession, async (req, res) => {
    let connection;
    try {
        connection = await pool.promise().getConnection();
        
        // Get room number from active booking
        const [roomRows] = await connection.query(`
            SELECT r.room_number, b.status
            FROM bookings b
            JOIN rooms r ON b.room_id = r.id
            WHERE b.user_id = ? 
            AND (b.status = 'active' OR b.status = 'confirmed' OR b.status = 'completed' OR b.status = 'APPROVED')
            ORDER BY b.created_at DESC
            LIMIT 1
        `, [req.session.user.id]);
        
        // Get messages count
        const [messageRows] = await connection.query(
            'SELECT COUNT(*) as count FROM chat_messages WHERE user_id = ?',
            [req.session.user.id]
        );
        
        // Get days active (using account creation date)
        const [userRows] = await connection.query(
            'SELECT DATEDIFF(NOW(), created_at) as days_active FROM users WHERE id = ?',
            [req.session.user.id]
        );
        
        res.json({
            roomNumber: roomRows.length > 0 ? roomRows[0].room_number : 'N/A',
            messages: messageRows[0].count,
            daysActive: userRows[0].days_active
        });
    } catch (error) {
        console.error('Error fetching profile stats:', error);
        res.status(500).json({ error: 'Failed to fetch profile stats' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.get('/api/profile/activity', checkSession, async (req, res) => {
    let connection;
    try {
        connection = await pool.promise().getConnection();
        const activities = [];

        // Get recent bookings
        const [bookings] = await connection.query(
            'SELECT b.created_at as timestamp, "booking" as type, ' +
            'CONCAT("Booked ", u.preferred_hostel, " hostel") as description ' +
            'FROM bookings b ' +
            'JOIN users u ON b.user_id = u.id ' +
            'WHERE b.user_id = ? ' +
            'ORDER BY b.created_at DESC LIMIT 5',
            [req.session.user.id]
        );
        activities.push(...bookings);

        // Get recent messages
        const [messages] = await connection.query(
            'SELECT created_at as timestamp, "message" as type, "Sent a message in community chat" as description ' +
            'FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
            [req.session.user.id]
        );
        activities.push(...messages);

        // Sort activities by timestamp
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(activities.slice(0, 10));
    } catch (error) {
        console.error('Error fetching user activity:', error);
        res.status(500).json({ error: 'Failed to fetch user activity' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.get('/api/profile/notifications', checkSession, async (req, res) => {
    let connection;
    try {
        connection = await pool.promise().getConnection();
        const [settings] = await connection.query(
            'SELECT email_notifications, chat_notifications, community_notifications FROM user_settings WHERE user_id = ?',
            [req.session.user.id]
        );

        if (settings.length === 0) {
            // Create default settings if none exist
            await connection.query(
                'INSERT INTO user_settings (user_id, email_notifications, chat_notifications, community_notifications) VALUES (?, true, true, true)',
                [req.session.user.id]
            );
            return res.json({
                emailNotifications: true,
                chatNotifications: true,
                communityNotifications: true
            });
        }

        res.json({
            emailNotifications: settings[0].email_notifications === 1,
            chatNotifications: settings[0].chat_notifications === 1,
            communityNotifications: settings[0].community_notifications === 1
        });
    } catch (error) {
        console.error('Error fetching notification settings:', error);
        res.status(500).json({ error: 'Failed to fetch notification settings' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

app.post('/api/profile/notifications', checkSession, async (req, res) => {
    const { setting, enabled } = req.body;
    let connection;
    
    const settingMap = {
        emailNotifications: 'email_notifications',
        chatNotifications: 'chat_notifications',
        communityNotifications: 'community_notifications'
    };

    const dbColumn = settingMap[setting];
    if (!dbColumn) {
        return res.status(400).json({ error: 'Invalid setting' });
    }

    try {
        connection = await pool.promise().getConnection();
        await connection.query(
            `UPDATE user_settings SET ${dbColumn} = ? WHERE user_id = ?`,
            [enabled, req.session.user.id]
        );

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating notification settings:', error);
        res.status(500).json({ error: 'Failed to update notification settings' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});

// Profile picture upload endpoint
app.post('/api/profile/upload-picture', checkSession, upload.single('profilePicture'), async (req, res) => {
    let connection;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Create profile pictures directory if it doesn't exist
        const profilePicsDir = path.join(__dirname, '../public/uploads/profile');
        if (!fs.existsSync(profilePicsDir)) {
            fs.mkdirSync(profilePicsDir, { recursive: true });
        }

        // Generate unique filename
        const filename = `profile_${req.session.user.id}_${Date.now()}${path.extname(req.file.originalname)}`;
        const filepath = path.join(profilePicsDir, filename);

        // Move uploaded file to profile pictures directory
        fs.renameSync(req.file.path, filepath);

        // Update user's profile picture in database
        const imageUrl = `/uploads/profile/${filename}`;
        
        connection = await pool.promise().getConnection();
        await connection.query(
            'UPDATE users SET profile_picture = ? WHERE id = ?',
            [imageUrl, req.session.user.id]
        );

        res.json({ imageUrl });
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        res.status(500).json({ error: 'Failed to upload profile picture' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
});
  