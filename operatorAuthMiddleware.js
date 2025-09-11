// operatorAuthMiddleware.js - 操作員認證中間件（支援 OPERATOR 和 ADMIN 角色）
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ===== 主要認證中間件 =====

/**
 * 操作員認證中間件
 * 允許 OPERATOR、ADMIN 和 SUPER_ADMIN 角色訪問
 */
const authenticateOperator = async function (req, res, next) {
  try {
    // 從請求標頭中取得 token
    const authHeader = req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        error: "需要操作員或管理員權限",
        code: "NO_TOKEN",
      });
    }

    // 驗證 token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (verifyError) {
      if (verifyError.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "認證已過期，請重新登入",
          code: "TOKEN_EXPIRED",
        });
      }
      if (verifyError.name === "JsonWebTokenError") {
        return res.status(401).json({
          error: "無效的認證 token",
          code: "INVALID_TOKEN",
        });
      }
      throw verifyError;
    }

    // 檢查是否為會員 token（會員不能執行操作員功能）
    if (decoded.type === "customer") {
      return res.status(403).json({
        error: "會員無法執行此操作，需要員工權限",
        code: "CUSTOMER_NOT_ALLOWED",
      });
    }

    // 允許的角色列表
    const allowedRoles = ["OPERATOR", "ADMIN", "SUPER_ADMIN"];

    // 檢查角色權限
    if (decoded.role && allowedRoles.includes(decoded.role)) {
      // 從資料庫取得最新的使用者資訊（確保帳號仍有效）
      try {
        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: {
            id: true,
            username: true,
            role: true,
            fullName: true,
            department: true,
            isActive: true,
            lastLoginAt: true,
            lockedUntil: true,
          },
        });

        if (!user) {
          return res.status(401).json({
            error: "使用者不存在",
            code: "USER_NOT_FOUND",
          });
        }

        // 檢查帳號是否已停用
        if (user.isActive === false) {
          return res.status(403).json({
            error: "帳號已停用，請聯繫管理員",
            code: "ACCOUNT_DISABLED",
          });
        }

        // 檢查帳號是否被鎖定
        if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
          return res.status(403).json({
            error: "帳號暫時鎖定中",
            code: "ACCOUNT_LOCKED",
            lockedUntil: user.lockedUntil,
          });
        }

        // 將完整的使用者資訊附加到請求中
        req.user = {
          ...decoded,
          ...user,
          tokenIssuedAt: decoded.iat ? new Date(decoded.iat * 1000) : null,
          tokenExpiresAt: decoded.exp ? new Date(decoded.exp * 1000) : null,
        };

        // 記錄操作（可選）
        logAccess(req);

        next();
      } catch (dbError) {
        console.error("資料庫查詢錯誤:", dbError);
        // 如果資料庫查詢失敗，仍允許通過（向後相容）
        req.user = decoded;
        next();
      }
    } else if (decoded.id && !decoded.type) {
      // 向後相容：舊版 token 可能沒有 role 欄位
      // 檢查是否為員工 token（不是會員）
      try {
        const user = await prisma.user.findUnique({
          where: { id: decoded.id },
          select: {
            id: true,
            username: true,
            role: true,
            isActive: true,
          },
        });

        if (user && user.isActive !== false) {
          req.user = { ...decoded, ...user };
          next();
        } else {
          return res.status(403).json({
            error: "權限不足或帳號已停用",
            code: "INSUFFICIENT_PERMISSIONS",
          });
        }
      } catch (dbError) {
        // 資料庫錯誤時的向後相容處理
        req.user = decoded;
        next();
      }
    } else {
      return res.status(403).json({
        error: "權限不足，需要操作員或管理員權限",
        code: "INSUFFICIENT_PERMISSIONS",
      });
    }
  } catch (error) {
    console.error("操作員認證錯誤:", error);
    return res.status(500).json({
      error: "認證過程發生錯誤",
      code: "AUTH_ERROR",
    });
  }
};

/**
 * 只允許管理員的中間件
 */
