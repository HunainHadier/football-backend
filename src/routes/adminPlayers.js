// src/routes/adminPlayers.js
import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getAllPlayersForAdmin, getPlayerTraitScores } from "../controllers/adminPlayersController.js";

const router = express.Router();

router.use(requireAuth);
router.use(requireRole(["ADMIN"]));

// GET /api/admin/players
router.get("/", getAllPlayersForAdmin);

// GET trait scores for one player
router.get("/:playerId/trait-scores", getPlayerTraitScores);

export default router;
