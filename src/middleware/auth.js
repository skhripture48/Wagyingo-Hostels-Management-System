const jwt = require('jsonwebtoken');

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
    // Get user from session
    if (!req.session || !req.session.user) {
        return res.status(401).json({ message: 'Authentication required' });
    }

    // Add user info to request object
    req.user = {
        id: req.session.user.id,
        username: req.session.user.username,
        role: req.session.user.role
    };

    next();
};

module.exports = {
    authenticateToken
}; 