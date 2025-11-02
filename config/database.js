const { Pool } = require('pg');
require('dotenv').config();

// ==============================================
// POSTGRESQL CONFIGURATION (RENDER FREE)
// ==============================================

let pool;

const initializeDatabase = async () => {
  try {
    console.log('🔄 Connecting to PostgreSQL database...');
    
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database successfully');
    await client.query('SELECT NOW()');
    client.release();
    
    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
};

// ==============================================
// DATABASE HELPER FUNCTIONS
// ==============================================

const query = async (text, params = []) => {
  try {
    if (!pool) {
      await initializeDatabase();
    }
    
    const client = await pool.connect();
    try {
      const result = await client.query(text, params);
      return [result.rows];
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

const callProcedure = async (procedureName, params = []) => {
  try {
    // PostgreSQL uses functions instead of procedures
    const placeholders = params.map((_, i) => `$${i + 1}`).join(',');
    const sql = `SELECT * FROM ${procedureName}(${placeholders})`;
    return await query(sql, params);
  } catch (error) {
    console.error('Function call error:', error);
    throw error;
  }
};

// Test database connection
const testConnection = async () => {
  try {
    const [result] = await query('SELECT NOW() as current_time');
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
