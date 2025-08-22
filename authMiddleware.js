// authMiddleware.js
const jwt = require("jsonwebtoken");

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
