// authMiddleware.js - 支援多角色認證的增強版
const jwt = require("jsonwebtoken");

// 主要認證中間件（保持原有功能）
module.exports = function (req, res, next) {
  // 從請求標頭中取得 token
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    // 如果沒有 token，拒絕訪問
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    // 驗證 token 是否有效
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // 將解碼出的使用者資訊附加到請求中
    next(); // 放行，繼續執行下一個 API 處理
  } catch (ex) {
    res.status(400).json({ error: "Invalid token." });
  }
};

// 導出額外的認證函數，供特定路由使用
module.exports.authenticateAdmin = function (req, res, next) {
  // 從請求標頭中取得 token
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "需要管理員權限" });
  }

  try {
    // 驗證 token 是否有效
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 檢查是否為管理員角色
    if (decoded.role !== "ADMIN" && decoded.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "權限不足，需要管理員權限" });
    }

    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).json({ error: "無效的認證 token" });
  }
};

// 新增：操作員認證（支援 OPERATOR 和 ADMIN）
module.exports.authenticateOperator = function (req, res, next) {
  // 從請求標頭中取得 token
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "需要操作員或管理員權限" });
  }

  try {
    // 驗證 token 是否有效
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 檢查是否為操作員或管理員角色
    const allowedRoles = ["OPERATOR", "ADMIN", "SUPER_ADMIN"];
    if (!allowedRoles.includes(decoded.role)) {
      return res.status(403).json({
        error: "權限不足，需要操作員或管理員權限",
        currentRole: decoded.role,
        requiredRoles: allowedRoles,
      });
    }

    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).json({ error: "無效的認證 token" });
  }
};

// 新增：會員認證（用於區分會員和員工）
module.exports.authenticateCustomer = function (req, res, next) {
  // 從請求標頭中取得 token
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "需要會員登入" });
  }

  try {
    // 驗證 token 是否有效
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 檢查是否為會員 token
    if (decoded.type !== "customer") {
      return res.status(403).json({ error: "需要會員權限" });
    }

    req.customer = decoded;
    next();
  } catch (ex) {
    res.status(400).json({ error: "無效的會員認證" });
  }
};

// 新增：選擇性認證（不強制要求登入）
module.exports.optionalAuth = function (req, res, next) {
  // 從請求標頭中取得 token
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    // 沒有 token 也放行，但不設定 user
    req.user = null;
    req.customer = null;
    return next();
  }

  try {
    // 驗證 token 是否有效
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 根據 token 類型設定不同的屬性
    if (decoded.type === "customer") {
      req.customer = decoded;
      req.user = null;
    } else {
      req.user = decoded;
      req.customer = null;
    }

    next();
  } catch (ex) {
    // token 無效也放行，但不設定 user
    req.user = null;
    req.customer = null;
    next();
  }
};

// 新增：角色檢查中間件生成器
module.exports.requireRole = function (...allowedRoles) {
  return function (req, res, next) {
    // 確保已經通過基本認證
    if (!req.user) {
      return res.status(401).json({ error: "需要先進行身份認證" });
    }

    // 檢查角色
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "權限不足",
        currentRole: req.user.role,
        requiredRoles: allowedRoles,
      });
    }

    next();
  };
};

// 新增：超級管理員認證
module.exports.authenticateSuperAdmin = function (req, res, next) {
  // 從請求標頭中取得 token
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "需要超級管理員權限" });
  }

  try {
    // 驗證 token 是否有效
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 檢查是否為超級管理員角色
    if (decoded.role !== "SUPER_ADMIN") {
      return res.status(403).json({
        error: "權限不足，需要超級管理員權限",
        currentRole: decoded.role,
      });
    }

    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).json({ error: "無效的認證 token" });
  }
};

// 新增：記錄認證活動（可選功能）
module.exports.withAuthLogging = function (req, res, next) {
  // 從請求標頭中取得 token
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    console.log(`[AUTH] 未認證請求: ${req.method} ${req.path} - IP: ${req.ip}`);
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    // 驗證 token 是否有效
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 記錄認證成功
    console.log(
      `[AUTH] 認證成功: ${decoded.username || decoded.email} (${
        decoded.role || decoded.type
      }) - ${req.method} ${req.path}`
    );

    req.user = decoded;
    next();
  } catch (ex) {
    console.log(
      `[AUTH] 認證失敗: ${req.method} ${req.path} - IP: ${req.ip} - 錯誤: ${ex.message}`
    );
    res.status(400).json({ error: "Invalid token." });
  }
};

// 新增：API 速率限制檢查（配合認證使用）
const rateLimitMap = new Map();

module.exports.withRateLimit = function (maxRequests = 100, windowMs = 60000) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: "需要先進行身份認證" });
    }

    const userId = req.user.id;
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitMap.has(userId)) {
      rateLimitMap.set(userId, []);
    }

    const requests = rateLimitMap.get(userId);
    const recentRequests = requests.filter(
      (timestamp) => timestamp > windowStart
    );

    if (recentRequests.length >= maxRequests) {
      return res.status(429).json({
        error: "請求過於頻繁，請稍後再試",
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000),
      });
    }

    recentRequests.push(now);
    rateLimitMap.set(userId, recentRequests);

    // 定期清理舊記錄
    if (Math.random() < 0.01) {
      for (const [key, timestamps] of rateLimitMap.entries()) {
        const validTimestamps = timestamps.filter((t) => t > windowStart);
        if (validTimestamps.length === 0) {
          rateLimitMap.delete(key);
        } else {
          rateLimitMap.set(key, validTimestamps);
        }
      }
    }

    next();
  };
};

// 新增：組合多個認證策略
module.exports.combineAuth = function (...strategies) {
  return function (req, res, next) {
    let currentIndex = 0;
    let lastError = null;

    function tryNext() {
      if (currentIndex >= strategies.length) {
        // 所有策略都失敗
        return res.status(401).json({
          error: lastError || "認證失敗，請確認您的權限",
        });
      }

      const strategy = strategies[currentIndex++];

      // 創建臨時的 next 函數來捕獲錯誤
      const tempNext = function (error) {
        if (error) {
          lastError = error;
          tryNext();
        } else {
          // 認證成功
          next();
        }
      };

      // 創建臨時的 res 對象來捕獲失敗
      const tempRes = {
        ...res,
        status: function (code) {
          return {
            json: function (data) {
              lastError = data.error || "認證失敗";
              tryNext();
            },
          };
        },
      };

      strategy(req, tempRes, tempNext);
    }

    tryNext();
  };
};

// 新增：權限檢查輔助函數
module.exports.hasPermission = function (user, permission) {
  const rolePermissions = {
    SUPER_ADMIN: ["*"], // 所有權限
    ADMIN: [
      "orders.read",
      "orders.write",
      "orders.delete",
      "parcels.read",
      "parcels.write",
      "parcels.delete",
      "parcels.convert",
      "users.read",
      "users.write",
      "customers.read",
      "customers.write",
      "reports.read",
    ],
    OPERATOR: [
      "orders.read",
      "orders.write",
      "parcels.read",
      "parcels.write",
      "parcels.convert",
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

// 新增：基於權限的中間件
module.exports.requirePermission = function (permission) {
  return function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: "需要先進行身份認證" });
    }

    if (!module.exports.hasPermission(req.user, permission)) {
      return res.status(403).json({
        error: "權限不足",
        required: permission,
        userRole: req.user.role,
      });
    }

    next();
  };
};

// 保持向後相容性
module.exports.default = module.exports;
