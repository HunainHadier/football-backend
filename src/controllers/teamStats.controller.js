import { pool } from "../../config/db.js";

// -----------------------------------------------------
// ADD TEAM STATS
// -----------------------------------------------------
export const addTeamStats = async (req, res) => {
    try {
        const teamId = req.params.teamId;

        const {
            year = new Date().getFullYear(),
            matches = 0,
            goals = 0,
            assists = 0,
            shots = 0,
            shots_on_goal = 0,
            big_chances = 0,
            key_passes = 0,
            tackles = 0,
            pass_completion_pct = 0,
            minutes = 0,
            cautions = 0,
            ejections = 0,
            progressive_carries = 0,
            defensive_actions = 0,
        } = req.body;

        const sql = `
  INSERT INTO team_stats (
    team_id, year, matches, goals, assists,
    shots, shots_on_goal, big_chances, key_passes,
    tackles, pass_completion_pct, minutes, cautions,
    ejections, progressive_carries, defensive_actions, created_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
`;


        const params = [
            teamId, year, matches, goals, assists,
            shots, shots_on_goal, big_chances, key_passes,
            tackles, pass_completion_pct, minutes, cautions,
            ejections, progressive_carries, defensive_actions
        ];

        const [result] = await pool.query(sql, params);

        return res.status(201).json({
            success: true,
            message: "Team stats saved",
            id: result.insertId
        });

    } catch (err) {
        console.error("addTeamStats error:", err);
        return res.status(500).json({ message: "Failed to save team stats" });
    }
};



// LIST TEAM STATS

export const getTeamStatsList = async (req, res) => {
    try {
        const teamId = req.params.teamId;

        const [rows] = await pool.query(
            `
      SELECT * FROM team_stats
      WHERE team_id = ?
      ORDER BY created_at DESC
      `,
            [teamId]
        );

        return res.json({ success: true, stats: rows });

    } catch (err) {
        console.error("getTeamStatsList error:", err);
        return res.status(500).json({ message: "Failed to load team stats list" });
    }
};


// GET SINGLE TEAM STATS

export const getSingleTeamStats = async (req, res) => {
    try {
        const statsId = req.params.statsId;

        const [rows] = await pool.query(
            `SELECT * FROM team_stats WHERE ts_id = ?`,
            [statsId]
        );

        if (!rows.length) {
            return res.status(404).json({ message: "Stats record not found" });
        }

        return res.json({ success: true, stats: rows[0] });

    } catch (err) {
        console.error("getSingleTeamStats error:", err);
        return res.status(500).json({ message: "Failed to load team stats" });
    }
};



export const getTeamStatsAverage = async (req, res) => {
  try {
    const teamId = req.params.teamId;

    // 1) Get latest team stat (same as player logic)
    const [rows] = await pool.query(
      `
      SELECT *
      FROM team_stats
      WHERE team_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [teamId]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        team: null,
        rawTeam: null
      });
    }

    const t = rows[0];
    const tm = t.matches || 0;

    // ⭐ TEAM PER-MATCH AVERAGES (same formula as player API)
    const teamStats = {
      matches: tm,
      goals: tm ? t.goals / tm : 0,
      assists: tm ? t.assists / tm : 0,
      shots: tm ? t.shots / tm : 0,
      shots_on_goal: tm ? t.shots_on_goal / tm : 0,
      big_chances: tm ? t.big_chances / tm : 0,
      key_passes: tm ? t.key_passes / tm : 0,
      tackles: tm ? t.tackles / tm : 0,
      pass_completion_pct: tm ? t.pass_completion_pct / tm : 0,
      minutes: tm ? t.minutes / tm : 0,
      cautions: tm ? t.cautions / tm : 0,
      ejections: tm ? t.ejections / tm : 0,
      progressive_carries: tm ? t.progressive_carries / tm : 0,
      defensive_actions: tm ? t.defensive_actions / tm : 0
    };

    // ⭐ RAW TEAM VALUES
    const rawTeam = { ...t };

    return res.json({
      success: true,
      team: teamStats,
      rawTeam
    });

  } catch (err) {
    console.error("getTeamStatsAverage error:", err);
    return res.status(500).json({ message: "Failed to load team averages" });
  }
};


