const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const auth = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ 
        error: 'Access denied',
        message: 'No token provided' 
      });
    }

    // Extract token (supports both "Bearer token" and "token" formats)
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    if (!token) {
      return res.status(401).json({ 
        error: 'Access denied',
        message: 'Invalid token format' 
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if user still exists
      const [users] = await query(
        'SELECT UserID, Username, Email, Account_Status FROM Users WHERE UserID = ?',
        [decoded.userId]
      );

      if (users.length === 0) {
        return res.status(401).json({ 
          error: 'Access denied',
          message: 'User not found' 
        });
      }

      const user = users[0];

      // Check if account is active
      if (user.Account_Status !== 'Active') {
        return res.status(401).json({ 
          error: 'Access denied',
          message: 'Account suspended or inactive' 
        });
      }

      // Add user info to request
      req.user = {
        userId: user.UserID,
        username: user.Username,
        email: user.Email
      };

      next();
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError.message);
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ 
          error: 'Token expired',
          message: 'Please login again' 
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ 
          error: 'Invalid token',
          message: 'Token is malformed' 
        });
      }
      
      throw jwtError;
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      message: 'Internal server error during authentication' 
    });
  }
};

// Optional auth middleware (doesn't require authentication)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      req.user = null;
      return next();
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : authHeader;

    if (!token) {
      req.user = null;
      return next();
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const [users] = await query(
        'SELECT UserID, Username, Email FROM Users WHERE UserID = ? AND Account_Status = ?',
        [decoded.userId, 'Active']
      );

      req.user = users.length > 0 ? {
        userId: users[0].UserID,
        username: users[0].Username,
        email: users[0].Email
      } : null;

    } catch (jwtError) {
      req.user = null;
    }

    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

module.exports = { auth, optionalAuth };