const adminOnly = async function (req, res, next) {
  try {
    const authHeader = req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        error: "需要管理員權限",
        code: "NO_TOKEN",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 只允許 ADMIN 和 SUPER_ADMIN
    if (decoded.role === "ADMIN" || decoded.role === "SUPER_ADMIN") {
      req.user = decoded;
      next();
    } else {
      return res.status(403).json({
        error: "需要管理員權限",
        code: "ADMIN_ONLY",
      });
    }
  } catch (error) {
    return res.status(401).json({
      error: "認證失敗",
      code: "AUTH_FAILED",
    });
  }
};

/**
 * 只允許超級管理員的中間件
 */
const superAdminOnly = async function (req, res, next) {
  try {
    const authHeader = req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        error: "需要超級管理員權限",
        code: "NO_TOKEN",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role === "SUPER_ADMIN") {
      req.user = decoded;
      next();
    } else {
      return res.status(403).json({
        error: "需要超級管理員權限",
        code: "SUPER_ADMIN_ONLY",
      });
    }
  } catch (error) {
    return res.status(401).json({
      error: "認證失敗",
      code: "AUTH_FAILED",
    });
  }
};

// ===== 權限檢查函數 =====

/**
 * 檢查使用者是否有特定權限
 */
const hasPermission = function (user, permission) {
  if (!user) return false;

  // 權限映射表
  const rolePermissions = {
    SUPER_ADMIN: ["*"], // 所有權限
    ADMIN: [
      "orders.read",
      "orders.write",
      "orders.delete",
      "parcels.read",
      "parcels.write",
      "parcels.delete",
      "parcels.convert", // 包裹轉訂單
      "users.read",
      "users.write",
      "customers.read",
      "customers.write",
      "reports.read",
      "reports.write",
      "settings.read",
      "settings.write",
    ],
    OPERATOR: [
      "orders.read",
      "orders.write",
      "parcels.read",
      "parcels.write",
      "parcels.convert", // 操作員也可以轉換包裹
      "customers.read",
      "reports.read",
    ],
  };

  const userRole = user.role || "OPERATOR";
  const permissions = rolePermissions[userRole] || [];

  // 超級管理員有所有權限
  if (permissions.includes("*")) {
    return true;
  }

  return permissions.includes(permission);
};

/**
 * 建立權限檢查中間件
 */
const requirePermission = function (permission) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        error: "需要先進行身份認證",
        code: "NOT_AUTHENTICATED",
      });
    }

    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({
        error: "權限不足",
        code: "PERMISSION_DENIED",
        required: permission,
        userRole: req.user.role,
      });
    }

    next();
  };
};

// ===== 輔助函數 =====

/**
 * 記錄訪問日誌
 */
function logAccess(req) {
  try {
    const logData = {
      timestamp: new Date().toISOString(),
      userId: req.user.id,
      username: req.user.username,
      role: req.user.role,
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers["user-agent"],
    };

    // 可以記錄到檔案或資料庫
    if (process.env.NODE_ENV === "development") {
      console.log("[操作員訪問]", logData);
    }

    // 可選：記錄到資料庫
    // saveAccessLog(logData);
  } catch (error) {
    // 記錄失敗不應該影響請求
    console.error("記錄訪問日誌失敗:", error);
  }
}

/**
 * 驗證 token 並返回使用者資訊（不中斷請求）
 */
const verifyOperatorToken = async function (token) {
  try {
    if (!token) {
      return { valid: false, error: "NO_TOKEN" };
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 檢查是否為會員
    if (decoded.type === "customer") {
      return { valid: false, error: "CUSTOMER_TOKEN" };
    }

    // 檢查角色
    const allowedRoles = ["OPERATOR", "ADMIN", "SUPER_ADMIN"];
    if (decoded.role && !allowedRoles.includes(decoded.role)) {
      return { valid: false, error: "INVALID_ROLE" };
    }

    // 嘗試從資料庫取得使用者資訊
    try {
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          username: true,
          role: true,
          isActive: true,
        },
      });

      if (!user) {
        return { valid: false, error: "USER_NOT_FOUND" };
      }

      if (user.isActive === false) {
        return { valid: false, error: "ACCOUNT_DISABLED" };
      }

      return {
        valid: true,
        user: { ...decoded, ...user },
      };
    } catch (dbError) {
      // 資料庫錯誤時仍返回基本資訊
      return {
        valid: true,
        user: decoded,
      };
    }
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return { valid: false, error: "TOKEN_EXPIRED" };
    }
    if (error.name === "JsonWebTokenError") {
      return { valid: false, error: "INVALID_TOKEN" };
    }
    return { valid: false, error: "UNKNOWN_ERROR" };
  }
};

