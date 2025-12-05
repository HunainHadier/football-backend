// import { pool } from "../../config/db.js";

// export const getDashboardStats = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const role = (req.user.role || "").toLowerCase();
//     const region = req.user.u_region; // asia / africa

//     // ===========================
//     // COMMON: TOTAL PLAYERS
//     // ===========================
//     let playerQuery =
//       role === "coach"
//         ? `SELECT COUNT(*) AS totalPlayers FROM players WHERE p_added_by = ?`
//         : `SELECT COUNT(*) AS totalPlayers FROM players`;

//     const [[playerRow]] = await pool.query(
//       playerQuery,
//       role === "coach" ? [userId] : []
//     );

//     // ===========================
//     // MATCHES REMOVED
//     // ===========================
//     const matchesThisWeek = 0;

//     // ===========================
//     // EVALUATIONS TABLE REMOVED
//     // ===========================
//     // Replace with region-based tables
//     const tableName =
//       region === "asia"
//         ? "asia_behavior_answers"
//         : "africa_behavior_answers";

//     const questionCount = region === "asia" ? 33 : 51;

//     const [[pendingRow]] = await pool.query(
//       `SELECT COUNT(*) AS totalEvaluations
//        FROM ${tableName}
//        ${role === "coach" ? "WHERE created_by = ?" : ""}`,
//       role === "coach" ? [userId] : []
//     );

//     const response = {
//       role,
//       region,
//       players: playerRow?.totalPlayers || 0,
//       matchesThisWeek,
//       totalEvaluations: pendingRow?.totalEvaluations || 0,
//     };

//     // ======================================
//     // COACH EXTRA INFO
//     // ======================================
//     if (role === "coach") {
//       // TOP PLAYERS
//       const [topPlayers] = await pool.query(
//         `
//         SELECT 
//           p.p_id,
//           p.p_name,
//           AVG(a.total_score) AS avgScore,
//           COUNT(a.id) AS evalCount
//         FROM players p
//         LEFT JOIN ${tableName} a
//           ON p.p_id = a.player_id
//          AND a.created_by = ?
//         WHERE p.p_added_by = ?
//         GROUP BY p.p_id
//         ORDER BY avgScore DESC
//         LIMIT 6
//       `,
//         [userId, userId]
//       );

//       response.topPlayers = topPlayers;

//       // TRAITS SUMMARY
//       const qCols = [];
//       for (let i = 1; i <= questionCount; i++) {
//         qCols.push(`AVG(q${i}) AS q${i}`);
//       }

//       const [traitsSummary] = await pool.query(
//         `SELECT ${qCols.join(", ")} FROM ${tableName} WHERE created_by = ?`,
//         [userId]
//       );

//       response.traitsSummary = traitsSummary[0];

//       // TRENDS (last 6 weeks)
//       const [trendRows] = await pool.query(
//         `
//         SELECT 
//           YEARWEEK(created_at,1) AS yw,
//           DATE_FORMAT(MIN(created_at),'%x-Week %v') AS label,
//           AVG(total_score) AS avgScore
//         FROM ${tableName}
//         WHERE created_by = ?
//         GROUP BY yw
//         ORDER BY yw DESC
//         LIMIT 6
//       `,
//         [userId]
//       );

//       response.trends = {
//         labels: trendRows.map((r) => r.label).reverse(),
//         data: trendRows.map((r) => Number(r.avgScore)).reverse(),
//       };
//     }

//     // ======================================
//     // ADMIN EXTRA INFO
//     // ======================================
//     if (role === "admin") {
//       // total coaches
//       const [[coaches]] = await pool.query(
//         `SELECT COUNT(*) AS totalCoaches FROM users WHERE u_role='COACH'`
//       );

//       // regions
//       const [[regions]] = await pool.query(
//         `SELECT COUNT(DISTINCT u_region) AS totalRegions FROM users WHERE u_role='COACH'`
//       );

//       response.totalCoaches = coaches.totalCoaches;
//       response.totalRegions = regions.totalRegions;

//       // behaviour trend across BOTH Asia & Africa
//       const [trend] = await pool.query(`
//         SELECT p.p_name, AVG(a.total_score) AS avgScore
//         FROM players p
//         LEFT JOIN asia_behavior_answers a ON a.player_id = p.p_id
//         LEFT JOIN africa_behavior_answers b ON b.player_id = p.p_id
//         GROUP BY p.p_id
//         ORDER BY avgScore DESC
//       `);

//       response.behaviourTrend = trend;

//       // login audit
//       const [audit] = await pool.query(`
//         SELECT u_name, u_email, updated_atz AS last_login
//         FROM users
//         ORDER BY updated_at DESC
//         LIMIT 10
//       `);

//       response.loginAudit = audit;
//     }

//     return res.json(response);
//   } catch (err) {
//     console.error("Dashboard stats error:", err);
//     return res.status(500).json({ message: "Failed to load dashboard stats" });
//   }
// };
import { pool } from "../../config/db.js";

