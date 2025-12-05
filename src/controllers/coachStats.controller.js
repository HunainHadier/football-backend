// src/controllers/coachStats.controller.js
import { pool } from "../../config/db.js";


// export const addPlayerStats = async (req, res) => {
//   try {
//     const coachId = req.user.id;
//     const playerId = req.params.playerId;

//     // Map frontend → backend fields
//     const {
//       year = new Date().getFullYear(),
//       matches = 0,
//       goals = 0,
//       assists = 0,
//       shots = 0,
//       shots_on_goal = 0,
//       big_chances = 0,
//       key_passes = 0,
//       tackles = 0,

//       // ⭐ FIXED FIELD NAMES ⭐
//       pass_completion: pass_completion_pct = null,   // frontend: pass_completion
//       minutes_played: minutes = 0,                   // frontend: minutes_played

//       cautions = 0,
//       ejections = 0,
//       progressive_carries = 0,
//       defensive_actions = 0,
//     } = req.body || {};

//     const sql = `
//       INSERT INTO player_stats
//       (
//         player_id, year, matches, goals, assists, shots, shots_on_goal,
//         big_chances, key_passes, tackles, pass_completion_pct, minutes,
//         cautions, ejections, progressive_carries, defensive_actions, created_at
//       )
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
//     `;

//     const params = [
//       playerId,
//       year,
//       matches,
//       goals,
//       assists,
//       shots,
//       shots_on_goal,
//       big_chances,
//       key_passes,
//       tackles,
//       pass_completion_pct,
//       minutes,
//       cautions,
//       ejections,
//       progressive_carries,
//       defensive_actions,
//     ];

//     const [result] = await pool.query(sql, params);

//     return res.status(201).json({
//       success: true,
//       message: "Player stats saved",
//       id: result.insertId,
//     });

//   } catch (err) {
//     console.error("addPlayerStats error:", err);
//     return res.status(500).json({ message: "Failed to save stats" });
//   }
// };

