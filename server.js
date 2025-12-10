import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./src/routes/auth.routes.js";
import { testDbConnection } from "./config/db.js";
import adminCoachRoutes from "./src/routes/adminCoach.routes.js";
import coachPlayersRoutes from "./src/routes/coachPlayers.routes.js";
import adminPlayersRoutes from "./src/routes/adminPlayers.js";
import evaluationRoutes from "./src/routes/evaluations.routes.js";
import matchRoutes from "./src/routes/matchRoutes.js";
import dashboardRoutes from "./src/routes/dashboard.routes.js";
import coachStatsRoutes from "./src/routes/coachStats.routes.js";
import PlayerevaluationsRoutes from "./src/routes/playerevaluations.routes.js";
import teamstats from "./src/routes/teamStats.routes.js";
import behaviorRoutes from "./src/routes/behaviorRoutes.js";
import tAsiaBehaviorScore from "./src/routes/AsiabehaviorRoutes.js";
import adminBehaviorRoute from "./src/routes/adminBehaviorRoutes.js";
import publicRoutes from "./src/routes/public.routes.js";




dotenv.config();

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174"
  ],
  credentials: true
}));

app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Optional: DB check route
app.get("/api/db-check", async (req, res) => {
  try {
    await testDbConnection();
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(500).json({ status: "error", db: "not-connected" });
  }
});

// Auth routes
app.use("/api/auth", authRoutes);
app.use("/api/admin/coaches", adminCoachRoutes);
app.use("/api/coach/players", coachPlayersRoutes);
app.use("/api/admin/players", adminPlayersRoutes);
app.use("/api/coach/evaluation", evaluationRoutes);
app.use("/api/match", matchRoutes);
app.use("/api/coach/dashboard", dashboardRoutes);
app.use("/api/coach/stats", coachStatsRoutes);
app.use("/api/player/evaluations", PlayerevaluationsRoutes);
app.use("/api", teamstats);
app.use("/api/africa", behaviorRoutes);
app.use("/api/asia", tAsiaBehaviorScore);
app.use("/api/admin/behavior", adminBehaviorRoute);
app.use("/api/public", publicRoutes);
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`API server listening on http://localhost:${PORT}`);

  // 🔥 server start hote hi DB connection test
  await testDbConnection();
});
