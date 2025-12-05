import express from "express";
import {
  addTeamStats,
  getTeamStatsList,
  getSingleTeamStats,
  getTeamStatsAverage
} from "../controllers/teamStats.controller.js";


const router = express.Router();

router.post("/stats/add/:teamId",  addTeamStats);
router.get("/stats/list/:teamId",  getTeamStatsList);
router.get("/stats/view/:statsId",  getSingleTeamStats);
router.get("/stats/average/:teamId",  getTeamStatsAverage);

export default router;
