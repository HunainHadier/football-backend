
import { pool } from "../../config/db.js";

// Helper math functions -------------------------------------------------
function erf(x) {
    const sign = x >= 0 ? 1 : -1;
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1.0 / (1.0 + p * Math.abs(x));
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}
function phi(z) {
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
}
// ----------------------------------------------------------------------

// *** Helper Function to handle z-score and phi calculation for any answers row ***
function computePlayerQuestions(answersRow, statsMap, mappingMap) {
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
        // Standard Deviation of 0 check
        let z = (sd === 0 || isNaN(sd)) ? 0 : (ansValue - mean) / sd; 
        const pTwoSided = phi(Math.abs(z));

        questions.push({
            q_id: i,
            competency: competency, 
            z_score: z,
            phi: pTwoSided, 
        });
    }
    return questions;
}
// ----------------------------------------------------------------------


// Function to calculate score and level for a single competency
function calculateCompetencyMetrics(competencyName, qEntries, allQuestionsMap) {
    // 1. Filter relevant questions and calculate Total Score (Sum of Phi)
    const relevantEntries = qEntries.filter(q => q.competency === competencyName);
    const gaPhiValues = relevantEntries.map(e => e.phi);
    const totalScore = gaPhiValues.reduce((s, x) => s + (Number(x) || 0), 0);

    // 2. Dynamic MAX/MIN/Quartile Calculation (Based on 51 questions mapping)
    const countMap = {
        "Game Awareness": 13, 
        "Team work": 9, 
        "Discipline & Ethics": 6,
        "Resilience": 4, 
        "Focus": 3, 
        "Leadership": 6, 
        "Communication": 2, 
        "Endurance": 3, 
        "Speed": 3, 
        "Agility": 2 
    };
    const MAX_SCORE = countMap[competencyName] || 0;
    const MIN_SCORE = 0;

    // Custom logic to match Excel's QUARTILE.INC on range [0, Max]
    const getQuartileValue = (rangeMax, type) => {
        // Hardcoded custom quartiles for Game Awareness (as per user's original logic)
        if (competencyName === "Game Awareness" && rangeMax === 13) {
            if (type === 1) return 3;
            if (type === 2) return 7;
            if (type === 3) return 10;
        }
        // General decimal quartiles
        return (rangeMax * type) / 4;
    };

    const QTR1 = getQuartileValue(MAX_SCORE, 1);
    const QTR2 = getQuartileValue(MAX_SCORE, 2);
    const QTR3 = getQuartileValue(MAX_SCORE, 3);
    const QTR4 = MAX_SCORE; 

    // 3. Level Determination 
    let level = "Level 1";
    let nextLevelThreshold = QTR1; 

    if (totalScore >= QTR3) {
        level = "Level 4";
        nextLevelThreshold = MAX_SCORE; 
    } else if (totalScore >= QTR2) {
        level = "Level 3";
        nextLevelThreshold = QTR3; 
    } else if (totalScore >= QTR1) {
        level = "Level 2";
        nextLevelThreshold = QTR2; 
    } else { // totalScore < QTR1
        level = "Level 1";
        nextLevelThreshold = QTR1; 
    }

    // 4. Competency score normalized (0..100)
    const denominator = (MAX_SCORE - MIN_SCORE) || 1;
    const competency = (totalScore - MIN_SCORE) / denominator;
    const competencyScore = competency * 100; 

    // 5. Margin to next level
    const margin = (nextLevelThreshold - totalScore) / denominator;
    const marginPercent = Math.max(0, margin) * 100; 

    return {
        Competency: competencyName,
        Level: level,
        Competency_Score_Percent: competencyScore, // Now float (for internal use)
        Margin_for_Mastering_Next_Level_Percent: marginPercent, // Now float (for internal use)
        Total_Score_Phi: Math.round(totalScore), 
        MAX_SCORE: MAX_SCORE,
        QTR1: Math.round(QTR1), 
        QTR2: Math.round(QTR2), 
        QTR3: Math.round(QTR3), 
        QTR4: Math.round(QTR4) 
    };
}

