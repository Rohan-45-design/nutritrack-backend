const mysql = require('mysql2/promise');
require('dotenv').config();

// ==============================================
// DATABASE CONFIGURATION FOR FREE HOSTING
// ==============================================

const dbConfig = {
  production: {
    // For PostgreSQL (Render Free Tier)
    connectionString: process.env.DATABASE_URL,
    ssl: { 
      rejectUnauthorized: false 
    }
  },
  
  // Alternative MySQL configuration (if using MySQL)
  mysql: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
  },
  
  development: {
    host: 'localhost',
    user: 'nutritrack_user',
    password: 'NutriTrack2025!',
    database: 'nutritrack_pro_db'
  }
};

// ==============================================
// CREATE CONNECTION POOL
// ==============================================

let pool;

const initializeDatabase = async () => {
  try {
    const env = process.env.NODE_ENV || 'development';
    
    if (env === 'production') {
      // Use PostgreSQL for free hosting
      if (process.env.DATABASE_URL) {
        const { Pool } = require('pg');
        pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: { rejectUnauthorized: false }
        });
        
        // Test connection
        const client = await pool.connect();
        console.log('✅ Connected to PostgreSQL database');
        client.release();
      } else {
        // Fallback to MySQL
        pool = mysql.createPool(dbConfig.mysql);
        console.log('✅ Connected to MySQL database');
      }
    } else {
      // Development MySQL
      pool = mysql.createPool(dbConfig.development);
      console.log('✅ Connected to local MySQL database');
    }
    
    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
};

// ==============================================
// DATABASE HELPER FUNCTIONS
// ==============================================

const query = async (sql, params = []) => {
  try {
    if (process.env.DATABASE_URL) {
      // PostgreSQL queries
      const client = await pool.connect();
      try {
        const result = await client.query(sql, params);
        return [result.rows];
      } finally {
        client.release();
      }
    } else {
      // MySQL queries
      const [results] = await pool.execute(sql, params);
      return [results];
    }
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

const callProcedure = async (procedureName, params = []) => {
  try {
    const placeholders = params.map(() => '?').join(',');
    const sql = `CALL ${procedureName}(${placeholders})`;
    return await query(sql, params);
  } catch (error) {
    console.error('Stored procedure error:', error);
    throw error;
  }
};

// Test database connection
const testConnection = async () => {
  try {
    const testQuery = process.env.DATABASE_URL 
      ? 'SELECT NOW() as current_time'
      : 'SELECT NOW() as current_time';
    
    const [results] = await query(testQuery);
    console.log('✅ Database connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  }
};

// ==============================================
// EXPORTS
// ==============================================

module.exports = {
  initializeDatabase,
  query,
  callProcedure,
  testConnection,
  pool: () => pool
};

// Don't auto-initialize on module load - let server.js control initialization
// initializeDatabase().catch(console.error);
