const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// ==============================================
// SECURITY MIDDLEWARE
// ==============================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable for development
  crossOriginEmbedderPolicy: false
}));

// Compression middleware
app.use(compression());

// Trust proxy (required for Render)
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// ==============================================
// CORS CONFIGURATION (FREE HOSTING OPTIMIZED)
// ==============================================

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? [
          // Add your frontend URLs here
          'https://nutritrack-pro.netlify.app',
          'https://nutritrack-pro.vercel.app',
          'https://your-custom-domain.com',
          // Render frontend URL format
          'https://nutritrack-frontend.onrender.com'
        ]
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000'
        ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS blocked origin: ${origin}`);
      callback(null, true); // Allow for development - remove in production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control'
  ]
};

app.use(cors(corsOptions));

// ==============================================
// BODY PARSING MIDDLEWARE
// ==============================================

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ==============================================
// HEALTH CHECK & ROOT ENDPOINTS
// ==============================================

// Health check endpoint (required by Render)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    service: 'NutriTrack Pro API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 NutriTrack Pro API Server',
    version: '1.0.0',
    status: 'Running',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      users: '/api/users',
      meals: '/api/meals',
      workouts: '/api/workouts',
      goals: '/api/goals'
    },
    documentation: 'https://github.com/yourusername/nutritrack-pro#api-documentation'
  });
});

// ==============================================
// API ROUTES
// ==============================================

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/meals', require('./routes/meals'));
app.use('/api/workouts', require('./routes/workouts'));
app.use('/api/goals', require('./routes/goals'));

// ==============================================
// ERROR HANDLING MIDDLEWARE
// ==============================================

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    message: `The requested endpoint ${req.originalUrl} does not exist`,
    availableEndpoints: ['/api/auth', '/api/users', '/api/meals', '/api/workouts', '/api/goals']
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  
  // Database connection errors
  if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ER_ACCESS_DENIED_ERROR') {
    return res.status(500).json({
      error: 'Database connection error',
      message: 'Unable to connect to database'
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Please login again'
    });
  }
  
  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      message: err.message
    });
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong!',
    timestamp: new Date().toISOString()
  });
});

// ==============================================
// INITIALIZE DATABASE
// ==============================================

const { initializeDatabase } = require('./config/database');

// ==============================================
// START SERVER
// ==============================================

// Initialize database before starting server
initializeDatabase()
  .then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('='.repeat(50));
      console.log('🚀 NutriTrack Pro API Server Started!');
      console.log('='.repeat(50));
      console.log(`📡 Port: ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
      console.log(`📚 API Base: http://localhost:${PORT}/api`);
      console.log(`⏰ Started at: ${new Date().toISOString()}`);
      console.log('='.repeat(50));
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received: closing HTTP server');
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT signal received: closing HTTP server');
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });

module.exports = app;
