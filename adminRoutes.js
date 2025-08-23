// adminRoutes.js (SQLite 相容版本)
require("dotenv").config(); // 確保讀取環境變數

const express = require("express");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const router = express.Router();

// 定義訂單狀態常數（因為 SQLite 不支援 enum）
const OrderStatus = {
  NEEDS_PURCHASE: "NEEDS_PURCHASE",
  PURCHASED: "PURCHASED",
  IN_WAREHOUSE: "IN_WAREHOUSE",
  NOT_IN_WAREHOUSE: "NOT_IN_WAREHOUSE",
  SHIPPED: "SHIPPED",
  IN_CUSTOMS: "IN_CUSTOMS",
  DELIVERY_COMPLETE: "DELIVERY_COMPLETE",
};

// === 員工管理 ===
router.post("/register", async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "請提供帳號密碼" });
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  try {
    const user = await prisma.user.create({
      data: { username, passwordHash, role: role || "OPERATOR" },
    });
    res
      .status(201)
      .json({ id: user.id, username: user.username, role: user.role });
  } catch (error) {
    res.status(400).json({ error: "帳號已存在" });
  }
});

// === 統計資料 (加入會員統計) ===
router.get("/stats", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      newOrdersToday,
      pendingOrders,
      totalOrdersThisMonth,
      userCount,
      customerCount,
      activeCustomerCount,
    ] = await Promise.all([
      prisma.shipmentOrder.count({ where: { createdAt: { gte: today } } }),
      prisma.shipmentOrder.count({ where: { status: "NEEDS_PURCHASE" } }),
      prisma.shipmentOrder.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      prisma.user.count(),
      prisma.customer.count(),
      prisma.customer.count({ where: { isActive: true } }),
    ]);

    res.json({
      newOrdersToday,
      pendingOrders,
      totalOrdersThisMonth,
      userCount,
      customerCount,
      activeCustomerCount,
    });
  } catch (error) {
    console.error("獲取統計數據失敗:", error);
    res.status(500).json({ error: "無法獲取統計數據" });
  }
});

// === 訂單管理 (處理 JSON 字串) ===
router.get("/orders", async (req, res) => {
  console.log("收到獲取訂單的請求，開始查詢資料庫...");
  try {
    const { status, assignedToId, search, customerId } = req.query;
    const whereClause = {};

    if (status) whereClause.status = status;
    if (assignedToId) whereClause.assignedToId = assignedToId;
    if (customerId) whereClause.customerId = customerId;
    if (search) {
      whereClause.OR = [
        { recipientName: { contains: search } },
        { phone: { contains: search } },
        { lineNickname: { contains: search } },
      ];
    }

    const ordersFromDb = await prisma.shipmentOrder.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        assignedTo: { select: { username: true } },
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            lineNickname: true,
          },
        },
      },
    });

    console.log(`查詢成功！在資料庫中找到了 ${ordersFromDb.length} 筆訂單。`);

    // 解析 JSON 字串
    const ordersWithParsedJson = ordersFromDb.map((order) => ({
      ...order,
      calculationResult:
        typeof order.calculationResult === "string"
          ? JSON.parse(order.calculationResult)
          : order.calculationResult,
    }));

    res.json(ordersWithParsedJson);
  } catch (error) {
    console.error("查詢訂單時發生嚴重錯誤:", error);
    res.status(500).json({ error: "查詢訂單時伺服器發生錯誤" });
  }
});

// === 會員管理 API ===

// 取得所有會員列表
router.get("/customers", async (req, res) => {
  try {
    const { search, isActive } = req.query;
    const whereClause = {};

    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true";
    }

    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { lineNickname: { contains: search } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        lineNickname: true,
        isActive: true,
        needPasswordChange: true, // 新增：顯示是否需要修改密碼
        passwordResetAt: true, // 新增：顯示密碼重設時間
        createdAt: true,
        _count: {
          select: { orders: true },
        },
      },
    });

    res.json(customers);
  } catch (error) {
    console.error("查詢會員失敗:", error);
    res.status(500).json({ error: "查詢會員時發生錯誤" });
  }
});

// 取得單一會員詳細資料
router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10, // 只取最近10筆訂單
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "找不到此會員" });
    }

    // 解析訂單中的 JSON 字串
    const customerWithParsedOrders = {
      ...customer,
      orders: customer.orders.map((order) => ({
        ...order,
        calculationResult:
          typeof order.calculationResult === "string"
            ? JSON.parse(order.calculationResult)
            : order.calculationResult,
      })),
    };

    // 移除密碼欄位
    const { passwordHash, ...customerData } = customerWithParsedOrders;
    res.json(customerData);
  } catch (error) {
    console.error("查詢會員詳情失敗:", error);
    res.status(500).json({ error: "查詢會員詳情時發生錯誤" });
  }
});

// 更新會員狀態（啟用/停用）
router.put("/customers/:id/status", async (req, res) => {
  try {
    const { isActive } = req.body;

    const updatedCustomer = await prisma.customer.update({
      where: { id: req.params.id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
      },
    });

    res.json({
      message: `會員已${isActive ? "啟用" : "停用"}`,
      customer: updatedCustomer,
    });
  } catch (error) {
    console.error("更新會員狀態失敗:", error);
    res.status(500).json({ error: "更新會員狀態時發生錯誤" });
  }
});

// === 新增：密碼重設功能 ===