// *** Main Controller Function ***
export const getBehaviorScore = async (req, res) => {
    // List of all competencies
    const competencyList = [
        "Game Awareness", "Team work", "Discipline & Ethics", "Resilience", 
        "Focus", "Leadership", "Communication", "Endurance", "Speed", "Agility"
    ];
    
    // Weights are defined here, since they are used for both Player and Team overall score
    const WEIGHTS = {
        "Game Awareness": 0.652, "Team work": 0.707, "Discipline & Ethics": 0.738, 
        "Resilience": 0.633, "Focus": 0.439, "Leadership": 0.620, 
        "Communication": 0.597, "Endurance": 0.592, "Speed": 0.645, "Agility": 0.760
    };
    const TOTAL_WEIGHT = 6.383; // Sum of all weights

    let teamOverallScore = 0.00; // Initialize team overall score
    
    try {
        const playerId = Number(req.params.playerId);
        if (!playerId) return res.status(400).json({ success: false, message: "playerId required" });

        // --- COMMON SETUP (for both individual and team calculation) ---
        
        // Fetch all question stats and map
        const [statsRows] = await pool.query(`SELECT q_id, mean, sd FROM africa_question_stats ORDER BY q_id ASC`);
        const statsMap = new Map(statsRows.map(s => [s.q_id, { mean: Number(s.mean), sd: Number(s.sd) }]));
        
        // HARDCODED QUESTION-TO-COMPETENCY MAPPING
        const mappingMap = new Map([
            // Game Awareness (13 Qs)
            [1, 'Game Awareness'], [11, 'Game Awareness'], [21, 'Game Awareness'], [29, 'Game Awareness'], 
            [34, 'Game Awareness'], [38, 'Game Awareness'], [42, 'Game Awareness'], [44, 'Game Awareness'], 
            [46, 'Game Awareness'], [48, 'Game Awareness'], [49, 'Game Awareness'], [50, 'Game Awareness'],
            [51, 'Game Awareness'],
            // Team work (9 Qs)... and all others
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
        
        // --- INDIVIDUAL PLAYER SCORE CALCULATION ---
        
        // 1) Fetch latest answers row for the individual player
        const [answersRows] = await pool.query(
            `SELECT * FROM africa_behavior_answers WHERE player_id=? ORDER BY created_at DESC LIMIT 1`,
            [playerId]
        );
        if (!answersRows.length) return res.json({ success: false, message: "No answers found for player." });
        const answersRow = answersRows[0];
        
        // 3) Compute per-question z, phi (probability) for the individual player
        const questions = computePlayerQuestions(answersRow, statsMap, mappingMap);

        // 4) Calculate all 10 competencies for the individual player
        const results = [];
        const questionsMap = new Map(questions.map(q => [q.q_id, q]));
        let playerRawScores = {}; // To store the un-formatted % scores

        for (const name of competencyList) {
            const metrics = calculateCompetencyMetrics(name, questions, questionsMap);
            
            // Store raw score for weighted overall calculation
            playerRawScores[name] = metrics.Competency_Score_Percent;

            // Format scores for individual output
            metrics.Competency_Score_Percent = Number(metrics.Competency_Score_Percent.toFixed(2));
            metrics.Margin_for_Mastering_Next_Level_Percent = Number(metrics.Margin_for_Mastering_Next_Level_Percent.toFixed(2));
            results.push(metrics);
        }
        
        // 5) Calculate Player Behavior overall score using weights
        let overallScoreSum = 0;
        for (const name of competencyList) {
            const scoreDecimal = playerRawScores[name] / 100; 
            const weight = WEIGHTS[name];
            overallScoreSum += scoreDecimal * (weight / TOTAL_WEIGHT);
        }
        const finalOverallScore = Number(overallScoreSum.toFixed(4));


        // --- TEAM COMPETENCY AVERAGES CALCULATION ---
        let teamAverageScores = {}; // Result will be stored here
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
                        FROM africa_behavior_answers t1
                        INNER JOIN (
                            SELECT player_id, MAX(created_at) AS latest_date
                            FROM africa_behavior_answers
                            WHERE player_id IN (?)
                            GROUP BY player_id
                        ) t2 ON t1.player_id = t2.player_id AND t1.created_at = t2.latest_date
                        WHERE t1.player_id IN (?)
                    `, [teamPlayerIds, teamPlayerIds]);

                    // Initialise an object to track total scores and valid count for each competency
                    const competencyAveragesTracker = competencyList.reduce((acc, name) => {
                        acc[name] = { totalScore: 0, count: 0 };
                        return acc;
                    }, {});

                    // 4. Calculate total scores for ALL competencies across ALL team players
                    for (const teamPlayerAnswer of allTeamAnswers) {
                        // Compute z/phi for this team player
                        const teamPlayerQuestions = computePlayerQuestions(teamPlayerAnswer, statsMap, mappingMap);
                        
                        // Calculate metrics for ALL 10 competencies for this player
                        for (const name of competencyList) {
                            // Note: Passing null/undefined for allQuestionsMap to prevent error in calculateCompetencyMetrics as it's not strictly needed here.
                            const metrics = calculateCompetencyMetrics(name, teamPlayerQuestions, null);
                            const playerScore = metrics.Competency_Score_Percent;
                            
                            if (!isNaN(playerScore)) {
                                competencyAveragesTracker[name].totalScore += playerScore;
                                competencyAveragesTracker[name].count++;
                            }
                        }
                    }

                    // 5. Calculate final averages (Competency Score Percent)
                    let teamOverallScoreSum = 0;
                    for (const name of competencyList) {
                        const tracker = competencyAveragesTracker[name];
                        if (tracker.count > 0) {
                            let average = tracker.totalScore / tracker.count;
                            teamAverageScores[name] = Number(average.toFixed(2));
                            
                            // 6. Calculate Team Overall Score using the calculated averages and weights
                            const scoreDecimal = average / 100;
                            const weight = WEIGHTS[name];
                            teamOverallScoreSum += scoreDecimal * (weight / TOTAL_WEIGHT);
                        } else {
                            teamAverageScores[name] = 0.00;
                        }
                    }

                    // Final Team Overall Score (normalized, 0-1, then multiplied by 100)
                    teamOverallScore = Number((teamOverallScoreSum).toFixed(4));
                }
            }
        } catch (teamError) {
            console.error("Team Average Calculation Error:", teamError);
            // Non-critical error, proceed with individual score response
        }
        // --- END OF TEAM CALCULATION ---


        // Final Return
        return res.json({
            Player_Behavior_Overall_Score: Number((finalOverallScore * 100).toFixed(2)), 
            Competency_Metrics: results,
            Team_Average_Scores: teamAverageScores,
            // NEW FIELD: Team ka bhi Overall Score aa gaya
            Team_Behavior_Overall_Score: Number((teamOverallScore * 100).toFixed(2))
        });

    } catch (err) {
        console.error("getBehaviorScore main error:", err);
        return res.status(500).json({ success: false, message: "Error generating score" });
    }
};