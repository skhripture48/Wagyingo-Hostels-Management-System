const jwt = require('jsonwebtoken');

// Middleware to authenticate session
const authenticateToken = (req, res, next) => {
    // Get user from session
    if (!req.session || !req.session.user) {
        return res.status(401).json({ message: 'Please login to continue' });
    }

    // Add user info to request object
    req.user = {
        id: req.session.user.id,
        username: req.session.user.username,
        role: req.session.user.role,
        preferred_hostel: req.session.user.preferred_hostel
    };

    next();
};

const authorize = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        next();
    };
};

module.exports = {
    authenticateToken,
    authorize
}; 