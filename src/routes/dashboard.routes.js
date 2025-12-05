// src/routes/dashboard.routes.js
import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getDashboardStats
} from "../controllers/dashboard.controller.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(["ADMIN", "COACH"]));

router.get("/stats", getDashboardStats);

export default router;
