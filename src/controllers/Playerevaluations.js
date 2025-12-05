import { pool } from "../../config/db.js";

export const publicGetEvaluationQuestions = async (req, res) => {
  try {
    const region = req.query.region;

    if (!region || !["asia", "africa"].includes(region)) {
      return res.status(400).json({ message: "Invalid or missing region" });
    }

    const tableName = region === "asia" ? "asia_questions" : "africa_questions";

    const [questions] = await pool.query(
      `SELECT q_id, q_order, q_text FROM ${tableName} ORDER BY q_order ASC`
    );

    const [choices] = await pool.query(
      "SELECT choice_value, choice_text FROM choices ORDER BY choice_value ASC"
    );

    return res.json({
      region,
      questions,
      choices,
    });

  } catch (err) {
    console.error("publicGetEvaluationQuestions ERROR:", err);
    return res.status(500).json({ message: "Failed to load questions" });
  }
};


// export const publicSubmitEvaluation = async (req, res) => {
//   try {
//     const { player_id, region, answers } = req.body;

//     if (!player_id || !region || !answers) {
//       return res.status(400).json({ message: "Missing required fields" });
//     }

//     const isAsia = region === "asia";
//     const totalQuestions = isAsia ? 33 : 51;

//     const tableName = isAsia
//       ? "asia_behavior_answers"
//       : "africa_behavior_answers";

//     // Validate answers
//     for (let i = 1; i <= totalQuestions; i++) {
//       if (answers[i] === undefined || answers[i] === null) {
//         return res.status(400).json({ message: `Missing answer for question ${i}` });
//       }
//     }

//     // Duplicate check: SAME PLAYER should not submit twice
//     const [exists] = await pool.query(
//       `SELECT id FROM ${tableName} WHERE player_id = ? LIMIT 1`,
//       [player_id]
//     );

//     if (exists.length > 0) {
//       return res.status(400).json({
//         message: "This player has already submitted an evaluation."
//       });
//     }

//     // Calculate total score
//     let totalScore = 0;
//     for (let i = 1; i <= totalQuestions; i++) {
//       totalScore += Number(answers[i]);
//     }

//     // Build dynamic insert
//     const columns = ["player_id", "created_by"];
//     const values = [player_id, player_id]; // created_by = player_id

//     for (let i = 1; i <= totalQuestions; i++) {
//       columns.push(`q${i}`);
//       values.push(answers[i]);
//     }

//     columns.push("total_score");
//     values.push(totalScore);

//     const placeholders = columns.map(() => "?").join(", ");

//     await pool.query(
//       `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`,
//       values
//     );

//     return res.json({
//       success: true,
//       message: "Evaluation submitted successfully",
//       total_score: totalScore,
//       region
//     });

//   } catch (err) {
//     console.error("publicSubmitEvaluation ERROR:", err);
//     return res.status(500).json({ message: "Failed to submit evaluation" });
//   }
// };


export const publicSubmitEvaluation = async (req, res) => {
  try {
    const { player_id, region, answers, token } = req.body;

    if (!player_id || !region || !answers || !token) {
      return res.status(400).json({ message: "Missing required fields (token required)" });
    }

    // ======================= TOKEN CHECK ===========================
    const [[tokenRow]] = await pool.query(
      "SELECT * FROM evaluation_tokens WHERE player_id = ? AND token = ?",
      [player_id, token]
    );

    if (!tokenRow) {
      return res.status(400).json({ message: "Invalid or expired link token" });
    }

    if (tokenRow.is_used === 1) {
      return res.status(400).json({ message: "This link has already been used" });
    }
    // ===============================================================

    const isAsia = region === "asia";
    const totalQuestions = isAsia ? 33 : 51;

    const tableName = isAsia
      ? "asia_behavior_answers"
      : "africa_behavior_answers";

    // Validate answers
    for (let i = 1; i <= totalQuestions; i++) {
      if (answers[i] === undefined || answers[i] === null) {
        return res.status(400).json({ message: `Missing answer for question ${i}` });
      }
    }

    // Duplicate check: SAME PLAYER should not submit twice
    const [exists] = await pool.query(
      `SELECT id FROM ${tableName} WHERE player_id = ? LIMIT 1`,
      [player_id]
    );

    if (exists.length > 0) {
      return res.status(400).json({
        message: "This player has already submitted an evaluation."
      });
    }

    // Calculate total score
    let totalScore = 0;
    for (let i = 1; i <= totalQuestions; i++) {
      totalScore += Number(answers[i]);
    }

    // Build dynamic insert
    const columns = ["player_id", "created_by"];
    const values = [player_id, player_id];

    for (let i = 1; i <= totalQuestions; i++) {
      columns.push(`q${i}`);
      values.push(answers[i]);
    }

    columns.push("total_score");
    values.push(totalScore);

    const placeholders = columns.map(() => "?").join(", ");

    await pool.query(
      `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`,
      values
    );

    // ======================= EXPIRE TOKEN ===========================
    await pool.query(
      "UPDATE evaluation_tokens SET is_used = 1 WHERE player_id = ? AND token = ?",
      [player_id, token]
    );
    // ==============================================================

    return res.json({
      success: true,
      message: "Evaluation submitted successfully. Link expired.",
      total_score: totalScore,
      region
    });

  } catch (err) {
    console.error("publicSubmitEvaluation ERROR:", err);
    return res.status(500).json({ message: "Failed to submit evaluation" });
  }
};
