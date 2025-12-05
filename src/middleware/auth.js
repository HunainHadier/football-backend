// src/middleware/auth.js
// src/middleware/auth.js
import jwt from "jsonwebtoken";

export const requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : null;

    if (!token) {
      return res.status(401).json({ message: "No auth token provided" });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // FULL FIX – yahan bug tha
    req.user = {
      id: payload.id,
      role: payload.role,
      u_region: payload.u_region || null   // FIXED
    };

    console.log("requireAuth user =", req.user);

    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};


export const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    // Agar user hi nahi mila
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Normalize (UPPERCASE + trim) so case/space issue na aaye
    const userRole = (req.user.role || "").toUpperCase().trim();
    const normalizedAllowed = allowedRoles.map((r) =>
      (r || "").toUpperCase().trim()
    );

    

    if (!normalizedAllowed.includes(userRole)) {
      return res
        .status(403)
        .json({ message: "Forbidden: insufficient permissions" });
    }

    next();
  };
};
