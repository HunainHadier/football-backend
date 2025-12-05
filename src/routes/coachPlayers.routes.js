import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";

import {
  getCoachPlayers,
  createCoachPlayer,
  updateCoachPlayer,
  deleteCoachPlayer,
  getPlayerProfileForCoach,
  assignPlayersToTeam,
  createTeam,
  getCoachTeams,
  getTeamPlayers,
  sendEvaluationToPlayer,
  getUnassignedPlayers,
  sendBulkEvaluation,
  getAllCoachTeamsForAdmin,
  unassignPlayersFromTeam,


} from "../controllers/coachPlayers.controller.js";

const router = express.Router();




// ALL routes need auth + COACH role
router.use(requireAuth);
router.use(requireRole(["COACH", "ADMIN"]));

// Player CRUD
router.get("/", getCoachPlayers);
router.post("/", createCoachPlayer);
router.put("/:id", updateCoachPlayer);
router.delete("/:id", deleteCoachPlayer);
router.get("/admin/all-coach-teams", getAllCoachTeamsForAdmin);


// Player Profile
router.get("/:playerId/profile", getPlayerProfileForCoach);

// Team Creation
router.post("/create", createTeam);

// Team List
router.get("/teams", getCoachTeams);

// Get players of a team
router.get("/teams/:team_id/players", getTeamPlayers);

// UNASSIGNED PLAYERS  ---------------------------------- ✔ FIX
router.get("/unassigned", getUnassignedPlayers);

// ASSIGN MULTIPLE PLAYERS TO A TEAM  -------------------- ✔ FIX
router.post("/teams/assign", assignPlayersToTeam);

router.post("/team/unassign", unassignPlayersFromTeam);


// Single player evaluation (existing)
router.post('/send-evaluation',

  sendEvaluationToPlayer
);

// Bulk player evaluation (new)
router.post('/send-bulk-evaluation',
  sendBulkEvaluation
);


export default router;
