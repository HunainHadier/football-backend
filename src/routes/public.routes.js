import express from "express";
import { verifyEvaluationToken } from "../controllers/coachPlayers.controller.js";

const router = express.Router();

// PUBLIC Token Verify Route
router.get("/verify", verifyEvaluationToken);

export default router;
