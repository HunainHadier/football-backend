import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../../config/db.js";

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    // 1) Fetch user
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE u_username = ? LIMIT 1",
      [username]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = rows[0];

    // 2) Deactivation check
    if (user.u_status === 0) {
      return res.status(403).json({
        message: "Your account is deactivated. Please contact the administrator.",
      });
    }

    // 3) Password check
    const isMatch = await bcrypt.compare(password, user.u_password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 4) Issue JWT WITH REGION
    const payload = { 
      id: user.u_id, 
      role: user.u_role,
      u_region: user.u_region   // ADD THIS LINE
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "7d",
    });

    // 5) Safe user object ALSO contains region
    const safeUser = {
      id: user.u_id,
      name: user.u_name,
      username: user.u_username,
      email: user.u_email,
      role: user.u_role,
      u_region: user.u_region   // ADD THIS TOO
    };

    return res.json({
      token,
      user: safeUser,
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
