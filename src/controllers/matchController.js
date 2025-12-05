import { pool } from "../../config/db.js"; 
import ExcelJS from "exceljs";

// =============================
// 1) GET ALL MATCHES
// =============================
export const getAllMatches = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m_id, m_name, m_venue, m_date, m_team1, m_team2, m_added_by, created_at, updated_at
       FROM matches
       ORDER BY m_date DESC`
    );

    return res.json({
      matches: rows
    });
  } catch (err) {
    console.error("Error loading matches:", err);
    return res.status(500).json({ message: "Failed to load matches" });
  }
};

// =============================
// 2) GET MATCH BY ID
// =============================
export const getMatchById = async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.query(
      "SELECT * FROM matches WHERE m_id = ? LIMIT 1",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Match not found" });
    }

    return res.json({ match: rows[0] });

  } catch (err) {
    console.error("Error fetching match:", err);
    return res.status(500).json({ message: "Failed to fetch match" });
  }
};

// =============================
// 3) ADD NEW MATCH
// =============================
export const addMatch = async (req, res) => {
  try {
    const { m_name, m_venue, m_date, m_team1, m_team2, m_added_by } = req.body;

    const coachId = req.user?.u_id || m_added_by;

    if (!coachId) {
      return res.status(400).json({ message: "Added_by (coach ID) is required" });
    }

    if (!m_name || !m_venue || !m_date || !m_team1 || !m_team2) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const [result] = await pool.query(
      `INSERT INTO matches
       (m_name, m_venue, m_date, m_team1, m_team2, m_added_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [m_name, m_venue, m_date, m_team1, m_team2, coachId]
    );

    return res.status(201).json({
      message: "Match added successfully",
      match_id: result.insertId
    });

  } catch (err) {
    console.error("Error adding match:", err);
    return res.status(500).json({ message: "Failed to add match" });
  }
};


// =============================
// 4) UPDATE MATCH
// =============================
export const updateMatch = async (req, res) => {
  try {
    const { id } = req.params;
    const { m_name, m_venue, m_date, m_team1, m_team2 } = req.body;

    const [result] = await pool.query(
      `UPDATE matches SET 
        m_name = ?, 
        m_venue = ?, 
        m_date = ?, 
        m_team1 = ?, 
        m_team2 = ?, 
        updated_at = NOW()
       WHERE m_id = ?`,
      [m_name, m_venue, m_date, m_team1, m_team2, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Match not found" });
    }

    return res.json({ message: "Match updated successfully" });

  } catch (err) {
    console.error("Error updating match:", err);
    return res.status(500).json({ message: "Failed to update match" });
  }
};


// =============================
// 5) DELETE MATCH
// =============================
export const deleteMatch = async (req, res) => {
  try {
    const { id } = req.params;

    // Check match exists
    const [rows] = await pool.query(
      "SELECT m_id FROM matches WHERE m_id = ? LIMIT 1",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Match not found" });
    }

    // Delete match
    await pool.query("DELETE FROM matches WHERE m_id = ?", [id]);

    return res.json({ message: "Match deleted successfully" });

  } catch (err) {
    console.error("Error deleting match:", err);
    return res.status(500).json({ message: "Failed to delete match" });
  }
};

export const getMatchesByPlayer = async (req, res) => {
  try {
    const { playerId } = req.params;

    const [rows] = await pool.query(
      `SELECT 
          m.m_id,
          m.m_name,
          m.m_date,
          m.m_team1,
          m.m_team2,
          m.m_venue,
          e.e_id AS evaluation_id
       FROM evaluations e
       JOIN matches m 
         ON m.m_id = e.e_match_id
       WHERE e.e_player_id = ?
       ORDER BY m.m_date DESC`,
      [playerId]
    );

    return res.json({ matches: rows });

  } catch (err) {
    console.error("Error loading player matches:", err);
    return res.status(500).json({ message: "Failed to get matches" });
  }
};



export const exportMatchEvaluationExcel = async (req, res) => {
  try {
    const { playerId, matchId } = req.params;

    // 1) FETCH EVALUATION RECORD
    const [evalRows] = await pool.query(
      `SELECT *
       FROM evaluations
       WHERE e_player_id = ? AND e_match_id = ?
       LIMIT 1`,
      [playerId, matchId]
    );

    if (evalRows.length === 0) {
      return res.status(404).json({ message: "No evaluation found for this player & match" });
    }

    const evaluation = evalRows[0];

    // ANSWERS Q1–Q33 TO ARRAY
    const answers = [];
    for (let i = 1; i <= 33; i++) {
      const val = evaluation[`e_question${i}`];
      answers.push(val !== null ? Number(val) : "");
    }

    // 2) EXCEL FILE
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Evaluation");

    // HEADER ROW
    sheet.addRow(["Questions", "Answer", "Mean", "SD", "Z score", "Probability"]);

    const meanSD = [
      [2.799522673, 1.04579347],
      [2.663484487, 1.027785412],
      [2.398568019, 1.067617233],
      [2.651551313, 1.034253645],
      [2.653937947, 1.074743769],
      [2.606205251, 1.03297761],
      [2.797136038, 1.018673219],
      [2.482100239, 1.033662777],
      [2.637231504, 1.056829225],
      [2.443914081, 1.088689108],
      [2.45823389, 1.016630956],
      [2.553699284, 1.030099366],
      [2.193317422, 1.061890173],
      [2.577565632, 1.044728298],
      [2.627684964, 1.064789727],
      [2.422434368, 1.089564591],
      [2.551312649, 1.084522229],
      [2.54176611, 1.007174138],
      [2.68973747, 1.025588722],
      [2.32642487, 0.8050466898],
      [2.279792746, 0.7599725588],
      [2.015544041, 0.717901194],
      [2.284974093, 0.8936303092],
      [2.248704663, 0.816694864],
      [2.347150259, 0.8092593471],
      [2.404145078, 0.836898677],
      [2.352331606, 0.77742045],
      [2.305699482, 0.7871485015],
      [2.616580311, 0.8216692328],
      [2.186528497, 0.7748822965],
      [2.518134715, 0.8665861195],
      [2.14507772, 0.7770732478],
      [2.264248705, 0.7756828848],
    ];

    // 3) FILL ROWS (Q1–Q33)
    for (let i = 0; i < 33; i++) {
      const rowNum = i + 2;

      sheet.addRow([
        `Q${i + 1}`,           // A
        answers[i],            // B
        meanSD[i][0],          // C
        meanSD[i][1],          // D

        // Z-SCORE = (Answer - Mean)/SD
        { formula: `(B${rowNum}-C${rowNum})/D${rowNum}` },

        // PROBABILITY FIXED: WORKS EVERYWHERE
        { formula: `1 - NORMSDIST(ABS(E${rowNum}))` }
      ]);
    }

    // COLUMN WIDTH
    sheet.columns.forEach(col => col.width = 18);

    // DOWNLOAD HEADERS
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=player_${playerId}_match_${matchId}_evaluation.xlsx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error("Export Excel Error:", error);
    res.status(500).json({ message: "Failed to export excel" });
  }
};


