// src/controllers/adminPlayersController.js
import { pool } from "../../config/db.js"; 

// export const getAllPlayersForAdmin = async (req, res) => {
//   try {
//     const [rows] = await pool.query(
//       `
//       SELECT 
//         p.p_id,
//         p.p_name,
//         p.p_age,
//         p.created_at,
//         p.p_added_by,
//         u.u_name      AS coach_name,
//         u.u_username  AS coach_username
//       FROM players p
//       LEFT JOIN users u ON p.p_added_by = u.u_id
//       ORDER BY p.created_at DESC
//       `
//     );

//     return res.json(rows);
//   } catch (err) {
//     console.error("Error fetching players for admin:", err);
//     return res.status(500).json({ message: "Failed to load players" });
//   }
// };


// ----------------------------------------------------------------------
// 1. Helper Math Functions (Copied from above)
// ----------------------------------------------------------------------
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

// ----------------------------------------------------------------------
// 2. Helper Competency Calculation Function (Copied from above)
// ----------------------------------------------------------------------
function calculateCompetencyMetrics(competencyName, qEntries) {
    const relevantEntries = qEntries.filter(q => q.competency === competencyName);
    const gaPhiValues = relevantEntries.map(e => e.phi);
    const totalScore = gaPhiValues.reduce((s, x) => s + (Number(x) || 0), 0);

    const countMap = {
        "Game Awareness": 13, "Team work": 9, "Discipline & Ethics": 6,
        "Resilience": 4, "Focus": 3, "Leadership": 6,
        "Communication": 2, "Endurance": 3, "Speed": 3, "Agility": 2
    };
    const MAX_SCORE = countMap[competencyName] || 0;
    const MIN_SCORE = 0;

    const getQuartileValue = (rangeMax, type) => {
        if (competencyName === "Game Awareness" && rangeMax === 13) {
            if (type === 1) return 3;
            if (type === 2) return 7;
            if (type === 3) return 10;
        }
        return (rangeMax * type) / 4;
    };
    
    // We only calculate the raw score for overall score computation
    const denominator = (MAX_SCORE - MIN_SCORE) || 1;
    const competencyScoreRaw = (totalScore - MIN_SCORE) / denominator;

    return {
        Competency_Score_Raw: competencyScoreRaw, 
    };
}


