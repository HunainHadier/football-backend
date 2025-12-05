// src/controllers/evaluations.controller.js
import { pool } from "../../config/db.js";


// export const getPlayerEvaluations = async (req, res) => {
//   try {
//     const coachRegion = req.user.u_region;
//     const playerId = req.params.id;

//     const answerTable =
//       coachRegion === "asia" ? "asia_behavior_answers" : "africa_behavior_answers";
//     const questionTable =
//       coachRegion === "asia" ? "asia_questions" : "africa_questions";

//     // ================================
//     // 1) PLAYER INFO + TEAM NAME
//     // ================================
//     const [playerRows] = await pool.query(
//       `
//       SELECT 
//         p.p_id,
//         p.p_name,
//         p.team_id,
//         t.team_name
//       FROM players p
//       LEFT JOIN teams t ON p.team_id = t.team_id
//       WHERE p.p_id = ?
//     `,
//       [playerId]
//     );

//     if (playerRows.length === 0) {
//       return res.json({ success: false, message: "Player not found" });
//     }

//     const playerInfo = playerRows[0];

//     // ================================
//     // 2) FETCH QUESTIONS
//     // ================================
//     const [questions] = await pool.query(
//       `SELECT q_id, q_text, q_order FROM ${questionTable} ORDER BY q_order ASC`
//     );

//     if (questions.length === 0) {
//       return res.json({
//         success: true,
//         message: "No questions found for this region.",
//         data: [],
//       });
//     }

//     // ================================
//     // 3) BUILD ANSWER/CHOICE SELECT
//     // ================================
//     const selectColumns = [];
//     const joinClauses = [];

//     for (let i = 1; i <= questions.length; i++) {
//       const qCol = `q${i}`;
//       const alias = `choice_${qCol}`;

//       selectColumns.push(`T1.${qCol} AS ${qCol}`);
//       selectColumns.push(`${alias}.choice_text AS ${qCol}_text`);

//       joinClauses.push(
//         `LEFT JOIN choices AS ${alias} ON T1.${qCol} = ${alias}.choice_value`
//       );
//     }

//     const selectQuery = `
//       SELECT 
//         T1.id, T1.player_id, T1.created_by, T1.total_score, T1.created_at,
//         ${selectColumns.join(", ")}
//       FROM ${answerTable} AS T1
//       ${joinClauses.join(" ")}
//       WHERE T1.player_id = ?
//       ORDER BY T1.created_at DESC
//       LIMIT 1
//     `;

//     const [rawEvaluationData] = await pool.query(selectQuery, [playerId]);

//     if (rawEvaluationData.length === 0) {
//       return res.json({
//         success: true,
//         data: [],
//         message: "No evaluation found for this player.",
//       });
//     }

//     const evaluation = rawEvaluationData[0];

//     // ================================
//     // 4) MERGE QUESTIONS + ANSWERS
//     // ================================
//     const structuredEvaluation = questions.map((q) => {
//       const qKey = `q${q.q_order}`;
//       const qTextKey = `${qKey}_text`;

//       return {
//         q_id: q.q_id,
//         q_text: q.q_text,
//         q_order: q.q_order,
//         answer_value: evaluation[qKey] || null,
//         answer_text: evaluation[qTextKey] || null,
//       };
//     });

//     // ================================
//     // 5) FINAL RESPONSE
//     // ================================
//     res.json({
//       success: true,
//       data: {
//         player_id: playerInfo.p_id,
//         player_name: playerInfo.p_name,
//         team_id: playerInfo.team_id,
//         team_name: playerInfo.team_name,

//         evaluation_id: evaluation.id,
//         created_by: evaluation.created_by,
//         total_score: evaluation.total_score,
//         created_at: evaluation.created_at,

//         behavior_answers: structuredEvaluation,
//       },
//     });
//   } catch (err) {
//     console.error("Error fetching player evaluations:", err);
//     res.status(500).json({ success: false, error: err.message });
//   }
// };


