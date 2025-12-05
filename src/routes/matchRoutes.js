import express from "express";
import {
  getAllMatches,
  getMatchById,
  addMatch,
  updateMatch,
  deleteMatch,
  getMatchesByPlayer,
  exportMatchEvaluationExcel
} from "../controllers/matchController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";


const router = express.Router();

router.use(requireAuth);
router.use(requireRole(["ADMIN", "COACH"]));

// SPECIFIC ROUTES FIRST
router.get("/export/:playerId/:matchId", exportMatchEvaluationExcel);
router.get("/player/:playerId/matches", getMatchesByPlayer);

// THEN GENERAL ROUTES
router.get("/", getAllMatches);
router.post("/", addMatch);
router.get("/:id", getMatchById);
router.put("/:id", updateMatch);
router.delete("/:id", deleteMatch);


export default router;
