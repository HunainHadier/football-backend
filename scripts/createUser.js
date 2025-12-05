// scripts/createUser.js
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

dotenv.config();

const run = async () => {
  try {
    const [, , usernameArg, passwordArg, roleArg] = process.argv;

    if (!usernameArg || !passwordArg) {
      console.log(
        "Usage: node scripts/createUser.js <username> <password> [role]"
      );
      console.log("Example: node scripts/createUser.js admin Admin@123 ADMIN");
      process.exit(1);
    }

    const username = usernameArg.trim();
    const plainPassword = passwordArg;
    const role = (roleArg || "ADMIN").toUpperCase(); // default ADMIN

    if (!["ADMIN", "COACH"].includes(role)) {
      console.log("Role must be ADMIN or COACH");
      process.exit(1);
    }

    // Check if username already exists
    const [existing] = await pool.query(
      "SELECT u_id FROM users WHERE u_username = ? LIMIT 1",
      [username]
    );

    if (existing.length > 0) {
      console.log(`❌ User with username "${username}" already exists.`);
      process.exit(1);
    }

    // Hash password
    const saltRounds = 10;
    const hash = await bcrypt.hash(plainPassword, saltRounds);

    const name = username; // simple: same as username
    const email = `${username}@club.test`; // dummy email

    const [result] = await pool.query(
      `INSERT INTO users (u_name, u_username, u_email, u_password, u_role, u_status)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [name, username, email, hash, role]
    );

    console.log("✅ User created successfully!");
    console.log("   ID:", result.insertId);
    console.log("   Username:", username);
    console.log("   Role:", role);
    console.log("   Password (plain):", plainPassword);
    console.log("   Password (hashed, stored in DB):", hash);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error creating user:", err.message);
    process.exit(1);
  }
};

run();
