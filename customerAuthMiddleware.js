// customerAuthMiddleware.js - 會員認證中間件
const jwt = require("jsonwebtoken");

const authenticateCustomer = (req, res, next) => {
  try {
    // 從 Authorization header 取得 token
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "需要登入會員帳號" });
    }

    // 驗證 token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 確認是會員 token
    if (decoded.type !== "customer") {
      return res.status(403).json({ error: "無效的會員認證" });
    }

    // 將會員資訊附加到 request
    req.customer = {
      id: decoded.id,
      email: decoded.email,
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "無效的認證 token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "認證已過期，請重新登入" });
    }

    console.error("會員認證錯誤:", error);
    return res.status(500).json({ error: "認證過程發生錯誤" });
  }
};

module.exports = authenticateCustomer;