export const addPlayerStats = async (req, res) => {
  try {
    const playerId = req.params.playerId;

    const [[player]] = await pool.query(
      "SELECT team_id FROM players WHERE p_id = ?",
      [playerId]
    );

    if (!player || !player.team_id) {
      return res.status(400).json({ message: "Player team not found" });
    }

    const teamId = player.team_id;

    // Incoming fields
    let {
      year = new Date().getFullYear(),
      matches = 0, // team matches
      goals = 0,
      assists = 0,
      shots = 0,
      shots_on_goal = 0,
      big_chances = 0,
      key_passes = 0,
      tackles = 0,
      pass_completion: pass_completion_pct = null,
      minutes_played,
      cautions = 0,
      ejections = 0,
      progressive_carries = 0,
      defensive_actions = 0,
    } = req.body || {};

    // ⭐ minutes = matches × 90
    const minutes = matches * 90;

    // SAVE PLAYER STATS
    await pool.query(
      `
      INSERT INTO player_stats
      (
        player_id, year, matches, goals, assists, shots, shots_on_goal,
        big_chances, key_passes, tackles, pass_completion_pct, minutes,
        cautions, ejections, progressive_carries, defensive_actions, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        playerId, year, matches, goals, assists, shots, shots_on_goal,
        big_chances, key_passes, tackles, pass_completion_pct, minutes,
        cautions, ejections, progressive_carries, defensive_actions
      ]
    );

    // ⭐ TEAM STATS (minutes SUM removed)
    await pool.query(
      `
      INSERT INTO team_stats (
        team_id, year, matches, goals, assists, shots, shots_on_goal,
        big_chances, key_passes, tackles, pass_completion_pct, minutes,
        cautions, ejections, progressive_carries, defensive_actions, created_at
      )
      SELECT 
        p.team_id,
        ps.year,

        -- EXACT matches
        ? AS matches,

        -- SUM other stats
        SUM(ps.goals),
        SUM(ps.assists),
        SUM(ps.shots),
        SUM(ps.shots_on_goal),
        SUM(ps.big_chances),
        SUM(ps.key_passes),
        SUM(ps.tackles),

        AVG(ps.pass_completion_pct),

        -- ⭐ EXACT minutes, no SUM
        (? * 90) AS minutes,

        SUM(ps.cautions),
        SUM(ps.ejections),
        SUM(ps.progressive_carries),
        SUM(ps.defensive_actions),

        NOW()
      FROM players p
      JOIN player_stats ps ON ps.player_id = p.p_id
      WHERE p.team_id = ? AND ps.year = ?
      GROUP BY p.team_id, ps.year
      `,
      [matches, matches, teamId, year]
    );

    return res.status(201).json({
      success: true,
      message: "Player + team stats updated successfully",
    });

  } catch (err) {
    console.error("addPlayerStats error:", err);
    return res.status(500).json({ message: "Failed to save stats" });
  }
};





export const getPlayerStatsList = async (req, res) => {
  try {
    const playerId = req.params.playerId;

    const [rows] = await pool.query(
      `SELECT
         ps_id, player_id, year, matches, goals, assists, shots, shots_on_goal,
         big_chances, key_passes, tackles, pass_completion_pct, minutes,
         cautions, ejections, progressive_carries, defensive_actions,
         created_at
       FROM player_stats
       WHERE player_id = ?
       ORDER BY created_at DESC`,
      [playerId]
    );

    return res.json({ stats: rows });
  } catch (err) {
    console.error("getPlayerStatsList error:", err);
    return res.status(500).json({ message: "Failed to load stats list" });
  }
};


export const getSinglePlayerStats = async (req, res) => {
  try {
    const statsId = req.params.statsId;

    const [rows] = await pool.query(
      `SELECT
         ps_id, player_id, year, matches, goals, assists, shots, shots_on_goal,
         big_chances, key_passes, tackles, pass_completion_pct, minutes,
         cautions, ejections, progressive_carries, defensive_actions,
         created_at
       FROM player_stats
       WHERE ps_id = ?`,
      [statsId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Stats record not found" });
    }

    return res.json({ stats: rows[0] });
  } catch (err) {
    console.error("getSinglePlayerStats error:", err);
    return res.status(500).json({ message: "Failed to load stats" });
  }
};



// export const getPlayerStatsAverage = async (req, res) => {
//   try {
//     const playerId = req.params.playerId;

//     // 1) Get team id
//     const [playerRow] = await pool.query(
//       `SELECT team_id FROM players WHERE p_id = ?`,
//       [playerId]
//     );

//     if (playerRow.length === 0) {
//       return res.status(404).json({ message: "Player not found" });
//     }

//     const teamId = playerRow[0].team_id;

//     // 2) Get latest player stat
//     const [rows] = await pool.query(
//       `
//       SELECT *
//       FROM player_stats
//       WHERE player_id = ?
//       ORDER BY created_at DESC
//       LIMIT 1
//       `,
//       [playerId]
//     );

//     if (rows.length === 0) {
//       return res.json({ success: true, player: null, team: null });
//     }

//     const p = rows[0];
//     const pm = p.matches || 0;

//     const playerStats = {
//       matches: pm,
//       goals: pm ? p.goals / pm : 0,
//       assists: pm ? p.assists / pm : 0,
//       shots: pm ? p.shots / pm : 0,
//       shots_on_goal: pm ? p.shots_on_goal / pm : 0,
//       big_chances: pm ? p.big_chances / pm : 0,
//       key_passes: pm ? p.key_passes / pm : 0,
//       tackles: pm ? p.tackles / pm : 0,
//       pass_completion_pct: pm ? p.pass_completion_pct / pm : 0,
//       minutes: pm ? p.minutes / pm : 0,
//       cautions: pm ? p.cautions / pm : 0,
//       ejections: pm ? p.ejections / pm : 0,
//       progressive_carries: pm ? p.progressive_carries / pm : 0,
//       defensive_actions: pm ? p.defensive_actions / pm : 0
//     };

//     // 3) Latest team stat
//     const [teamRows] = await pool.query(
//       `
//       SELECT *
//       FROM team_stats
//       WHERE team_id = ?
//       ORDER BY created_at DESC
//       LIMIT 1
//       `,
//       [teamId]
//     );

//     const t = teamRows[0] || {};
//     const tm = t.matches || 0;

//     const teamStats = {
//       matches: tm,
//       goals: tm ? t.goals / tm : 0,
//       assists: tm ? t.assists / tm : 0,
//       shots: tm ? t.shots / tm : 0,
//       shots_on_goal: tm ? t.shots_on_goal / tm : 0,
//       big_chances: tm ? t.big_chances / tm : 0,
//       key_passes: tm ? t.key_passes / tm : 0,
//       tackles: tm ? t.tackles / tm : 0,
//       pass_completion_pct: tm ? t.pass_completion_pct / tm : 0,
//       minutes: tm ? t.minutes / tm : 0,
//       cautions: tm ? t.cautions / tm : 0,
//       ejections: tm ? t.ejections / tm : 0,
//       progressive_carries: tm ? t.progressive_carries / tm : 0,
//       defensive_actions: tm ? t.defensive_actions / tm : 0
//     };

//     return res.json({
//       success: true,
//       player: playerStats,
//       team: teamStats
//     });

//   } catch (err) {
//     console.error("getPlayerStatsAverage error:", err);
//     return res.status(500).json({ message: "Failed to load averages" });
//   }
// };

export const getPlayerStatsAverage = async (req, res) => {
  try {
    const playerId = req.params.playerId;

    // 1) Get team id
    const [playerRow] = await pool.query(
      `SELECT team_id FROM players WHERE p_id = ?`,
      [playerId]
    );

    if (playerRow.length === 0) {
      return res.status(404).json({ message: "Player not found" });
    }

    const teamId = playerRow[0].team_id;

    // 2) Get latest player stat
    const [rows] = await pool.query(
      `
      SELECT *
      FROM player_stats
      WHERE player_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [playerId]
    );

    if (rows.length === 0) {
      return res.json({ success: true, player: null, team: null, rawPlayer: null, rawTeam: null });
    }

    const p = rows[0];
    const pm = p.matches || 0;

    // ⭐ Player per-match averages
    const playerStats = {
      matches: pm,
      goals: pm ? p.goals / pm : 0,
      assists: pm ? p.assists / pm : 0,
      shots: pm ? p.shots / pm : 0,
      shots_on_goal: pm ? p.shots_on_goal / pm : 0,
      big_chances: pm ? p.big_chances / pm : 0,
      key_passes: pm ? p.key_passes / pm : 0,
      tackles: pm ? p.tackles / pm : 0,
      pass_completion_pct: pm ? p.pass_completion_pct / pm : 0,
      minutes: pm ? p.minutes / pm : 0,
      cautions: pm ? p.cautions / pm : 0,
      ejections: pm ? p.ejections / pm : 0,
      progressive_carries: pm ? p.progressive_carries / pm : 0,
      defensive_actions: pm ? p.defensive_actions / pm : 0
    };

    // ⭐ Raw player values (actual stored values, no averaging)
    const rawPlayer = { ...p };

    // 3) Latest team stat
    const [teamRows] = await pool.query(
      `
      SELECT *
      FROM team_stats
      WHERE team_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [teamId]
    );

    const t = teamRows[0] || {};
    const tm = t.matches || 0;

    // ⭐ Team per-match averages
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

    // ⭐ Raw team values
    const rawTeam = { ...t };

    return res.json({
      success: true,
      player: playerStats,
      team: teamStats,
      rawPlayer,
      rawTeam
    });

  } catch (err) {
    console.error("getPlayerStatsAverage error:", err);
    return res.status(500).json({ message: "Failed to load averages" });
  }
};


export const updatePlayerStats = async (req, res) => {
  try {
    const playerId = req.params.playerId;
    const updatedStats = req.body;

    console.log("Received update request for player:", playerId);
    console.log("Update data:", updatedStats);

    // Get the latest stats record for this player
    const [existingStats] = await pool.query(
      `SELECT * FROM player_stats WHERE player_id = ? ORDER BY created_at DESC LIMIT 1`,
      [playerId]
    );

    if (existingStats.length === 0) {
      return res.status(404).json({ message: "No stats found for this player" });
    }

    const currentStatPsId = existingStats[0].ps_id;
    console.log("Updating record with ps_id:", currentStatPsId);

    // Update the stats using ps_id - remove updated_at
    const updateQuery = `
      UPDATE player_stats 
      SET 
        matches = ?, goals = ?, assists = ?, shots = ?, shots_on_goal = ?,
        big_chances = ?, key_passes = ?, tackles = ?, pass_completion_pct = ?,
        minutes = ?, cautions = ?, ejections = ?, progressive_carries = ?,
        defensive_actions = ?
      WHERE ps_id = ?
    `;

    const values = [
      updatedStats.matches || 0,
      updatedStats.goals || 0,
      updatedStats.assists || 0,
      updatedStats.shots || 0,
      updatedStats.shots_on_goal || 0,
      updatedStats.big_chances || 0,
      updatedStats.key_passes || 0,
      updatedStats.tackles || 0,
      updatedStats.pass_completion_pct || 0,
      updatedStats.minutes || 0,
      updatedStats.cautions || 0,
      updatedStats.ejections || 0,
      updatedStats.progressive_carries || 0,
      updatedStats.defensive_actions || 0,
      currentStatPsId  // Use ps_id here
    ];

    const [result] = await pool.query(updateQuery, values);
    console.log("Update result:", result);

    res.json({
      success: true,
      message: "Player statistics updated successfully",
      updatedId: currentStatPsId
    });

  } catch (err) {
    console.error("updatePlayerStats error:", err);
    return res.status(500).json({ message: "Failed to update player statistics" });
  }
};

export const updateTeamStats = async (req, res) => {
  try {
    const teamId = req.params.teamId;
    const updatedStats = req.body;

    console.log("Received update request for team:", teamId);
    console.log("Update data:", updatedStats);

    // Get the latest stats record for this team
    const [existingStats] = await pool.query(
      `SELECT * FROM team_stats WHERE team_id = ? ORDER BY created_at DESC LIMIT 1`,
      [teamId]
    );

    if (existingStats.length === 0) {
      return res.status(404).json({ message: "No stats found for this team" });
    }

    const currentStatId = existingStats[0].ts_id; // team_stats table ki primary key
    console.log("Updating team record with ts_id:", currentStatId);

    // Update the team stats
    const updateQuery = `
      UPDATE team_stats 
      SET 
        matches = ?, goals = ?, assists = ?, shots = ?, shots_on_goal = ?,
        big_chances = ?, key_passes = ?, tackles = ?, pass_completion_pct = ?,
        minutes = ?, cautions = ?, ejections = ?, progressive_carries = ?,
        defensive_actions = ?
      WHERE ts_id = ?
    `;

    const values = [
      updatedStats.matches || 0,
      updatedStats.goals || 0,
      updatedStats.assists || 0,
      updatedStats.shots || 0,
      updatedStats.shots_on_goal || 0,
      updatedStats.big_chances || 0,
      updatedStats.key_passes || 0,
      updatedStats.tackles || 0,
      updatedStats.pass_completion_pct || 0,
      updatedStats.minutes || 0,
      updatedStats.cautions || 0,
      updatedStats.ejections || 0,
      updatedStats.progressive_carries || 0,
      updatedStats.defensive_actions || 0,
      currentStatId  // Use ts_id here
    ];

    const [result] = await pool.query(updateQuery, values);
    console.log("Team update result:", result);

    res.json({
      success: true,
      message: "Team statistics updated successfully",
      updatedId: currentStatId
    });

  } catch (err) {
    console.error("updateTeamStats error:", err);
    return res.status(500).json({ message: "Failed to update team statistics" });
  }
};