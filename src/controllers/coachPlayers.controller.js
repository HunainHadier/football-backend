import { pool } from "../../config/db.js";
import { mailer } from "../../utils/mailer.js";
import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";


// 1. Helper Math Functions (from getBehaviorScore)

function erf(x) {
    // Numerical approximation of erf, Abramowitz & Stegun formula 7.1.26
    const sign = x >= 0 ? 1 : -1;
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    const t = 1.0 / (1.0 + p * Math.abs(x));
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}
function phi(z) {
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

function normalCdf(z) {
    // For Asia calculation - same as phi(z) but clearer intent
    return phi(z); 
}

// Helper function to calculate raw score for a single Competency (Africa Logic)
function calculateAfricaCompetencyMetrics(competencyName, qEntries) {
    const relevantEntries = qEntries.filter(q => q.competency === competencyName);
    const phiValues = relevantEntries.map(e => e.phi);
    const totalScore = phiValues.reduce((s, x) => s + (Number(x) || 0), 0);

    const countMap = {
        "Game Awareness": 13, "Team work": 9, "Discipline & Ethics": 6,
        "Resilience": 4, "Focus": 3, "Leadership": 6,
        "Communication": 2, "Endurance": 3, "Speed": 3, "Agility": 2
    };
    const MAX_SCORE = countMap[competencyName] || 1;
    const MIN_SCORE = 0;
    
    // Competency score normalized (0..1)
    const denominator = (MAX_SCORE - MIN_SCORE) || 1;
    const competencyScoreRaw = (totalScore - MIN_SCORE) / denominator;

    return { Competency_Score_Raw: competencyScoreRaw };
}

// Helper function to compute raw score for a single Competency (Asia Logic)
function calculateAsiaCompetencyMetrics(probabilities, questions, negatives) {
    const scores = [];
    questions.forEach((qid) => {
        let prob = probabilities[qid] ?? 0;
        if (negatives.includes(qid)) {
            prob = -prob;
        }
        scores.push({ qid, value: Number(prob.toFixed(9)) });
    });

    const total = scores.reduce((sum, x) => sum + x.value, 0);
    const positiveCount = scores.filter((s) => s.value > 0).length;
    const negativeCount = scores.filter((s) => s.value < 0).length * -1;
    
    // Competency Score (0-1, raw numeric value)
    const denominator = positiveCount - negativeCount;
    const competencyScoreRaw = denominator !== 0 ? 1 - (positiveCount - total) / denominator : 0;
    
    return { Competency_Score_Raw: competencyScoreRaw };
}

// --- ASIA MAPPING & WEIGHTS (From your previous response's getAsiaBehaviorScore) ---
const ASIA_CONFIG = {
    // Competency/Trait definition map
    categoryMaps: {
        GA: { name: "game_awareness", questions: [1, 20, 22, 26, 28, 30, 31, 32, 33], negatives: [26, 28, 30, 33] },
        TW: { name: "team_work", questions: [7, 18, 21, 25, 27, 29], negatives: [18] },
        DE: { name: "discipline_ethics", questions: [8, 15, 19, 23], negatives: [] },
        RE: { name: "resilience", questions: [2, 9, 16], negatives: [2] },
        FO: { name: "focus", questions: [3, 10], negatives: [] },
        LE: { name: "leadership", questions: [4, 11, 24], negatives: [11, 24] },
        CO: { name: "communication", questions: [12], negatives: [] },
        EN: { name: "endurance", questions: [5, 13, 17], negatives: [5] },
        SP: { name: "speed", questions: [6, 14], negatives: [] }
    },
    // Weights for Overall Score Calculation
    traitWeights: {
        game_awareness: 0.130851880276285,
        team_work: 0.0709900230237913,
        discipline_ethics: 0.148695318495779,
        resilience: 0.127782041442824,
        focus: 0.0997697620874904,
        leadership: 0.153300076745971,
        communication: 0.0514198004604758,
        endurance: 0.082118189,
        speed: 0.13507291
    }
};

// --- AFRICA MAPPING & WEIGHTS (From your existing code) ---
const AFRICA_CONFIG = {
    mappingMap: new Map([
        [1, 'Game Awareness'], [11, 'Game Awareness'], [21, 'Game Awareness'], [29, 'Game Awareness'], [34, 'Game Awareness'], [38, 'Game Awareness'], [42, 'Game Awareness'], [44, 'Game Awareness'], [46, 'Game Awareness'], [48, 'Game Awareness'], [49, 'Game Awareness'], [50, 'Game Awareness'], [51, 'Game Awareness'],
        [2, 'Team work'], [12, 'Team work'], [22, 'Team work'], [30, 'Team work'], [35, 'Team work'], [39, 'Team work'], [43, 'Team work'], [45, 'Team work'], [47, 'Team work'],
        [3, 'Discipline & Ethics'], [13, 'Discipline & Ethics'], [23, 'Discipline & Ethics'], [31, 'Discipline & Ethics'], [36, 'Discipline & Ethics'], [40, 'Discipline & Ethics'],
        [4, 'Resilience'], [14, 'Resilience'], [24, 'Resilience'], [32, 'Resilience'],
        [5, 'Focus'], [15, 'Focus'], [25, 'Focus'],
        [6, 'Leadership'], [16, 'Leadership'], [26, 'Leadership'], [33, 'Leadership'], [37, 'Leadership'], [41, 'Leadership'],
        [7, 'Communication'], [17, 'Communication'],
        [8, 'Endurance'], [18, 'Endurance'], [27, 'Endurance'],
        [9, 'Speed'], [19, 'Speed'], [28, 'Speed'],
        [10, 'Agility'], [20, 'Agility']
    ]),
    competencyList: [
        "Game Awareness", "Team work", "Discipline & Ethics", "Resilience",
        "Focus", "Leadership", "Communication", "Endurance", "Speed", "Agility"
    ],
    WEIGHTS: {
        "Game Awareness": 0.652, "Team work": 0.707, "Discipline & Ethics": 0.738,
        "Resilience": 0.633, "Focus": 0.439, "Leadership": 0.620,
        "Communication": 0.597, "Endurance": 0.592, "Speed": 0.645, "Agility": 0.760
    },
    TOTAL_WEIGHT: 6.383
};

// Function for Africa Logic (Optimized from your previous function)
async function calculateAfricaScore(playerId, answersRow, statsMap) {
    const { mappingMap, competencyList, WEIGHTS, TOTAL_WEIGHT } = AFRICA_CONFIG;
    
    const questions = [];
    for (let i = 1; i <= 51; i++) {
        const ansValue = Number(answersRow[`q${i}`]); 
        if (!Number.isFinite(ansValue)) continue;

        const stat = statsMap.get(i);
        const competency = mappingMap.get(i); 
        
        if (!stat || !competency) continue;
        
        const mean = stat.mean;
        const sd = stat.sd;
        let z = (sd === 0 || !Number.isFinite(sd)) ? 0 : (ansValue - mean) / sd; 
        const pTwoSided = phi(Math.abs(z));

        questions.push({
            q_id: i,
            competency: competency, 
            phi: pTwoSided, 
        });
    }
    
    const rawCompetencyScores = {};
    for (const name of competencyList) {
        const metrics = calculateAfricaCompetencyMetrics(name, questions);
        rawCompetencyScores[name] = metrics.Competency_Score_Raw;
    }
    
    let overallScoreSum = 0;
    for (const name of competencyList) {
        const scoreDecimal = rawCompetencyScores[name] || 0;
        const weight = WEIGHTS[name];
        overallScoreSum += scoreDecimal * (weight / TOTAL_WEIGHT);
    }
    
    return Number(overallScoreSum.toFixed(4)) * 100;
}

// Function for Asia Logic (From your previous getAsiaBehaviorScore logic)
async function calculateAsiaScore(playerId, answersRow, statsRows) {
    const { categoryMaps, traitWeights } = ASIA_CONFIG;
    
    const probabilities = {};
    for (const row of statsRows) {
        const qid = row.q_id;
        const answer = Number(answersRow[`q${qid}`]);
        const mean = parseFloat(row.mean);
        const sd = parseFloat(row.sd);
        
        if (!Number.isFinite(answer) || !Number.isFinite(mean) || !Number.isFinite(sd)) continue;
        
        let p;
        if (sd === 0) {
            p = 0.5;
        } else {
            const z = (answer - mean) / sd;
            p = normalCdf(z); // Using normalCdf
        }
        let prob = p;
        if (answer < mean) {
            prob = 1 - prob;
        }
        probabilities[qid] = Number(prob.toFixed(12));
    }
    
    let playerBehaviorOverallScoreRaw = 0;
    for (const [traitKey, map] of Object.entries(categoryMaps)) {
        const result = calculateAsiaCompetencyMetrics(probabilities, map.questions, map.negatives);
        const rawScore = result.Competency_Score_Raw || 0;
        const weight = traitWeights[map.name];
        
        playerBehaviorOverallScoreRaw += rawScore * weight;
    }

    return Number((playerBehaviorOverallScoreRaw * 100).toFixed(3));
}

// 3. Overall Score Calculation Logic (UPDATED)
async function calculatePlayerOverallScore(playerId, coachRegion) {
    try {
        // Region check
        const isAsia = coachRegion.toLowerCase() === "asia";
        console.log(`Calculating score for player ${playerId}, region: ${coachRegion}, isAsia: ${isAsia}`);

        // --- DYNAMIC TABLE SELECTION ---
        const answersTable = isAsia ? "asia_behavior_answers" : "africa_behavior_answers";
        const statsTable = isAsia ? "asia_question_stats" : "africa_question_stats";

        console.log(`Using tables: ${answersTable}, ${statsTable} for player ${playerId}`);

        // 1) Fetch latest answers row for player
        const [answersRows] = await pool.query(
            `SELECT * FROM ${answersTable} WHERE player_id=? ORDER BY created_at DESC LIMIT 1`,
            [playerId]
        );
        if (!answersRows.length) {
            console.log(`No answers found in ${answersTable} for player ${playerId}`);
            return null;
        }
        const answersRow = answersRows[0];

        // 2) Fetch all question stats
        const [statsRows] = await pool.query(`SELECT q_id, mean, sd FROM ${statsTable} ORDER BY q_id ASC`);
        
        if (!statsRows.length) {
            console.log(`No stats found in ${statsTable}.`);
            return null;
        }

        // 3) Calculate score based on region
        if (isAsia) {
            // Asia calculation
            const statsMap = new Map(statsRows.map(s => [s.q_id, { mean: Number(s.mean), sd: Number(s.sd) }]));
            return await calculateAsiaScore(playerId, answersRow, statsRows);
        } else {
            // Africa calculation
            const statsMap = new Map(statsRows.map(s => [s.q_id, { mean: Number(s.mean), sd: Number(s.sd) }]));
            return await calculateAfricaScore(playerId, answersRow, statsMap);
        }

    } catch (err) {
        console.error("calculatePlayerOverallScore ERROR for player:", playerId, err);
        return null;
    }
}

export const getCoachPlayers = async (req, res) => {
    try {
        const coachId = req.user.id;
        const coachRegion = req.user.u_region; // <-- COACH REGION YAHAN SE LEIN

        // 1. Fetch all players for the coach
        const [players] = await pool.query(
            `
            SELECT 
                p.p_id,
                p.p_name,
                p.p_age,
                p.p_email,
                p.team_id,
                t.team_name,
                p.p_added_by,
                p.created_at
            FROM players AS p
            LEFT JOIN teams AS t 
                ON p.team_id = t.team_id
            WHERE p.p_added_by = ?
            ORDER BY p.created_at DESC
            `,
            [coachId]
        );

        if (!players || players.length === 0) {
            return res.json([]);
        }

        // 2. Loop through each player to calculate their overall score
        const playersWithScore = [];
        for (const player of players) {
            const playerId = player.p_id;
            
            // Calculate the score for the current player - PASSING COACH REGION
            const overallScore = await calculatePlayerOverallScore(playerId, coachRegion);

            // 3. Construct the final player object with ONLY the required fields
            playersWithScore.push({
                p_id: player.p_id,
                p_name: player.p_name,
                p_age: player.p_age,
                p_email: player.p_email,
                team_id: player.team_id,
                team_name: player.team_name,
                p_added_by: player.p_added_by,
                created_at: player.created_at,
                // Add the overall score (required field)
                Player_Behavior_Overall_Score: overallScore !== null ? overallScore : "N/A"
            });
        }

        // 4. Return the list of players with their overall score
        return res.json(playersWithScore);
    } catch (err) {
        console.error("getCoachPlayers ERROR:", err);
        return res.status(500).json({ message: "Failed to load players and scores" });
    }
};




// POST /api/coach/players
export const createCoachPlayer = async (req, res) => {
  try {
    const coachId = req.user.id;
    const { name, age, email } = req.body;

    if (!name || !name.trim())
      return res.status(400).json({ message: "Player name is required" });

    if (!email || !email.trim())
      return res.status(400).json({ message: "Player email is required" });

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanAge = age ? Number(age) : null;

    const [result] = await pool.query(
      `
      INSERT INTO players (p_name, p_age, p_email, p_added_by)
      VALUES (?, ?, ?, ?)
      `,
      [cleanName, cleanAge, cleanEmail, coachId]
    );

    const [rows] = await pool.query(
      `
      SELECT p_id, p_name, p_age, p_email, p_added_by, created_at
      FROM players
      WHERE p_id = ?
      `,
      [result.insertId]
    );

    return res.status(201).json(rows[0]);

  } catch (err) {
    console.error("Error creating player:", err);
    return res.status(500).json({ message: "Failed to create player" });
  }
};

// PUT /api/coach/players/:id
export const updateCoachPlayer = async (req, res) => {
  try {
    const coachId = req.user.id;
    const { id } = req.params;
    const { name, age, email } = req.body;

    if (!name || !name.trim())
      return res.status(400).json({ message: "Player name is required" });

    if (!email || !email.trim())
      return res.status(400).json({ message: "Player email is required" });

    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanAge = age ? Number(age) : null;

    const [result] = await pool.query(
      `
      UPDATE players
      SET p_name = ?, p_age = ?, p_email = ?
      WHERE p_id = ? AND p_added_by = ?
      `,
      [cleanName, cleanAge, cleanEmail, id, coachId]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Player not found" });

    const [rows] = await pool.query(
      `SELECT p_id, p_name, p_age, p_email, p_added_by, created_at FROM players WHERE p_id = ?`,
      [id]
    );

    return res.json(rows[0]);

  } catch (err) {
    console.error("Error updating player:", err);
    return res.status(500).json({ message: "Failed to update player" });
  }
};

// DELETE /api/coach/players/:id
export const deleteCoachPlayer = async (req, res) => {
  try {
    const coachId = req.user.id;
    const { id } = req.params;

    const [result] = await pool.query(
      `
      DELETE FROM players
      WHERE p_id = ? AND p_added_by = ?
      `,
      [id, coachId]
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Player not found or not owned by this coach" });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("Error deleting player:", err);
    return res.status(500).json({ message: "Failed to delete player" });
  }
};


export const getPlayerProfileForCoach = async (req, res) => {
  try {
    const playerId = req.params.playerId;

    // 1. GET PLAYER + TEAM NAME + COACH NAME
    const [playerRows] = await pool.query(
      `SELECT 
          p.*, 
          u.u_name AS coach_name,
          t.team_name
       FROM players p
       LEFT JOIN users u ON u.u_id = p.p_added_by
       LEFT JOIN teams t ON t.team_id = p.team_id   -- <-- ADDED
       WHERE p.p_id = ?`,
      [playerId]
    );

    if (playerRows.length === 0) {
      return res.status(404).json({ message: "Player not found" });
    }

    const player = playerRows[0];

    // 2. Calculate Behavior Score
    const overallScore = await calculatePlayerOverallScore(playerId);

    // 3. Return final response
    return res.json({
      player: {
        ...player,
        Player_Behavior_Overall_Score:
          overallScore !== null ? overallScore : "N/A",
      },
    });

  } catch (err) {
    console.log("getPlayerProfileForCoach ERROR:", err);
    return res.status(500).json({ message: "Failed to load profile and score" });
  }
};


export const createTeam = async (req, res) => {
  try {
    const { team_name } = req.body;
    const coachId = req.user.id; // JIS COACH NE TEAM BANAI

    if (!team_name || !team_name.trim()) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const cleanName = team_name.trim();

    const [result] = await pool.query(
      `INSERT INTO teams (team_name, coach_id) VALUES (?, ?)`,
      [cleanName, coachId]
    );

    return res.status(201).json({
      success: true,
      team_id: result.insertId,
    });

  } catch (err) {
    console.error("createTeam ERROR:", err);
    return res.status(500).json({ message: "Failed to create team" });
  }
};


export const assignPlayersToTeam = async (req, res) => {
  try {
    const { team_id, player_ids } = req.body;
    const coachId = req.user.id;

    if (!team_id) return res.status(400).json({ message: "team_id required" });
    if (!Array.isArray(player_ids) || player_ids.length === 0)
      return res.status(400).json({ message: "player_ids required" });

    // Check team belongs to this coach
    const [team] = await pool.query(
      `SELECT * FROM teams WHERE team_id = ? AND coach_id = ?`,
      [team_id, coachId]
    );

    if (team.length === 0)
      return res.status(403).json({ message: "Unauthorized team access" });

    // Assign players
    const [result] = await pool.query(
      `UPDATE players SET team_id = ? WHERE p_id IN (?) AND p_added_by = ?`,
      [team_id, player_ids, coachId]
    );

    return res.json({
      success: true,
      assigned_count: result.affectedRows,
    });

  } catch (err) {
    console.error("assignPlayersToTeam ERROR:", err);
    return res.status(500).json({ message: "Failed to assign players" });
  }
};

export const unassignPlayersFromTeam = async (req, res) => {
  try {
    const { player_ids } = req.body;

    if (!Array.isArray(player_ids) || player_ids.length === 0) {
      return res.status(400).json({ message: "player_ids required" });
    }

    // Direct unassign — NO coach/admin validation
    const [result] = await pool.query(
      `UPDATE players SET team_id = NULL WHERE p_id IN (?)`,
      [player_ids]
    );

    return res.json({
      success: true,
      unassigned_count: result.affectedRows,
    });

  } catch (err) {
    console.error("unassignPlayersFromTeam ERROR:", err);
    return res.status(500).json({ message: "Failed to unassign players" });
  }
};



export const getCoachTeams = async (req, res) => {
  try {
    const coachId = req.user.id;

    const [teams] = await pool.query(`
      SELECT 
          t.team_id,
          t.team_name,
          t.coach_id,
          t.created_at,
          COALESCE(SUM(ps.matches), 0) AS total_matches
      FROM teams t
      LEFT JOIN players p ON p.team_id = t.team_id
      LEFT JOIN player_stats ps ON ps.player_id = p.p_id
      WHERE t.coach_id = ?
      GROUP BY t.team_id
      ORDER BY t.created_at DESC
    `, [coachId]);

    return res.json({ success: true, data: teams });

  } catch (error) {
    console.error("getCoachTeams ERROR:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};



// export const getTeamPlayers = async (req, res) => {
//   try {
//     const coachId = req.user.id;
//     const { team_id } = req.params;

//     // Check team belongs to this coach
//     const [team] = await pool.query(
//       `SELECT * FROM teams WHERE team_id = ? AND coach_id = ?`,
//       [team_id, coachId]
//     );

//     if (team.length === 0) {
//       return res.status(403).json({ message: "Unauthorized or invalid team" });
//     }

//     // Fetch team players
//     const [players] = await pool.query(
//       `SELECT p_id, p_name, p_email, p_age, team_id 
//        FROM players 
//        WHERE team_id = ?`,
//       [team_id]
//     );

//     return res.json(players);

//   } catch (err) {
//     console.error("getTeamPlayers ERROR:", err);
//     return res.status(500).json({ message: "Failed to load team players" });
//   }
// };

export const getTeamPlayers = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role; // ADMIN or COACH
    const { team_id } = req.params;

    // --- If user is COACH → check if team belongs to him ---
    if (userRole === "COACH") {
      const [team] = await pool.query(
        `SELECT * FROM teams WHERE team_id = ? AND coach_id = ?`,
        [team_id, userId]
      );

      if (team.length === 0) {
        return res
          .status(403)
          .json({ message: "Unauthorized: This team does not belong to you." });
      }
    }

    // --- If user is ADMIN → skip checking, admin can access all teams ---

    // Fetch team players
    const [players] = await pool.query(
      `SELECT 
          p_id, 
          p_name, 
          p_email, 
          p_age, 
          team_id 
       FROM players 
       WHERE team_id = ?`,
      [team_id]
    );

    return res.json({
      success: true,
      data: players,
    });

  } catch (err) {
    console.error("getTeamPlayers ERROR:", err);
    return res.status(500).json({ message: "Failed to load team players" });
  }
};


// export const sendEvaluationToPlayer = async (req, res) => {
//   try {
//     const coachRegion = req.user.u_region;
//     const coachId = req.user.id;
//     const { player_id } = req.body;

//     if (!player_id)
//       return res.status(400).json({ message: "player_id required" });

//     // Get player info
//     const [rows] = await pool.query(
//       `SELECT p_email, p_name FROM players WHERE p_id = ? AND p_added_by = ?`,
//       [player_id, coachId]
//     );

//     if (rows.length === 0)
//       return res.status(404).json({ message: "Player not found" });

//     const player = rows[0];

//     // Region wise evaluation link
//     const evalLink =
//       coachRegion === "asia"
//         ? `${process.env.BASE_FRONTEND_URL}/coach/evaluations/asia?player=${player_id}`
//         : `${process.env.BASE_FRONTEND_URL}/coach/evaluations/africa?player=${player_id}`;

//     // ========== SEND EMAIL ==========
//     await mailer.sendMail({
//       from: `"Football Evaluation" <${process.env.SMTP_USER}>`,
//       to: player.p_email,
//       subject: "Your Football Evaluation Link",
//       html: `
//         <p>Hi <strong>${player.p_name}</strong>,</p>
//         <p>Your coach has sent you an evaluation form. Please complete it using the link below:</p>
        
//         <p>
//           <a href="${evalLink}" 
//              style="padding:10px 20px;background:#007bff;color:#fff;text-decoration:none;border-radius:5px;">
//              Start Evaluation
//           </a>
//         </p>

//         <br/>
//         <p>If button doesn't work, open this link:</p>
//         <p>${evalLink}</p>

//         <br/>
//         <p>Regards,<br/>Football Club</p>
//       `,
//     });

//     return res.json({
//       success: true,
//       message: "Evaluation email sent successfully",
//       email: player.p_email,
//       link: evalLink
//     });

//   } catch (err) {
//     console.error("sendEvaluationToPlayer ERROR:", err);
//     return res.status(500).json({ message: "Failed to send evaluation" });
//   }
// };

// ========================================
// BULK PLAYER EVALUATION (new)
// ========================================


export const sendEvaluationToPlayer = async (req, res) => {
  try {
    const coachRegion = req.user.u_region;
    const coachId = req.user.id;
    const { player_id } = req.body;

    if (!player_id)
      return res.status(400).json({ message: "player_id required" });

    // Get player info
    const [rows] = await pool.query(
      `SELECT p_email, p_name FROM players WHERE p_id = ? AND p_added_by = ?`,
      [player_id, coachId]
    );

    if (rows.length === 0)
      return res.status(404).json({ message: "Player not found" });

    const player = rows[0];

    // ---------- UNIQUE TOKEN ----------
    const token = crypto.randomBytes(32).toString("hex");

    // Save token in DB (table: evaluation_tokens)
    await pool.query(
      `INSERT INTO evaluation_tokens (player_id, token, is_used) VALUES (?, ?, 0)`,
      [player_id, token]
    );

    // Region wise link with token
    const evalLink =
      coachRegion === "asia"
        ? `${process.env.BASE_FRONTEND_URL}/coach/evaluations/asia?player=${player_id}&token=${token}`
        : `${process.env.BASE_FRONTEND_URL}/coach/evaluations/africa?player=${player_id}&token=${token}`;

    // ========== SEND EMAIL ==========
    await mailer.sendMail({
      from: `"Football Evaluation" <${process.env.SMTP_USER}>`,
      to: player.p_email,
      subject: "Your Football Evaluation Link",
      html: `
        <p>Hi <strong>${player.p_name}</strong>,</p>
        <p>Your coach has sent you an evaluation form. Please complete it using the link below:</p>
        
        <p>
          <a href="${evalLink}" 
             style="padding:10px 20px;background:#007bff;color:#fff;text-decoration:none;border-radius:5px;">
             Start Evaluation
          </a>
        </p>

        <br />
        <p>If button doesn't work, use this link:</p>
        <p>${evalLink}</p>
      `,
    });

    return res.json({
      success: true,
      message: "Evaluation email sent successfully",
      email: player.p_email,
      link: evalLink
    });

  } catch (err) {
    console.error("sendEvaluationToPlayer ERROR:", err);
    return res.status(500).json({ message: "Failed to send evaluation" });
  }
};


export const verifyEvaluationToken = async (req, res) => {
  const { player, token } = req.query;

  const [[row]] = await pool.query(
    "SELECT * FROM evaluation_tokens WHERE player_id = ? AND token = ?",
    [player, token]
  );

  if (!row) {
    return res.status(400).json({ message: "Invalid or expired link" });
  }

  if (row.is_used === 1) {
    return res.status(400).json({ message: "This link has already been used" });
  }

  // Token is valid → allow opening form
  return res.json({ success: true, message: "Token valid" });
};



// export const sendBulkEvaluation = async (req, res) => {
//   try {
//     const coachRegion = req.user.u_region;
//     const coachId = req.user.id;
//     const { player_ids } = req.body;

//     // Validation
//     if (!player_ids || !Array.isArray(player_ids) || player_ids.length === 0) {
//       return res.status(400).json({ message: "player_ids array required" });
//     }

//     // Get all players info
//     const [players] = await pool.query(
//       `SELECT p_id, p_email, p_name 
//        FROM players 
//        WHERE p_id IN (?) AND p_added_by = ?`,
//       [player_ids, coachId]
//     );

//     if (players.length === 0) {
//       return res.status(404).json({ message: "No players found" });
//     }

//     // Send emails to all players
//     const emailResults = [];
//     const failedEmails = [];

//     for (const player of players) {
//       try {
//         // Region wise evaluation link
//         const evalLink =
//           coachRegion === "asia"
//             ? `${process.env.BASE_FRONTEND_URL}/coach/evaluations/asia?player=${player.p_id}`
//             : `${process.env.BASE_FRONTEND_URL}/coach/evaluations/africa?player=${player.p_id}`;

//         // Send email
//         await mailer.sendMail({
//           from: `"Football Evaluation" <${process.env.SMTP_USER}>`,
//           to: player.p_email,
//           subject: "Your Football Evaluation Link",
//           html: `
//             <p>Hi <strong>${player.p_name}</strong>,</p>
//             <p>Your coach has sent you an evaluation form. Please complete it using the link below:</p>
            
//             <p>
//               <a href="${evalLink}" 
//                  style="padding:10px 20px;background:#007bff;color:#fff;text-decoration:none;border-radius:5px;">
//                  Start Evaluation
//               </a>
//             </p>

//             <br/>
//             <p>If button doesn't work, open this link:</p>
//             <p>${evalLink}</p>

//             <br/>
//             <p>Regards,<br/>Football Club</p>
//           `,
//         });

//         emailResults.push({
//           player_id: player.p_id,
//           name: player.p_name,
//           email: player.p_email,
//           status: "sent",
//         });
//       } catch (emailError) {
//         console.error(`Failed to send email to ${player.p_email}:`, emailError);
//         failedEmails.push({
//           player_id: player.p_id,
//           name: player.p_name,
//           email: player.p_email,
//           status: "failed",
//           error: emailError.message,
//         });
//       }
//     }

//     return res.json({
//       success: true,
//       message: `Evaluation emails sent to ${emailResults.length} out of ${players.length} players`,
//       total_players: players.length,
//       sent: emailResults.length,
//       failed: failedEmails.length,
//       results: emailResults,
//       failed_emails: failedEmails,
//     });

//   } catch (err) {
//     console.error("sendBulkEvaluation ERROR:", err);
//     return res.status(500).json({ message: "Failed to send bulk evaluations" });
//   }
// };


export const sendBulkEvaluation = async (req, res) => {
  try {
    const coachRegion = req.user.u_region;
    const coachId = req.user.id;
    const { player_ids } = req.body;

    if (!player_ids || !Array.isArray(player_ids) || player_ids.length === 0) {
      return res.status(400).json({ message: "player_ids array required" });
    }

    // Fetch players
    const [players] = await pool.query(
      `SELECT p_id, p_email, p_name 
       FROM players 
       WHERE p_id IN (?) AND p_added_by = ?`,
      [player_ids, coachId]
    );

    if (players.length === 0) {
      return res.status(404).json({ message: "No players found" });
    }

    const results = [];
    const failed = [];

    for (const player of players) {
      try {
        // ========== TOKEN ==========
        const token = crypto.randomBytes(32).toString("hex");

        // Save token (force invalidate old tokens)
        await pool.query(
          `UPDATE evaluation_tokens SET is_used = 1 WHERE player_id = ?`,
          [player.p_id]
        );

        await pool.query(
          `INSERT INTO evaluation_tokens (player_id, token, is_used) VALUES (?, ?, 0)`,
          [player.p_id, token]
        );

        // ========== LINK ==========
        const evalLink =
          coachRegion === "asia"
            ? `${process.env.BASE_FRONTEND_URL}/coach/evaluations/asia?player=${player.p_id}&token=${token}`
            : `${process.env.BASE_FRONTEND_URL}/coach/evaluations/africa?player=${player.p_id}&token=${token}`;

        // ========== SEND EMAIL ==========
        const emailBody = `
          <p>Hi <strong>${player.p_name}</strong>,</p>
          <p>Your coach has sent you an evaluation form. Please complete it using the link below:</p>
          
          <p>
            <a href="${evalLink}" 
              style="padding:10px 20px;background:#007bff;color:#fff;text-decoration:none;border-radius:5px;">
              Start Evaluation
            </a>
          </p>

          <br/>
          <p>If button doesn't work, open this link:</p>
          <p>${evalLink}</p>

          <br/>
          <p>Regards,<br/>Football Club</p>
        `;

        await new Promise((resolve, reject) => {
          mailer.sendMail(
            {
              from: `"Football Evaluation" <${process.env.SMTP_USER}>`,
              to: player.p_email,
              subject: "Your Football Evaluation Link",
              html: emailBody,
            },
            (err, info) => {
              if (err) reject(err);
              else resolve(info);
            }
          );
        });

        results.push({
          player_id: player.p_id,
          email: player.p_email,
          status: "sent",
        });

        await new Promise(resolve => setTimeout(resolve, 500)); // reduce Gmail blocking

      } catch (e) {
        failed.push({
          player_id: player.p_id,
          email: player.p_email,
          status: "failed",
          error: e.message,
        });
      }
    }

    return res.json({
      success: true,
      message: "Bulk emails processed",
      sent: results.length,
      failed: failed.length,
      results,
      failed,
    });

  } catch (error) {
    console.error("sendBulkEvaluation ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getUnassignedPlayers = async (req, res) => {
  try {
    const coachId = req.user.id;

    const [rows] = await pool.query(
      `SELECT p_id, p_name, p_email, p_age 
       FROM players
       WHERE (team_id IS NULL OR team_id = 0)
       AND p_added_by = ?`,
      [coachId]
    );

    return res.json(rows);

  } catch (err) {
    console.error("getUnassignedPlayers ERROR:", err);
    return res.status(500).json({ message: "Failed to load unassigned players" });
  }
};

export const getAllCoachTeamsForAdmin = async (req, res) => {
  try {
    const [teams] = await pool.query(`
      SELECT 
          t.team_id,
          t.team_name,
          t.coach_id,
          u.u_name AS coach_name,
          u.u_username AS coach_username,
          u.u_email AS coach_email,
          t.created_at,
          COALESCE(SUM(ps.matches), 0) AS total_matches
      FROM teams t
      LEFT JOIN users u ON u.u_id = t.coach_id  -- Coach details
      LEFT JOIN players p ON p.team_id = t.team_id
      LEFT JOIN player_stats ps ON ps.player_id = p.p_id
      GROUP BY t.team_id
      ORDER BY t.created_at DESC
    `);

    return res.json({
      success: true,
      data: teams
    });

  } catch (error) {
    console.error("getAllCoachTeamsForAdmin ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};


