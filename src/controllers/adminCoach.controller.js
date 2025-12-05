// src/controllers/adminCoach.controller.js
import bcrypt from "bcryptjs";
import { pool } from "../../config/db.js";

// GET /api/admin/coaches  (list all coaches)
// GET /api/admin/coaches
export const listCoaches = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT 
          u_id, 
          u_name, 
          u_username, 
          u_email, 
          u_status, 
          u_region,
          created_at
       FROM users
       WHERE u_role = 'COACH'
       ORDER BY created_at DESC`
    );

    return res.json({ coaches: rows });
  } catch (err) {
    console.error("Error listing coaches:", err);
    return res.status(500).json({ message: "Failed to fetch coaches" });
  }
};


// POST /api/admin/coaches
export const createCoach = async (req, res) => {
  try {
    const { name, username, email, password, status, region } = req.body;

    if (!name || !username || !email || !password || !region) {
      return res
        .status(400)
        .json({ message: "Name, username, email, password & region are required" });
    }

    // Check duplicate
    const [existing] = await pool.query(
      "SELECT u_id FROM users WHERE u_username = ? OR u_email = ? LIMIT 1",
      [username, email]
    );
    if (existing.length > 0) {
      return res
        .status(409)
        .json({ message: "Username or email already exists" });
    }

    const hash = await bcrypt.hash(password, 10);
    const u_status = status === 0 || status === "0" ? 0 : 1;

    const [result] = await pool.query(
      `INSERT INTO users 
       (u_name, u_username, u_email, u_password, u_role, u_status, u_region)
       VALUES (?, ?, ?, ?, 'COACH', ?, ?)`,
      [name, username, email, hash, u_status, region]
    );

    return res.status(201).json({
      message: "Coach created",
      coach: {
        u_id: result.insertId,
        u_name: name,
        u_username: username,
        u_email: email,
        u_status,
        u_region: region,
      },
    });
  } catch (err) {
    console.error("Error creating coach:", err);
    return res.status(500).json({ message: "Failed to create coach" });
  }
};

// PUT /api/admin/coaches/:id  (update coach: name, username, email, status, optional new password)

export const updateCoach = async (req, res) => {
  try {
    const coachId = req.params.id;
    const { name, username, email, status, password, region } = req.body;

    // Check coach exists
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE u_id = ? AND u_role = 'COACH' LIMIT 1",
      [coachId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Coach not found" });
    }

    const coach = rows[0];

    // Unique username/email check
    const [dups] = await pool.query(
      `SELECT u_id FROM users
       WHERE (u_username = ? OR u_email = ?)
       AND u_id <> ?
       LIMIT 1`,
      [username || coach.u_username, email || coach.u_email, coachId]
    );
    if (dups.length > 0) {
      return res
        .status(409)
        .json({ message: "Username or email already in use" });
    }

    const newName = name ?? coach.u_name;
    const newUsername = username ?? coach.u_username;
    const newEmail = email ?? coach.u_email;
    const newRegion = region ?? coach.u_region;

    const newStatus =
      status === 0 || status === "0"
        ? 0
        : status === 1 || status === "1"
        ? 1
        : coach.u_status;

    let passwordPart = "";
    const params = [newName, newUsername, newEmail, newRegion];

    // new password?
    if (password && password.trim().length > 0) {
      const hash = await bcrypt.hash(password, 10);
      passwordPart = ", u_password = ?";
      params.push(hash);
    }

    params.push(newStatus, coachId); // final params

    await pool.query(
      `
      UPDATE users
      SET 
        u_name = ?, 
        u_username = ?, 
        u_email = ?, 
        u_region = ? 
        ${passwordPart},
        u_status = ?
      WHERE u_id = ?
      `,
      params
    );

    return res.json({
      message: "Coach updated",
      coach: {
        u_id: coachId,
        u_name: newName,
        u_username: newUsername,
        u_email: newEmail,
        u_region: newRegion,
        u_status: newStatus,
      },
    });
  } catch (err) {
    console.error("Error updating coach:", err);
    return res.status(500).json({ message: "Failed to update coach" });
  }
};