// ----------------------------------------------------------------------
// 3. Overall Score Calculation Logic (Copied from above)
// ----------------------------------------------------------------------
async function calculatePlayerOverallScore(playerId) {
    try {
        // HARDCODED MAPPING
        const mappingMap = new Map([
            [1, 'Game Awareness'], [11, 'Game Awareness'], [21, 'Game Awareness'], [29, 'Game Awareness'],
            [34, 'Game Awareness'], [38, 'Game Awareness'], [42, 'Game Awareness'], [44, 'Game Awareness'],
            [46, 'Game Awareness'], [48, 'Game Awareness'], [49, 'Game Awareness'], [50, 'Game Awareness'],
            [51, 'Game Awareness'],
            [2, 'Team work'], [12, 'Team work'], [22, 'Team work'], [30, 'Team work'],
            [35, 'Team work'], [39, 'Team work'], [43, 'Team work'], [45, 'Team work'],
            [47, 'Team work'],
            [3, 'Discipline & Ethics'], [13, 'Discipline & Ethics'], [23, 'Discipline & Ethics'],
            [31, 'Discipline & Ethics'], [36, 'Discipline & Ethics'], [40, 'Discipline & Ethics'],
            [4, 'Resilience'], [14, 'Resilience'], [24, 'Resilience'], [32, 'Resilience'],
            [5, 'Focus'], [15, 'Focus'], [25, 'Focus'],
            [6, 'Leadership'], [16, 'Leadership'], [26, 'Leadership'], [33, 'Leadership'],
            [37, 'Leadership'], [41, 'Leadership'],
            [7, 'Communication'], [17, 'Communication'],
            [8, 'Endurance'], [18, 'Endurance'], [27, 'Endurance'],
            [9, 'Speed'], [19, 'Speed'], [28, 'Speed'],
            [10, 'Agility'], [20, 'Agility']
        ]);
        
        // Competency List and Weights
        const competencyList = [
            "Game Awareness", "Team work", "Discipline & Ethics", "Resilience",
            "Focus", "Leadership", "Communication", "Endurance", "Speed", "Agility"
        ];
        const WEIGHTS = {
            "Game Awareness": 0.652, "Team work": 0.707, "Discipline & Ethics": 0.738,
            "Resilience": 0.633, "Focus": 0.439, "Leadership": 0.620,
            "Communication": 0.597, "Endurance": 0.592, "Speed": 0.645, "Agility": 0.760
        };
        const TOTAL_WEIGHT = 6.383; // Sum of all weights

        // 1) Fetch latest answers row for player
        const [answersRows] = await pool.query(
            `SELECT * FROM africa_behavior_answers WHERE player_id=? ORDER BY created_at DESC LIMIT 1`,
            [playerId]
        );
        if (!answersRows.length) return null; 
        const answersRow = answersRows[0];

        // 2) Fetch all question stats and map
        const [statsRows] = await pool.query(`SELECT q_id, mean, sd FROM africa_question_stats ORDER BY q_id ASC`);
        const statsMap = new Map(statsRows.map(s => [s.q_id, { mean: Number(s.mean), sd: Number(s.sd) }]));
        
        // 3) Compute per-question z, phi (probability)
        const questions = [];
        for (let i = 1; i <= 51; i++) {
            const ans = answersRow[`q${i}`];
            const ansValue = Number(ans); 
            if (isNaN(ansValue) || ans === undefined || ans === null) continue;

            const stat = statsMap.get(i);
            const competency = mappingMap.get(i); 
            
            if (!stat || !competency) continue;
            
            const mean = stat.mean;
            const sd = stat.sd;
            let z = (sd === 0 || isNaN(sd)) ? 0 : (ansValue - mean) / sd; 
            const pTwoSided = phi(Math.abs(z));

            questions.push({ q_id: i, competency: competency, phi: pTwoSided });
        }
        
        // 4) Calculate all 10 competencies raw scores (0-1)
        const rawCompetencyScores = {};
        for (const name of competencyList) {
            const metrics = calculateCompetencyMetrics(name, questions);
            rawCompetencyScores[name] = metrics.Competency_Score_Raw;
        }
        
        // 5) Calculate Player Behavior triat overall score using weights
        let overallScoreSum = 0;
        for (const name of competencyList) {
            const scoreDecimal = rawCompetencyScores[name] || 0; 
            const weight = WEIGHTS[name];
            overallScoreSum += scoreDecimal * (weight / TOTAL_WEIGHT);
        }
        
        // Round to 4 decimal places, then multiply by 100 
        const finalOverallScore = Number(overallScoreSum.toFixed(4)) * 100;

        return finalOverallScore;

    } catch (err) {
        // console.error("calculatePlayerOverallScore ERROR for player:", playerId, err);
        return null; 
    }
}


// ----------------------------------------------------------------------
// 4. Admin API with Score Calculation
// ----------------------------------------------------------------------
export const getAllPlayersForAdmin = async (req, res) => {
    try {
        // 1. Fetch ALL players along with their coach's details
        const [players] = await pool.query(
            `
            SELECT 
                p.p_id,
                p.p_name,
                p.p_age,
                p.created_at,
                p.p_email,       -- p_email is useful for debugging/display
                p.p_added_by,
                u.u_name        AS coach_name,
                u.u_username    AS coach_username,
                t.team_name     AS team_name    -- Team name bhi Admin ke liye useful ho sakta hai
            FROM players p
            LEFT JOIN users u ON p.p_added_by = u.u_id
            LEFT JOIN teams t ON p.team_id = t.team_id
            ORDER BY p.created_at DESC
            `
        );

        if (!players || players.length === 0) {
            return res.json([]);
        }

        // 2. Loop through each player to calculate their overall score
        const playersWithScore = [];
        for (const player of players) {
            const playerId = player.p_id;
            
            // Calculate the score for the current player
            const overallScore = await calculatePlayerOverallScore(playerId);

            // 3. Construct the final player object 
            playersWithScore.push({
                p_id: player.p_id,
                p_name: player.p_name,
                p_age: player.p_age,
                p_email: player.p_email,
                team_name: player.team_name,
                coach_name: player.coach_name,
                coach_username: player.coach_username,
                p_added_by: player.p_added_by,
                created_at: player.created_at,
                // Add the overall score (required field)
                Player_Behavior_Overall_Score: overallScore !== null ? overallScore : "N/A"
            });
        }

        // 4. Return the list of players with their overall score
        return res.json(playersWithScore);
    } catch (err) {
        console.error("getAllPlayersForAdmin ERROR:", err);
        return res.status(500).json({ message: "Failed to load players and scores" });
    }
};


