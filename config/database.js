const { Pool } = require('pg');
require('dotenv').config();

// ==============================================
// POSTGRESQL CONFIGURATION (FREE ON RENDER)
// ==============================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const query = async (text, params = []) => {
  try {
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

const testConnection = async () => {
  try {
    const [result] = await query('SELECT NOW() as current_time');
    console.log('✅ Database connected successfully');
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return false;
  }
};

module.exports = {
  query,
  testConnection,
  pool
};

// Test connection on startup
testConnection().catch(console.error);