export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = (req.user.role || "").toLowerCase();
    const region = req.user.u_region;

    const tableName =
      region === "asia" ? "asia_behavior_answers" : "africa_behavior_answers";

    const questionCount = region === "asia" ? 33 : 51;

    // ============================================
    // TOTAL PLAYERS
    // ============================================
    let playerQuery;

    if (role === "coach") {
      playerQuery = `
        SELECT COUNT(*) AS totalPlayers 
        FROM players 
        WHERE p_added_by = ?
      `;
    } else {
      playerQuery = `
        SELECT COUNT(*) AS totalPlayers 
        FROM players p 
        JOIN users u ON u.u_id = p.p_added_by
        WHERE u.u_region = ?
      `;
    }

    const [[playerRow]] = await pool.query(
      playerQuery,
      role === "coach" ? [userId] : [region]
    );

    

    // ============================================
    // TOTAL EVALUATIONS (FIXED: Counting completed answers for coach's players)
    // Joining players table to filter by p_added_by (Coach ID)
    // ============================================
    let totalEvaluationsQuery;
    let totalEvalsQueryParams = [];
    
    if (role === "coach") {
      // Find all completed evaluations (answers) for players added by this coach (userId)
      totalEvaluationsQuery = `
        SELECT COUNT(a.id) AS totalEvaluations
        FROM ${tableName} a
        JOIN players p ON p.p_id = a.player_id
        WHERE p.p_added_by = ? 
      `;
      totalEvalsQueryParams = [userId];
    } else {
      // Admin/Global view: Count all evaluations in the region's answer table
      totalEvaluationsQuery = `
        SELECT COUNT(id) AS totalEvaluations
        FROM ${tableName}
      `;
    }

    const [[totalEvaluationsRow]] = await pool.query(
      totalEvaluationsQuery,
      totalEvalsQueryParams
    );
    
    const response = {
      role,
      region,
      players: playerRow?.totalPlayers || 0,
      totalEvaluations: totalEvaluationsRow?.totalEvaluations || 0,
    };

    // ============================================
    // PENDING EVALUATIONS (Correctly uses p.p_added_by)
    // ============================================
    const [pending] = await pool.query(
      `
      SELECT 
        e.id,
        e.player_id,
        p.p_name,
        u.u_region AS region,
        e.token,
        e.is_used,
        e.created_at
      FROM evaluation_tokens e
      JOIN players p ON p.p_id = e.player_id
      JOIN users u ON u.u_id = p.p_added_by
      WHERE e.is_used = 0
      ${role === "coach" ? "AND p.p_added_by = ?" : ""}
      ORDER BY e.created_at DESC
      `,
      role === "coach" ? [userId] : []
    );

    response.pendingEvaluations = pending;
    
    // ============================================
    // COACH VIEW
    // ============================================
    if (role === "coach") {
      // TOP PLAYERS (FIXED: Removed comments and filters by p.p_added_by)
      const [topPlayers] = await pool.query(
        `
        SELECT 
          p.p_id,
          p.p_name,
          COALESCE(AVG(a.total_score), 0) AS avgScore,
          COUNT(a.id) AS evalCount
        FROM players p
        LEFT JOIN ${tableName} a
        ON p.p_id = a.player_id 
        WHERE p.p_added_by = ? 
        GROUP BY p.p_id
        ORDER BY avgScore DESC
        LIMIT 6
      `,
        [userId] 
      );

      response.topPlayers = topPlayers;

      // TRAITS SUMMARY (FIXED: Filters evaluations by players added by this coach)
      const qCols = Array.from(
        { length: questionCount },
        (_, i) => `AVG(q${i + 1}) AS q${i + 1}`
      );

      const [traitsSummary] = await pool.query(
        `
        SELECT ${qCols.join(", ")} 
        FROM ${tableName} a
        JOIN players p ON p.p_id = a.player_id
        WHERE p.p_added_by = ?
        `,
        [userId]
      );

      response.traitsSummary = traitsSummary[0];

      // TRENDS (FIXED: Filters evaluations by players added by this coach)
      const [trendRows] = await pool.query(
        `
        SELECT 
          YEARWEEK(a.created_at,1) AS yw,
          DATE_FORMAT(MIN(a.created_at),'%x-Week %v') AS label,
          AVG(a.total_score) AS avgScore
        FROM ${tableName} a
        JOIN players p ON p.p_id = a.player_id
        WHERE p.p_added_by = ?
        GROUP BY yw
        ORDER BY yw DESC
        LIMIT 6
      `,
        [userId]
      );

      response.trends = {
        labels: trendRows.map((r) => r.label).reverse(),
        data: trendRows.map((r) => Number(r.avgScore)).reverse(),
      };
    }

    // ============================================
    // ADMIN VIEW 
    // ============================================
    if (role === "admin") {
      const [[coaches]] = await pool.query(
        `SELECT COUNT(*) AS totalCoaches FROM users WHERE u_role='COACH'`
      );

      const [[regions]] = await pool.query(
        `SELECT COUNT(DISTINCT u_region) AS totalRegions FROM users WHERE u_role='COACH'`
      );

      response.totalCoaches = coaches.totalCoaches;
      response.totalRegions = regions.totalRegions;

      // BEHAVIOUR TREND
      const [trend] = await pool.query(`
        SELECT 
          p.p_id,
          p.p_name,
          COALESCE((
            SELECT AVG(total_score) 
            FROM asia_behavior_answers 
            WHERE player_id = p.p_id
          ), 0)
          +
          COALESCE((
            SELECT AVG(total_score) 
            FROM africa_behavior_answers 
            WHERE player_id = p.p_id
          ), 0)
          AS avgScore
        FROM players p
        ORDER BY avgScore DESC
      `);

      response.behaviourTrend = trend;

      // LOGIN AUDIT
      const [audit] = await pool.query(`
        SELECT u_name, u_email, updated_at AS last_login
        FROM users
        ORDER BY updated_at DESC
        LIMIT 10
      `);

      response.loginAudit = audit;
    }

    return res.json(response);
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return res.status(500).json({ message: "Failed to load dashboard stats" });
  }
};