export const getPlayerTraitScores = async (req, res) => {
  try {
    const playerId = Number(req.params.playerId);
    if (!playerId) return res.status(400).json({ message: "Invalid player id" });

    // 1) Player basic info (with coach name)
    const [playerRows] = await pool.query(
      `SELECT p.p_id, p.p_name, p.p_age, p.p_added_by, p.created_at,
              u.u_name as coach_name
       FROM players p
       LEFT JOIN users u ON u.u_id = p.p_added_by
       WHERE p.p_id = ? LIMIT 1`,
      [playerId]
    );
    const player = playerRows[0];
    if (!player) return res.status(404).json({ message: "Player not found" });

    // 2) All evaluations for this player (with question columns)
    // Build SELECT list for q1..q33
    const questionCount = 33;
    const qCols = [];
    for (let i = 1; i <= questionCount; i++) qCols.push(`e.e_question${i}`);
    const selectQCols = qCols.join(", ");

    const [evalRows] = await pool.query(
      `SELECT e.e_id, e.e_added_by, e.e_total_score, e.created_at, ${selectQCols},
              u.u_name AS evaluator_name
       FROM evaluations e
       LEFT JOIN users u ON u.u_id = e.e_added_by
       WHERE e.e_player_id = ?
       ORDER BY e.created_at DESC`,
      [playerId]
    );

    // 3) Weekly trends (last 12 weeks) - avg total score per week
    const [trendRows] = await pool.query(
      `SELECT YEARWEEK(created_at,1) AS yw,
              DATE_FORMAT(MIN(created_at),'%x-Week %v') AS label,
              AVG(e_total_score) AS avgScore
       FROM evaluations
       WHERE e_player_id = ?
       GROUP BY yw
       ORDER BY yw DESC
       LIMIT 12`,
      [playerId]
    );

    // 4) Map questions into traits (example mapping)
    // Adjust this mapping to your actual questionnaire -> trait buckets
    const traitMap = {
      Leadership: [1,2,3,4],
      Teamwork: [5,6,7,8],
      Discipline: [9,10,11,12],
      Confidence: [13,14,15],
      Responsibility: [16,17,18],
      DecisionMaking: [19,20,21,22],
      Communication: [23,24,25],
      WorkRate: [26,27,28],
      BallControl: [29,30],
      Positioning: [31,32,33],
    };

    // 5) Compute per-evaluation question object and aggregated trait averages
    const evaluations = evalRows.map((r) => {
      const questions = {};
      for (let i = 1; i <= questionCount; i++) {
        const key = `q${i}`;
        questions[key] = r[`e_question${i}`] === null ? null : Number(r[`e_question${i}`]);
      }
      return {
        e_id: r.e_id,
        e_added_by: r.e_added_by,
        evaluator_name: r.evaluator_name,
        created_at: r.created_at,
        e_total_score: r.e_total_score === null ? null : Number(r.e_total_score),
        questions,
      };
    });

    // Aggregate trait averages across all evaluations for this player
    const traitsSummary = {};
    for (const [trait, qIdxs] of Object.entries(traitMap)) {
      let sum = 0;
      let count = 0;
      evaluations.forEach((ev) => {
        qIdxs.forEach((qi) => {
          const v = ev.questions[`q${qi}`];
          if (v !== null && v !== undefined) {
            sum += Number(v);
            count++;
          }
        });
      });
      traitsSummary[trait] = count ? Number((sum / count).toFixed(2)) : null;
    }

    // Format trends for the chart (chronological)
    const labels = trendRows.slice().reverse().map(r => r.label);
    const data = trendRows.slice().reverse().map(r => Number(Number(r.avgScore).toFixed(2)));

    return res.json({
      player,
      evaluations,
      traitsSummary,
      trends: { labels, data },
    });
  } catch (err) {
    console.error("getPlayerTraitScores error:", err);
    return res.status(500).json({ message: "Failed to load trait scores" });
  }
};
