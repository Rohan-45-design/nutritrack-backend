const mysql = require('mysql2');
require('dotenv').config();

// ==============================================
// DATABASE CONFIGURATION FOR MYSQL ONLY
// ==============================================

const dbConfig = {
  production: {
    host: process.env.DB_HOST || 'autorack.proxy.rlwy.net',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'your-password',
    database: process.env.DB_NAME || 'railway',
    port: process.env.DB_PORT || 3306,
    ssl: { rejectUnauthorized: false },
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
    
    console.log(`🔄 Connecting to ${env} database...`);
    
    // Always use MySQL
    pool = mysql.createPool(dbConfig[env]);
    
    // Test connection
    const connection = await pool.promise().getConnection();
    console.log('✅ Connected to MySQL database successfully');
    connection.release();
    
    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('🔄 Retrying connection in 5 seconds...');
    
    // Retry connection after 5 seconds
    setTimeout(() => {
      initializeDatabase();
    }, 5000);
    
    throw error;
  }
};

// ==============================================
// DATABASE HELPER FUNCTIONS
// ==============================================

const query = async (sql, params = []) => {
  try {
    if (!pool) {
      await initializeDatabase();
    }
    
    const [results] = await pool.promise().execute(sql, params);
    return [results];
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
    const testQuery = 'SELECT 1 as test';
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

// Initialize database connection on module load
initializeDatabase().catch(console.error);
