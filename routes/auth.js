const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const router = express.Router();

// ==============================================
// REGISTER NEW USER
// ==============================================
router.post('/register', async (req, res) => {
  try {
    const { 
      username, 
      email, 
      password, 
      firstName, 
      lastName, 
      dateOfBirth, 
      gender, 
      phone 
    } = req.body;

    // Validate required fields
    if (!username || !email || !password || !firstName || !lastName || !dateOfBirth || !gender) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'All required fields must be provided',
        required: ['username', 'email', 'password', 'firstName', 'lastName', 'dateOfBirth', 'gender']
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Invalid email format' 
      });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Password must be at least 6 characters long' 
      });
    }

    // Check if user already exists
    const [existingUsers] = await query(
      'SELECT UserID FROM Users WHERE Email = ? OR Username = ?',
      [email, username]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ 
        error: 'User exists',
        message: 'User with this email or username already exists' 
      });
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const [userResult] = await query(
      `INSERT INTO Users (Username, Email, Password_Hash, First_Name, Last_Name, Date_Of_Birth, Gender, Phone) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [username, email, hashedPassword, firstName, lastName, dateOfBirth, gender, phone]
    );

    const userId = userResult.insertId;

    // Create default user profile
    await query(
      `INSERT INTO User_Profiles (UserID, Activity_Level, Fitness_Level) 
       VALUES (?, ?, ?)`,
      [userId, 'Moderately Active', 'Beginner']
    );

    // Create default user preferences
    await query(
      `INSERT INTO User_Preferences (UserID, Measurement_Units, Privacy_Level, Theme_Preference, Daily_Calorie_Goal) 
       VALUES (?, ?, ?, ?, ?)`,
      [userId, 'Metric', 'Private', 'Auto', 2000]
    );

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId, 
        username, 
        email 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Log successful registration
    await query(
      'INSERT INTO Activity_Logs (UserID, Activity_Type, Description, Status) VALUES (?, ?, ?, ?)',
      [userId, 'Register', 'New user registered successfully', 'Success']
    );

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: userId,
        username,
        email,
        firstName,
        lastName
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      error: 'Registration failed',
      message: 'Internal server error during registration' 
    });
  }
});

// ==============================================
// LOGIN USER
// ==============================================
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Validation failed',
        message: 'Email and password are required' 
      });
    }

    // Get user by email
    const [users] = await query(
      'SELECT UserID, Username, Email, Password_Hash, First_Name, Last_Name, Account_Status FROM Users WHERE Email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid email or password' 
      });
    }

    const user = users[0];

    // Check account status
    if (user.Account_Status !== 'Active') {
      return res.status(401).json({ 
        error: 'Account inactive',
        message: 'Your account is suspended or inactive' 
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.Password_Hash);

    if (!isValidPassword) {
      // Log failed login attempt
      await query(
        'INSERT INTO Activity_Logs (UserID, Activity_Type, Description, Status) VALUES (?, ?, ?, ?)',
        [user.UserID, 'Login', 'Failed login attempt - invalid password', 'Failed']
      );

      return res.status(401).json({ 
        error: 'Authentication failed',
        message: 'Invalid email or password' 
      });
    }

    // Update last login
    await query(
      'UPDATE Users SET Last_Login = CURRENT_TIMESTAMP WHERE UserID = ?',
      [user.UserID]
    );

    // Log successful login
    await query(
      'INSERT INTO Activity_Logs (UserID, Activity_Type, Description, Status) VALUES (?, ?, ?, ?)',
      [user.UserID, 'Login', 'User logged in successfully', 'Success']
    );

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.UserID, 
        username: user.Username, 
        email: user.Email 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.UserID,
        username: user.Username,
        email: user.Email,
        firstName: user.First_Name,
        lastName: user.Last_Name
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      error: 'Login failed',
      message: 'Internal server error during login' 
    });
  }
});

// ==============================================
// LOGOUT USER
// ==============================================
router.post('/logout', async (req, res) => {
  try {
    // Note: JWT tokens are stateless, so we can't invalidate them server-side
    // In a production app, you might maintain a blacklist of tokens
    
    res.json({
      success: true,
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ 
      error: 'Logout failed',
      message: 'Internal server error during logout' 
    });
  }
});

module.exports = router;
