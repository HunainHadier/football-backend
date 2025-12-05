import express from "express";
import { login } from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/login", login);

// future: router.post("/register-coach", requireAuth, requireRole("ADMIN"), ...)

export default router;
