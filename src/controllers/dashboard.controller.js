
import { pool } from "../../config/db.js";

export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const role = (req.user.role || "").toLowerCase();
    const region = req.user.u_region;

    // Coaches ke liye, region specific table ka naam set karein
    const tableName =
      region === "asia" ? "asia_behavior_answers" : "africa_behavior_answers";

    const questionCount = region === "asia" ? 33 : 51;

    // ============================================
    // TOTAL PLAYERS (Admin: Get ALL players, Coach: Get only their players)
    // ============================================
    let playerQuery;
    let playerQueryParams = []; // New array for parameters

    if (role === "coach") {
      playerQuery = `
        SELECT COUNT(*) AS totalPlayers 
        FROM players 
        WHERE p_added_by = ?
      `;
      playerQueryParams = [userId];
    } else {
      // ADMIN FIX: Get COUNT of ALL players, irrespective of region
      playerQuery = `
        SELECT COUNT(*) AS totalPlayers 
        FROM players
      `;
      // playerQueryParams remains empty [] for admin
    }

    const [[playerRow]] = await pool.query(playerQuery, playerQueryParams);

    // ============================================
    // TOTAL EVALUATIONS (Admin: Get ALL from Asia + Africa, Coach: Get region-specific)
    // ============================================
    let totalEvaluationsQuery;
    let totalEvalsQueryParams = [];

    if (role === "coach") {
      // Coach View: Find all completed evaluations (answers) for players added by this coach (userId)
      totalEvaluationsQuery = `
        SELECT COUNT(a.id) AS totalEvaluations
        FROM ${tableName} a
        JOIN players p ON p.p_id = a.player_id
        WHERE p.p_added_by = ? 
      `;
      totalEvalsQueryParams = [userId];
    } else if (role === "admin") {
      // ADMIN FIX: SUM of total evaluations from BOTH Asia and Africa tables
      totalEvaluationsQuery = `
        SELECT (
            SELECT COUNT(id) FROM asia_behavior_answers
        ) + (
            SELECT COUNT(id) FROM africa_behavior_answers
        ) AS totalEvaluations
      `;
      // totalEvalsQueryParams remains empty [] for admin
    } else {
      // Fallback for non-coach, non-admin roles (if any)
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
    // PENDING EVALUATIONS (Correctly uses p.p_added_by - Assuming Admin sees ALL pending, Coach sees only theirs)
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
      // TOP PLAYERS 
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

      // TRAITS SUMMARY 
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

      // TRENDS 
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
    // ADMIN VIEW (Logic remains largely the same, but totalEvaluations and players is fixed)
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

      // BEHAVIOUR TREND - This logic correctly fetches scores from both tables and sums them
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
      // const [audit] = await pool.query(`
      //   SELECT u_name, u_email, updated_at AS last_login
      //   FROM users
      //   ORDER BY updated_at DESC
      //   LIMIT 10
      // `);

      const [audit] = await pool.query(`
  SELECT 
    u_name,
    u_email,
    last_login_at AS last_login
  FROM users
  WHERE u_role = 'COACH'
    AND last_login_at IS NOT NULL
  ORDER BY last_login_at DESC
  LIMIT 10
`);


      response.loginAudit = audit;
    }

    return res.json(response);
  } catch (err) {
    console.error("Dashboard stats error:", err);
    return res.status(500).json({ message: "Failed to load dashboard stats" });
  }
}