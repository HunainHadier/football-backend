// src/db.js
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

export const testDbConnection = async () => {
  try {
    const connection = await pool.getConnection();
    await connection.ping(); // simple ping
    console.log("✅ Connected to MySQL database:", process.env.DB_NAME);
    connection.release();
  } catch (err) {
    console.error("❌ Failed to connect to MySQL:", err.message);
  }
};
