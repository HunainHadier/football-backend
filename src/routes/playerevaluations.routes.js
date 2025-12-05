import express from "express";
import {
  publicGetEvaluationQuestions,
  publicSubmitEvaluation
} from "../controllers/Playerevaluations.js";

const router = express.Router();

// PUBLIC (No Auth)
router.get("/questions", publicGetEvaluationQuestions);
router.post("/submit", publicSubmitEvaluation);

export default router;
