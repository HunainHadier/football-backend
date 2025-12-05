import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
    
    getPlayerEvaluations
} from "../controllers/evaluations.controller.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(["COACH","ADMIN"]));


router.get("/player/:id", requireAuth, getPlayerEvaluations);

export default router;
