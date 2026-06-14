// db.js — PostgreSQL connection pool.
// The pool keeps a set of open connections and hands them out on demand,
// instead of opening a new one for every HTTP request.

import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Shorthand wrapper so callers write query("SELECT...") instead of pool.query("SELECT...")
export const query = (text, params) => pool.query(text, params);
export default pool;