/**
 * 選擇性操作員認證（不強制要求）
 */
const optionalOperatorAuth = async function (req, res, next) {
  try {
    const authHeader = req.header("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    if (!token) {
      req.user = null;
      return next();
    }

    const result = await verifyOperatorToken(token);

    if (result.valid) {
      req.user = result.user;
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    req.user = null;
    next();
  }
};

// ===== 組合中間件 =====

/**
 * 建立多重角色檢查中間件
 */
const requireRoles = function (...allowedRoles) {
  return async function (req, res, next) {
    try {
      const authHeader = req.header("Authorization");
      const token = authHeader?.replace("Bearer ", "");

      if (!token) {
        return res.status(401).json({
          error: "需要身份認證",
          code: "NO_TOKEN",
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!allowedRoles.includes(decoded.role)) {
        return res.status(403).json({
          error: "權限不足",
          code: "ROLE_NOT_ALLOWED",
          requiredRoles: allowedRoles,
          userRole: decoded.role,
        });
      }

      req.user = decoded;
      next();
    } catch (error) {
      return res.status(401).json({
        error: "認證失敗",
        code: "AUTH_FAILED",
      });
    }
  };
};

/**
 * 建立部門檢查中間件
 */
const requireDepartment = function (department) {
  return async function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        error: "需要先進行身份認證",
        code: "NOT_AUTHENTICATED",
      });
    }

    if (req.user.department !== department && req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        error: "需要特定部門權限",
        code: "DEPARTMENT_MISMATCH",
        required: department,
        userDepartment: req.user.department,
      });
    }

    next();
  };
};

// ===== 匯出模組 =====

// 主要匯出
module.exports = authenticateOperator;

// 具名匯出
module.exports.authenticateOperator = authenticateOperator;
module.exports.adminOnly = adminOnly;
module.exports.superAdminOnly = superAdminOnly;
module.exports.hasPermission = hasPermission;
module.exports.requirePermission = requirePermission;
module.exports.verifyOperatorToken = verifyOperatorToken;
module.exports.optionalOperatorAuth = optionalOperatorAuth;
module.exports.requireRoles = requireRoles;
module.exports.requireDepartment = requireDepartment;

// 向後相容匯出（如果原本有其他檔案使用這些名稱）
module.exports.authenticateAdmin = adminOnly;
module.exports.authenticateSuperAdmin = superAdminOnly;

// 角色常數匯出
module.exports.ROLES = {
  OPERATOR: "OPERATOR",
  ADMIN: "ADMIN",
  SUPER_ADMIN: "SUPER_ADMIN",
};

// 權限常數匯出
module.exports.PERMISSIONS = {
  // 訂單相關
  ORDERS_READ: "orders.read",
  ORDERS_WRITE: "orders.write",
  ORDERS_DELETE: "orders.delete",

  // 包裹相關
  PARCELS_READ: "parcels.read",
  PARCELS_WRITE: "parcels.write",
  PARCELS_DELETE: "parcels.delete",
  PARCELS_CONVERT: "parcels.convert",

  // 使用者相關
  USERS_READ: "users.read",
  USERS_WRITE: "users.write",
  USERS_DELETE: "users.delete",

  // 客戶相關
  CUSTOMERS_READ: "customers.read",
  CUSTOMERS_WRITE: "customers.write",
  CUSTOMERS_DELETE: "customers.delete",

  // 報表相關
  REPORTS_READ: "reports.read",
  REPORTS_WRITE: "reports.write",

  // 設定相關
  SETTINGS_READ: "settings.read",
  SETTINGS_WRITE: "settings.write",
};