// 重設會員密碼為預設密碼（只有管理員可以執行）
router.put("/customers/:id/reset-password", async (req, res) => {
  try {
    const customerId = req.params.id;
    const DEFAULT_PASSWORD = "88888888"; // 預設密碼

    // 確認執行者是管理員角色
    if (req.user.role !== "ADMIN") {
      console.log(
        `[密碼重設拒絕] ${new Date().toISOString()} - 使用者 ${
          req.user.username
        } (角色: ${req.user.role}) 嘗試重設會員密碼但權限不足`
      );
      return res.status(403).json({
        error: "只有管理員可以重設會員密碼",
      });
    }

    // 確認會員存在
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        email: true,
        name: true,
        passwordResetAt: true,
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "找不到此會員" });
    }

    // 檢查是否最近已經重設過（避免濫用）
    if (customer.passwordResetAt) {
      const hoursSinceReset =
        (Date.now() - new Date(customer.passwordResetAt).getTime()) /
        (1000 * 60 * 60);
      if (hoursSinceReset < 1) {
        return res.status(429).json({
          error: "密碼剛剛已被重設，請稍後再試",
        });
      }
    }

    // 加密預設密碼
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, salt);

    // 更新會員密碼並設定相關標記
    await prisma.customer.update({
      where: { id: customerId },
      data: {
        passwordHash,
        needPasswordChange: true, // 標記需要修改密碼
        passwordResetAt: new Date(), // 記錄重設時間
      },
    });

    // 如果有 AuditLog 表，記錄審計日誌（可選）
    try {
      await prisma.auditLog.create({
        data: {
          action: "PASSWORD_RESET",
          targetType: "CUSTOMER",
          targetId: customerId,
          performedById: req.user.id,
          details: JSON.stringify({
            customerEmail: customer.email,
            customerName: customer.name,
            resetAt: new Date(),
            adminUsername: req.user.username,
          }),
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (auditError) {
      // 如果沒有 AuditLog 表，只記錄到 console
      console.log(`[審計日誌] 無法寫入資料庫: ${auditError.message}`);
    }

    // 記錄到 server log
    console.log(
      `[密碼重設成功] ${new Date().toISOString()} - 管理員 ${
        req.user.username
      } (ID: ${req.user.id}) 已將會員 ${customer.email} 的密碼重設為預設值`
    );

    res.json({
      success: true,
      message: "密碼已重設成功",
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
      },
      temporaryPassword: DEFAULT_PASSWORD, // 只顯示給管理員看
      note: "請通知會員使用預設密碼 88888888 登入，並建議立即修改密碼",
    });
  } catch (error) {
    console.error("重設密碼失敗:", error);
    res.status(500).json({ error: "重設密碼時發生錯誤" });
  }
});

// 查詢特定會員的密碼重設記錄（如果有 AuditLog 表）
router.get("/customers/:id/password-reset-history", async (req, res) => {
  try {
    const customerId = req.params.id;

    // 嘗試查詢審計日誌
    try {
      const resetHistory = await prisma.auditLog.findMany({
        where: {
          action: "PASSWORD_RESET",
          targetId: customerId,
          targetType: "CUSTOMER",
        },
        include: {
          performedBy: {
            select: {
              username: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10, // 只顯示最近10筆
      });

      res.json({
        customerId,
        resetHistory: resetHistory.map((log) => ({
          resetAt: log.createdAt,
          resetBy: log.performedBy.username,
          details: JSON.parse(log.details || "{}"),
        })),
      });
    } catch (auditError) {
      // 如果沒有 AuditLog 表，返回空記錄
      res.json({
        customerId,
        resetHistory: [],
        message: "審計日誌功能尚未啟用",
      });
    }
  } catch (error) {
    console.error("查詢密碼重設記錄失敗:", error);
    res.status(500).json({ error: "查詢記錄時發生錯誤" });
  }
});

// === 原有功能（繼續保留） ===

// 手動為會員建立訂單（管理員代客下單）
router.post("/customers/:id/orders", async (req, res) => {
  try {
    const customerId = req.params.id;
    const {
      lineNickname,
      recipientName,
      address,
      phone,
      idNumber,
      calculationResult,
    } = req.body;

    // 確認會員存在
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      return res.status(404).json({ error: "找不到此會員" });
    }

    // 建立訂單（將 JSON 轉為字串）
    const newOrder = await prisma.shipmentOrder.create({
      data: {
        customerId,
        lineNickname: lineNickname || customer.lineNickname,
        recipientName: recipientName || customer.name,
        address: address || customer.defaultAddress || "未提供",
        phone: phone || customer.phone || "未提供",
        idNumber: idNumber || customer.idNumber,
        calculationResult: JSON.stringify(calculationResult), // 轉為 JSON 字串
        status: "NEEDS_PURCHASE",
      },
    });

    res.status(201).json({
      message: "訂單建立成功",
      order: {
        ...newOrder,
        calculationResult: JSON.parse(newOrder.calculationResult), // 回傳時解析
      },
    });
  } catch (error) {
    console.error("建立訂單失敗:", error);
    res.status(500).json({ error: "建立訂單時發生錯誤" });
  }
});

router.get("/users", async (req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, username: true },
  });
  res.json(users);
});

router.put("/orders/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status || !Object.values(OrderStatus).includes(status)) {
    return res.status(400).json({ error: "無效的狀態" });
  }
  try {
    const updatedOrder = await prisma.shipmentOrder.update({
      where: { id },
      data: { status },
    });
    res.json(updatedOrder);
  } catch (e) {
    res.status(404).json({ error: "找不到訂單" });
  }
});

router.put("/orders/:id/assign", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  try {
    const updatedOrder = await prisma.shipmentOrder.update({
      where: { id },
      data: { assignedToId: userId || null },
    });
    res.json(updatedOrder);
  } catch (e) {
    res.status(404).json({ error: "找不到訂單" });
  }
});

module.exports = router;