export const getPlayerEvaluations = async (req, res) => {
  try {
    const userRegion = req.user.u_region;   // admin ka NULL hota hai
    const playerId = req.params.id;

    let answerTable;
    let questionTable;

    // ================================
    // IF ADMIN → TRY ASIA FIRST, THEN AFRICA
    // ================================
    if (!userRegion) {
      // Try ASIA
      answerTable = "asia_behavior_answers";
      questionTable = "asia_questions";

      const [checkAsia] = await pool.query(
        `SELECT id FROM ${answerTable} WHERE player_id = ? LIMIT 1`,
        [playerId]
      );

      if (checkAsia.length === 0) {
        // Use AFRICA if no Asia evaluation
        answerTable = "africa_behavior_answers";
        questionTable = "africa_questions";
      }
    } else {
      // ================================
      // NORMAL COACH
      // ================================
      answerTable =
        userRegion === "asia"
          ? "asia_behavior_answers"
          : "africa_behavior_answers";
      questionTable =
        userRegion === "asia" ? "asia_questions" : "africa_questions";
    }

    // ================================
    // 1) PLAYER INFO
    // ================================
    const [playerRows] = await pool.query(
      `
      SELECT 
        p.p_id,
        p.p_name,
        p.team_id,
        t.team_name
      FROM players p
      LEFT JOIN teams t ON p.team_id = t.team_id
      WHERE p.p_id = ?
    `,
      [playerId]
    );

    if (playerRows.length === 0) {
      return res.json({ success: false, message: "Player not found" });
    }

    const playerInfo = playerRows[0];

    // ================================
    // 2) QUESTIONS
    // ================================
    const [questions] = await pool.query(
      `SELECT q_id, q_text, q_order FROM ${questionTable} ORDER BY q_order ASC`
    );

    if (questions.length === 0) {
      return res.json({
        success: true,
        message: "No questions found for this region.",
        data: [],
      });
    }

    // ================================
    // 3) ANSWERS WITH CHOICES
    // ================================
    const selectColumns = [];
    const joinClauses = [];

    for (let i = 1; i <= questions.length; i++) {
      const qCol = `q${i}`;
      const alias = `choice_${qCol}`;

      selectColumns.push(`T1.${qCol} AS ${qCol}`);
      selectColumns.push(`${alias}.choice_text AS ${qCol}_text`);

      joinClauses.push(
        `LEFT JOIN choices AS ${alias} ON T1.${qCol} = ${alias}.choice_value`
      );
    }

    const selectQuery = `
      SELECT 
        T1.id, T1.player_id, T1.created_by, T1.total_score, T1.created_at,
        ${selectColumns.join(", ")}
      FROM ${answerTable} AS T1
      ${joinClauses.join(" ")}
      WHERE T1.player_id = ?
      ORDER BY T1.created_at DESC
      LIMIT 1
    `;

    const [rawEvaluationData] = await pool.query(selectQuery, [playerId]);

    if (rawEvaluationData.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: "No evaluation found for this player.",
      });
    }

    const evaluation = rawEvaluationData[0];

    // ================================
    // 4) FORMAT OUTPUT
    // ================================
    const structuredEvaluation = questions.map((q) => {
      const qKey = `q${q.q_order}`;
      const qTextKey = `${qKey}_text`;

      return {
        q_id: q.q_id,
        q_text: q.q_text,
        q_order: q.q_order,
        answer_value: evaluation[qKey] || null,
        answer_text: evaluation[qTextKey] || null,
      };
    });

    // ================================
    // FINAL RESPONSE
    // ================================
    res.json({
      success: true,
      data: {
        player_id: playerInfo.p_id,
        player_name: playerInfo.p_name,
        team_id: playerInfo.team_id,
        team_name: playerInfo.team_name,

        evaluation_id: evaluation.id,
        created_by: evaluation.created_by,
        total_score: evaluation.total_score,
        created_at: evaluation.created_at,

        behavior_answers: structuredEvaluation,
      },
    });
  } catch (err) {
    console.error("Error fetching player evaluations:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
