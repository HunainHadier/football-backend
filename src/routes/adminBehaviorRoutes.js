import { Router } from "express";
import { getCombinedBehaviorScore } from "../controllers/adminBehaviorScore.js";

const router = Router();

router.get("/combined/:playerId", getCombinedBehaviorScore);

export default router;
