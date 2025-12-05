// routes/behaviorRoutes.js
import express from "express";
import { getBehaviorScore } from "../controllers/AfricabehaviorController.js";

const router = express.Router();

// GET behavior score for a player
// /api/behavior/score/:playerId
router.get("/score/:playerId", getBehaviorScore);

export default router;
