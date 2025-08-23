require("dotenv").config();
// customerRoutes.js (SQLite 相容版本)
require("dotenv").config(); // 確保讀取環境變數

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const router = express.Router();

// 檢查環境變數
if (!process.env.JWT_SECRET) {
  console.error("❌ 錯誤：JWT_SECRET 未設定在 .env 檔案中！");
  process.env.JWT_SECRET = "temporary-secret-key"; // 臨時密鑰
}

// 測試路由
router.get("/test", (req, res) => {
  res.json({ message: "Customer routes working!" });
});

// 會員註冊
router.post("/register", async (req, res) => {
  try {
    const { email, password, name, phone, lineNickname, address, idNumber } =
      req.body;

    // 驗證必填欄位
    if (!email || !password || !name) {
      return res.status(400).json({ error: "請提供電子郵件、密碼和姓名" });
    }

    // 檢查 email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "請提供有效的電子郵件地址" });
    }

    // 檢查密碼強度
    if (password.length < 6) {
      return res.status(400).json({ error: "密碼長度至少需要 6 個字元" });
    }

    // 檢查 email 是否已存在
    const existingCustomer = await prisma.customer.findUnique({
      where: { email },
    });

    if (existingCustomer) {
      return res.status(400).json({ error: "此電子郵件已被註冊" });
    }

    // 加密密碼
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // 建立新會員
    const customer = await prisma.customer.create({
      data: {
        email,
        passwordHash,
        name,
        phone,
        lineNickname,
        defaultAddress: address,
        idNumber,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        lineNickname: true,
        createdAt: true,
      },
    });

    // 產生 JWT token
    const token = jwt.sign(
      {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        type: "customer",
      },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.status(201).json({
      message: "註冊成功",
      customer,
      token,
    });
  } catch (error) {
    console.error("註冊失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 會員登入（更新：加入密碼重設檢查）
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "請提供電子郵件和密碼" });
    }

    // 查找會員（新增查詢 needPasswordChange 和 passwordResetAt）
    const customer = await prisma.customer.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        name: true,
        phone: true,
        lineNickname: true,
        defaultAddress: true,
        isActive: true,
        needPasswordChange: true, // 新增
        passwordResetAt: true, // 新增
      },
    });

    if (!customer) {
      return res.status(400).json({ error: "電子郵件或密碼錯誤" });
    }

    // 檢查帳號狀態
    if (!customer.isActive) {
      return res.status(403).json({ error: "您的帳號已被停用，請聯繫客服" });
    }

    // 驗證密碼
    const validPassword = await bcrypt.compare(password, customer.passwordHash);
    if (!validPassword) {
      return res.status(400).json({ error: "電子郵件或密碼錯誤" });
    }

    // 新增：檢查是否使用預設密碼且已過期（24小時）
    if (customer.needPasswordChange && customer.passwordResetAt) {
      const hoursSinceReset =
        (Date.now() - new Date(customer.passwordResetAt).getTime()) /
        (1000 * 60 * 60);

      if (hoursSinceReset > 24) {
        // 預設密碼已過期
        return res.status(401).json({
          error: "預設密碼已過期，請聯繫管理員重新設定",
          code: "PASSWORD_EXPIRED",
        });
      }
    }

    // 產生 JWT token（如果需要修改密碼，token 有效期縮短）
    const token = jwt.sign(
      {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        type: "customer",
      },
      process.env.JWT_SECRET,
      { expiresIn: customer.needPasswordChange ? "1h" : "30d" } // 修改：根據狀態調整有效期
    );

    res.json({
      message: customer.needPasswordChange ? "請立即修改密碼" : "登入成功", // 修改：根據狀態顯示訊息
      requirePasswordChange: customer.needPasswordChange, // 新增：告知前端是否需要強制修改密碼
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        lineNickname: customer.lineNickname,
        defaultAddress: customer.defaultAddress,
      },
      token,
    });
  } catch (error) {
    console.error("登入失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 取得會員個人資料（需要驗證）
router.get("/profile", authenticateCustomer, async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.customer.id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        lineNickname: true,
        defaultAddress: true,
        idNumber: true,
        needPasswordChange: true, // 新增：讓前端知道是否需要修改密碼
        createdAt: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "找不到會員資料" });
    }

    res.json(customer);
  } catch (error) {
    console.error("取得會員資料失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 更新會員個人資料（需要驗證）
router.put("/profile", authenticateCustomer, async (req, res) => {
  try {
    const { name, phone, lineNickname, defaultAddress, idNumber } = req.body;

    const updatedCustomer = await prisma.customer.update({
      where: { id: req.customer.id },
      data: {
        name,
        phone,
        lineNickname,
        defaultAddress,
        idNumber,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        lineNickname: true,
        defaultAddress: true,
        idNumber: true,
      },
    });

    res.json({
      message: "資料更新成功",
      customer: updatedCustomer,
    });
  } catch (error) {
    console.error("更新會員資料失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 修改密碼（更新：加入預設密碼檢查和清除強制修改標記）
router.put("/change-password", authenticateCustomer, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "請提供目前密碼和新密碼" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "新密碼長度至少需要 6 個字元" });
    }

    // 新增：不允許使用預設密碼作為新密碼
    if (newPassword === "88888888") {
      return res.status(400).json({ error: "不能使用預設密碼作為新密碼" });
    }

    // 獲取會員資料（新增查詢 needPasswordChange）
    const customer = await prisma.customer.findUnique({
      where: { id: req.customer.id },
      select: {
        id: true,
        passwordHash: true,
        needPasswordChange: true, // 新增
        email: true, // 新增：用於記錄
      },
    });

    // 驗證目前密碼
    const validPassword = await bcrypt.compare(
      currentPassword,
      customer.passwordHash
    );
    if (!validPassword) {
      return res.status(400).json({ error: "目前密碼錯誤" });
    }

    // 加密新密碼
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // 更新密碼（新增：清除強制修改標記）
    await prisma.customer.update({
      where: { id: req.customer.id },
      data: {
        passwordHash: newPasswordHash,
        needPasswordChange: false, // 新增：清除強制修改標記
        passwordResetAt: null, // 新增：清除重設時間
      },
    });

    // 新增：記錄密碼修改（用於審計）
    if (customer.needPasswordChange) {
      console.log(
        `[密碼修改] ${new Date().toISOString()} - 會員 ${
          customer.email
        } 已從預設密碼修改為新密碼`
      );
    } else {
      console.log(
        `[密碼修改] ${new Date().toISOString()} - 會員 ${
          customer.email
        } 已修改密碼`
      );
    }

    // 新增：嘗試記錄到審計日誌（如果有 AuditLog 表）
    try {
      await prisma.auditLog.create({
        data: {
          action: "PASSWORD_CHANGED",
          targetType: "CUSTOMER",
          targetId: req.customer.id,
          performedById: req.customer.id, // 會員自己修改
          details: JSON.stringify({
            wasForced: customer.needPasswordChange,
            changedAt: new Date(),
          }),
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (auditError) {
      // 如果沒有 AuditLog 表，忽略錯誤
      console.log(`[審計日誌] 無法寫入: ${auditError.message}`);
    }

    res.json({
      message: "密碼修改成功",
      needPasswordChange: false, // 新增：告知前端已不需要強制修改
    });
  } catch (error) {
    console.error("修改密碼失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 取得會員的訂單列表（需要驗證）
router.get("/orders", authenticateCustomer, async (req, res) => {
  try {
    const orders = await prisma.shipmentOrder.findMany({
      where: { customerId: req.customer.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        recipientName: true,
        address: true,
        phone: true,
        status: true,
        calculationResult: true,
      },
    });

    // 解析 JSON 字串
    const ordersWithParsedJson = orders.map((order) => ({
      ...order,
      calculationResult:
        typeof order.calculationResult === "string"
          ? JSON.parse(order.calculationResult)
          : order.calculationResult,
    }));

    res.json(ordersWithParsedJson);
  } catch (error) {
    console.error("取得訂單列表失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 取得單一訂單詳情（需要驗證）
router.get("/orders/:id", authenticateCustomer, async (req, res) => {
  try {
    const order = await prisma.shipmentOrder.findFirst({
      where: {
        id: req.params.id,
        customerId: req.customer.id,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "找不到此訂單" });
    }

    // 解析 JSON 字串
    const orderWithParsedJson = {
      ...order,
      calculationResult:
        typeof order.calculationResult === "string"
          ? JSON.parse(order.calculationResult)
          : order.calculationResult,
    };

    res.json(orderWithParsedJson);
  } catch (error) {
    console.error("取得訂單詳情失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 會員認證中介軟體
function authenticateCustomer(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "請先登入" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 確認是會員 token (而非管理員)
    if (decoded.type !== "customer") {
      return res.status(403).json({ error: "無效的會員權限" });
    }

    req.customer = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "無效的登入憑證" });
  }
}

module.exports = router;
