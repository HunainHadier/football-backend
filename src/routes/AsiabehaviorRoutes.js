// routes/behaviorRoutes.js
import express from "express";
import { getAsiaBehaviorScore } from "../controllers/AsiabehaviorController.js";

const router = express.Router();

// GET behavior score for a player
// /api/behavior/score/:playerId
router.get("/score/:id", getAsiaBehaviorScore);

export default router;
