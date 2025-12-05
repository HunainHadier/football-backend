// src/routes/adminCoach.routes.js
import { Router } from "express";
import { verifyToken, requireAdmin } from "../middleware/authMiddleware.js";
import {
  listCoaches,
  createCoach,
  updateCoach,
} from "../controllers/adminCoach.controller.js";

const router = Router();

// All routes are protected & admin-only
router.get("/", verifyToken, requireAdmin, listCoaches);
router.post("/", verifyToken, requireAdmin, createCoach);
router.put("/:id", verifyToken, requireAdmin, updateCoach);

export default router;
