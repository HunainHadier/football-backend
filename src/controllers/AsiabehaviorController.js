import { pool } from "../../config/db.js";

// Excel-like ERF (for normal CDF)
function erf(x) {
  const sign = Math.sign(x);
  x = Math.abs(x);

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * x);

  const y =
    1 -
    (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) *
    t *
    Math.exp(-x * x);

  return sign * y;
}

// Standard normal CDF
function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

/**
 * Helper function to compute category data
 * Returns raw numeric competencyScore for overall calculation.
 */
function computeCategory(probabilities, questions, negatives) {
  const scores = [];
  questions.forEach((qid) => {
    let prob = probabilities[qid] ?? 0;
    if (negatives.includes(qid)) {
      prob = -prob;
    }
    scores.push({
      qid,
      value: Number(prob.toFixed(9)),
    });
  });

  const total = scores.reduce((sum, x) => sum + x.value, 0);
  const positiveCount = scores.filter((s) => s.value > 0).length;
  const negativeCount = scores.filter((s) => s.value < 0).length * -1;
  const count = scores.length;
  const max = positiveCount;
  const min = negativeCount;

  const range = [];
  for (let i = negativeCount; i <= positiveCount; i++) {
    range.push(i);
  }

  function quartileRaw(arr, q) {
    const n = arr.length;
    if (n === 0) return null;
    // Ensure array is sorted for correct quartile calculation
    const sortedArr = [...arr].sort((a, b) => a - b);
    const pos = (n - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (base >= n - 1) {
      return sortedArr[n - 1];
    }
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  }

  const rawQ1 = quartileRaw(range, 0.25);
  const rawQ2 = quartileRaw(range, 0.5);
  const rawQ3 = quartileRaw(range, 0.75);
  const rawQ4 = quartileRaw(range, 1.0);

  const q1 = rawQ1 != null ? Math.round(rawQ1) : null;
  const q2 = rawQ2 != null ? Math.round(rawQ2) : null;
  const q3 = rawQ3 != null ? Math.round(rawQ3) : null;
  const q4 = rawQ4 != null ? Math.round(rawQ4) : null;

  let level = "";
  if (total <= rawQ1) level = "Level 1";
  else if (total <= rawQ2) level = "Level 2";
  else if (total <= rawQ3) level = "Level 3";
  else level = "Level 4";

  // Competency Score (0-1, raw numeric value)
  const denominator = positiveCount - negativeCount;
  const competencyScoreRaw = denominator !== 0 ? 1 - (positiveCount - total) / denominator : 0;

  let margin = 0;
  let nextLevelTarget = rawQ4; 
  if (level === "Level 1") {
    nextLevelTarget = rawQ2;
  } else if (level === "Level 2") {
    nextLevelTarget = rawQ3;
  }

  const marginDenominator = nextLevelTarget - negativeCount;
  if (marginDenominator > 0 && total < nextLevelTarget) {
      margin = (nextLevelTarget - total) / marginDenominator;
  } else if (level === "Level 4") {
      margin = (rawQ4 - total) / marginDenominator; 
      if (margin < 0) margin = 0; 
  } else {
      margin = 0;
  }
  
  return {
    total: Number(total.toFixed(9)),
    count,
    max,
    min,
    quartiles: { q1, q2, q3, q4 },
    level,
    // --- ADDED FOR TEAM AVERAGE ---
    competencyScoreRaw: competencyScoreRaw,
    // ----------------------------
    competency_score: `${Number((competencyScoreRaw * 100).toFixed(2))}%`,
    margin_for_mastering_next_level: `${Number((margin * 100).toFixed(2))}%`,
  };
}

// ----------------------------------------------------------------------
// NEW HELPER FUNCTION TO COMPUTE ALL CATEGORIES FOR A SINGLE ANSWER ROW
// ----------------------------------------------------------------------
function computeAllCategories(ans, stats, categoryMaps) {
    const probabilities = {};
    for (const row of stats) {
      const qid = row.q_id;
      const answer = Number(ans[`q${qid}`]);
      const mean = parseFloat(row.mean);
      const sd = parseFloat(row.sd);
      if (!Number.isFinite(answer) || !Number.isFinite(mean) || !Number.isFinite(sd)) {
          continue;
      }
      let p;
      if (sd === 0) {
          p = 0.5;
      } else {
          const z = (answer - mean) / sd;
          p = normalCdf(z);
      }
      let prob = p;
      if (answer < mean) {
          prob = 1 - prob;
      }
      probabilities[qid] = Number(prob.toFixed(12));
    }
    
    const results = {};
    for (const [traitName, map] of Object.entries(categoryMaps)) {
        const result = computeCategory(probabilities, map.questions, map.negatives);
        results[traitName] = result.competencyScoreRaw; // Only return the raw score
    }
    return results;
}

// ----------------------------------------------------------------------
// MAIN EXPORTED FUNCTION
// ----------------------------------------------------------------------

export const getAsiaBehaviorScore = async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    if (!playerId) {
      return res.status(400).json({ error: "Invalid or missing player ID" });
    }
    
    // Competency/Trait definition map
    const categoryMaps = {
        GA: { name: "game_awareness", questions: [1, 20, 22, 26, 28, 30, 31, 32, 33], negatives: [26, 28, 30, 33] },
        TW: { name: "team_work", questions: [7, 18, 21, 25, 27, 29], negatives: [18] },
        DE: { name: "discipline_ethics", questions: [8, 15, 19, 23], negatives: [] },
        RE: { name: "resilience", questions: [2, 9, 16], negatives: [2] },
        FO: { name: "focus", questions: [3, 10], negatives: [] },
        LE: { name: "leadership", questions: [4, 11, 24], negatives: [11, 24] },
        CO: { name: "communication", questions: [12], negatives: [] },
        EN: { name: "endurance", questions: [5, 13, 17], negatives: [5] },
        SP: { name: "speed", questions: [6, 14], negatives: [] }
    };
    const traitKeys = Object.keys(categoryMaps);
    const traitNames = Object.values(categoryMaps).map(m => m.name);

    // 1) Fetch answers & 2) Fetch question stats (same as before)
    const [answers] = await pool.query(
      "SELECT * FROM asia_behavior_answers WHERE player_id = ? LIMIT 1",
      [playerId]
    );

    if (!answers.length) {
      return res.status(404).json({ error: "No answers found for this player" });
    }
    const ans = answers[0];

    const [stats] = await pool.query(
      "SELECT * FROM asia_question_stats ORDER BY q_id ASC"
    );

    // --- Weights for Overall Score Calculation ---
    const traitWeights = {
        game_awareness: 0.130851880276285,
        team_work: 0.0709900230237913,
        discipline_ethics: 0.148695318495779,
        resilience: 0.127782041442824,
        focus: 0.0997697620874904,
        leadership: 0.153300076745971,
        communication: 0.0514198004604758,
        endurance: 0.082118189,
        speed: 0.13507291
    };

    // --- INDIVIDUAL PLAYER SCORE CALCULATION ---
    
    // 3 & 4) Compute all 9 categories scores (full metrics)
    const probabilities = {};
    for (const row of stats) {
      const qid = row.q_id;
      const answer = Number(ans[`q${qid}`]);
      const mean = parseFloat(row.mean);
      const sd = parseFloat(row.sd);
      if (!Number.isFinite(answer) || !Number.isFinite(mean) || !Number.isFinite(sd)) {
        continue;
      }
      let p;
      if (sd === 0) {
        p = 0.5;
      } else {
        const z = (answer - mean) / sd;
        p = normalCdf(z);
      }
      let prob = p;
      if (answer < mean) {
        prob = 1 - prob;
      }
      probabilities[qid] = Number(prob.toFixed(12));
    }
    
    const GA = computeCategory(probabilities, categoryMaps.GA.questions, categoryMaps.GA.negatives);
    const TW = computeCategory(probabilities, categoryMaps.TW.questions, categoryMaps.TW.negatives);
    const DE = computeCategory(probabilities, categoryMaps.DE.questions, categoryMaps.DE.negatives);
    const RE = computeCategory(probabilities, categoryMaps.RE.questions, categoryMaps.RE.negatives);
    const FO = computeCategory(probabilities, categoryMaps.FO.questions, categoryMaps.FO.negatives);
    const LE = computeCategory(probabilities, categoryMaps.LE.questions, categoryMaps.LE.negatives);
    const CO = computeCategory(probabilities, categoryMaps.CO.questions, categoryMaps.CO.negatives);
    const EN = computeCategory(probabilities, categoryMaps.EN.questions, categoryMaps.EN.negatives);
    const SP = computeCategory(probabilities, categoryMaps.SP.questions, categoryMaps.SP.negatives);


    // 5) Calculate Player Overall Weighted Score
    
    const playerBehaviorOverallScoreRaw = 
        (GA.competencyScoreRaw * traitWeights.game_awareness) +
        (TW.competencyScoreRaw * traitWeights.team_work) +
        (DE.competencyScoreRaw * traitWeights.discipline_ethics) +
        (RE.competencyScoreRaw * traitWeights.resilience) +
        (FO.competencyScoreRaw * traitWeights.focus) +
        (LE.competencyScoreRaw * traitWeights.leadership) +
        (CO.competencyScoreRaw * traitWeights.communication) +
        (EN.competencyScoreRaw * traitWeights.endurance) +
        (SP.competencyScoreRaw * traitWeights.speed);

    const playerBehaviorOverallScore = `${Number((playerBehaviorOverallScoreRaw * 100).toFixed(3))}%`;
    
    // --- NEW FUNCTIONALITY: TEAM COMPETENCY AVERAGES ---
    let teamAverageScores = {};
    let teamId = null;

    try {
        // 1. Player ki team_id maloom karein
        const [playerRows] = await pool.query(
            `SELECT team_id FROM players WHERE p_id=?`,
            [playerId]
        );

        if (playerRows.length && playerRows[0].team_id) {
            teamId = playerRows[0].team_id;

            // 2. Team ke sabhi player IDs nikalen
            const [teamPlayersRows] = await pool.query(
                `SELECT p_id FROM players WHERE team_id=?`,
                [teamId]
            );
            const teamPlayerIds = teamPlayersRows.map(row => row.p_id);

            if (teamPlayerIds.length > 0) {
                // 3. Team ke sabhi players ki latest answers fetch karein
                const [allTeamAnswers] = await pool.query(`
                    SELECT t1.*
                    FROM asia_behavior_answers t1
                    INNER JOIN (
                        SELECT player_id, MAX(created_at) AS latest_date
                        FROM asia_behavior_answers
                        WHERE player_id IN (?)
                        GROUP BY player_id
                    ) t2 ON t1.player_id = t2.player_id AND t1.created_at = t2.latest_date
                    WHERE t1.player_id IN (?)
                `, [teamPlayerIds, teamPlayerIds]);

                // 4. Initialise an object to track total scores and valid count for each competency
                const competencyAveragesTracker = traitNames.reduce((acc, name) => {
                    acc[name] = { totalScore: 0, count: 0 };
                    return acc;
                }, {});

                // 5. Calculate total scores for ALL 9 competencies across ALL team players
                for (const teamPlayerAnswer of allTeamAnswers) {
                    // Compute raw competency scores for ALL 9 traits for this team player
                    const playerRawScores = computeAllCategories(teamPlayerAnswer, stats, categoryMaps);
                    
                    // Sum up the scores for each trait
                    for (const [traitKey, rawScore] of Object.entries(playerRawScores)) {
                        const traitName = categoryMaps[traitKey].name;
                        const playerScorePercent = rawScore * 100; // Convert raw score (0-1) to percent
                        
                        if (!isNaN(playerScorePercent)) {
                            competencyAveragesTracker[traitName].totalScore += playerScorePercent;
                            competencyAveragesTracker[traitName].count++;
                        }
                    }
                }

                // 6. Calculate final averages
                let teamBehaviorOverallScoreRaw = 0; // Initialize raw score
                let totalWeight = 0; // Check if total weight is 1 (it should be)

                for (const traitName of traitNames) {
                    const tracker = competencyAveragesTracker[traitName];
                    const weight = traitWeights[traitName]; // Get the weight

                    if (tracker.count > 0) {
                        let average = tracker.totalScore / tracker.count;
                        teamAverageScores[traitName] = Number(average.toFixed(2));
                        
                        // Calculate team overall score contribution
                        // Note: The average is in percent (0-100), convert it back to raw (0-1) for weighted sum
                        teamBehaviorOverallScoreRaw += (average / 100) * weight;
                        totalWeight += weight;

                    } else {
                        teamAverageScores[traitName] = 0.00;
                    }
                }

                // Final Team Overall Score (in percentage)
                const teamBehaviorOverallScore = `${Number((teamBehaviorOverallScoreRaw * 100).toFixed(3))}%`;
                teamAverageScores.Team_Behavior_Trait_Overall_Score = teamBehaviorOverallScore; // Add to the response object

            }
        }
    } catch (teamError) {
        console.error("Team Average Calculation Error:", teamError);
        // Non-critical error, proceed with individual score response
    }
    // --- END OF NEW FUNCTIONALITY ---


    // --- 7) Prepare Final Response ---

    // Remove the temporary raw score property before sending the response
    delete GA.competencyScoreRaw;
    delete TW.competencyScoreRaw;
    delete DE.competencyScoreRaw;
    delete RE.competencyScoreRaw;
    delete FO.competencyScoreRaw;
    delete LE.competencyScoreRaw;
    delete CO.competencyScoreRaw;
    delete EN.competencyScoreRaw;
    delete SP.competencyScoreRaw;


    return res.json({
      player_id: playerId,
      player_behavior_trait_overall_score: playerBehaviorOverallScore, // Final weighted score
      game_awareness: GA,
      team_work: TW,
      discipline_ethics: DE,
      resilience: RE,
      focus: FO,
      leadership: LE,
      communication: CO,
      endurance: EN,
      speed: SP,
      // NEW FIELD: Team Averages for all 9 traits, including the Team Overall Score
      Team_Average_Scores: teamAverageScores 
      
    });
  } catch (err) {
    console.log("getAsiaBehaviorScore main error:", err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};