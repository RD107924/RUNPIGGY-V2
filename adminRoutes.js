// adminRoutes.js (完整版會員管理功能 + 手動建立訂單)
require("dotenv").config(); // 確保讀取環境變數

const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
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
  QUOTED: "QUOTED", // 新增：已報價狀態
  PENDING: "PENDING", // 新增：待確認狀態
  CONFIRMED: "CONFIRMED", // 新增：已確認狀態
  PROCESSING: "PROCESSING", // 新增：處理中狀態
  CANCELLED: "CANCELLED", // 新增：已取消狀態
};

// === 員工管理 ===
router.post("/register", async (req, res) => {
  const { username, password, role, fullName, email, phone, department } =
    req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "請提供帳號密碼" });
  }

  try {
    // 檢查帳號是否已存在
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return res.status(400).json({ error: "帳號已存在" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        role: role || "OPERATOR",
        fullName,
        email,
        phone,
        department,
      },
    });

    res.status(201).json({
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.fullName,
    });
  } catch (error) {
    console.error("註冊員工失敗:", error);
    res.status(500).json({ error: "註冊失敗，請稍後再試" });
  }
});

// === 統計資料 (完整版) ===
router.get("/stats", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const [
      newOrdersToday,
      pendingOrders,
      totalOrdersThisMonth,
      userCount,
      customerCount,
      activeCustomerCount,
      ordersThisWeek,
      servicesNeedQuote,
    ] = await Promise.all([
      prisma.shipmentOrder.count({ where: { createdAt: { gte: today } } }),
      prisma.shipmentOrder.count({ where: { status: "NEEDS_PURCHASE" } }),
      prisma.shipmentOrder.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.customer.count(),
      prisma.customer.count({ where: { isActive: true } }),
      prisma.shipmentOrder.count({
        where: { createdAt: { gte: startOfWeek } },
      }),
      prisma.shipmentOrder.count({
        where: {
          additionalServices: { not: null },
          serviceQuoted: false,
        },
      }),
    ]);

    res.json({
      newOrdersToday,
      pendingOrders,
      totalOrdersThisMonth,
      ordersThisWeek,
      userCount,
      customerCount,
      activeCustomerCount,
      servicesNeedQuote,
    });
  } catch (error) {
    console.error("取得統計數據失敗:", error);
    res.status(500).json({ error: "無法取得統計數據" });
  }
});

// === 訂單管理 (處理 JSON 字串) ===
router.get("/orders", async (req, res) => {
  console.log("收到取得訂單的請求，開始查詢資料庫...");
  try {
    const { status, assignedToId, search, customerId, hasServices } = req.query;
    const whereClause = {};

    if (status) whereClause.status = status;
    if (assignedToId) whereClause.assignedToId = assignedToId;
    if (customerId) whereClause.customerId = customerId;

    // 加值服務篩選
    if (hasServices === "true") {
      whereClause.additionalServices = { not: null };
    }

    if (search) {
      whereClause.OR = [
        { recipientName: { contains: search } },
        { phone: { contains: search } },
        { lineNickname: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const ordersFromDb = await prisma.shipmentOrder.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        assignedTo: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            lineNickname: true,
            memberLevel: true,
          },
        },
      },
    });

    console.log(`查詢成功，在資料庫中找到了 ${ordersFromDb.length} 筆訂單。`);

    // 解析 JSON 字串並處理加值服務
    const ordersWithParsedJson = ordersFromDb.map((order) => ({
      ...order,
      calculationResult:
        typeof order.calculationResult === "string"
          ? JSON.parse(order.calculationResult)
          : order.calculationResult,
      additionalServices:
        order.additionalServices && typeof order.additionalServices === "string"
          ? JSON.parse(order.additionalServices)
          : order.additionalServices,
      finalQuoteData:
        order.finalQuoteData && typeof order.finalQuoteData === "string"
          ? JSON.parse(order.finalQuoteData)
          : order.finalQuoteData,
    }));

    res.json(ordersWithParsedJson);
  } catch (error) {
    console.error("查詢訂單時發生嚴重錯誤:", error);
    res.status(500).json({ error: "查詢訂單時伺服器發生錯誤" });
  }
});

// === 手動建立訂單功能 (新增) ===

/**
 * 手動建立訂單
 * POST /api/admin/orders/manual
 */
router.post("/orders/manual", async (req, res) => {
  try {
    const {
      // 客戶資訊
      recipientName,
      phone,
      email,
      lineNickname,
      address,
      idNumber,
      taxId,

      // 計算結果
      calculationResult,

      // 加值服務
      additionalServices,
      serviceNote,

      // 訂單設定
      status = "QUOTED",
      paymentStatus = "UNPAID",
      internalNote,

      // 系統標記
      createdBy = "STAFF",
      shareEnabled = true,
    } = req.body;

    // 驗證必要欄位
    if (!recipientName || !phone || !address || !calculationResult) {
      return res.status(400).json({
        error: "缺少必要欄位",
        required: ["recipientName", "phone", "address", "calculationResult"],
      });
    }

    // 產生分享 token
    const shareToken = crypto.randomBytes(32).toString("hex");

    // 建立訂單
    const order = await prisma.shipmentOrder.create({
      data: {
        // 客戶資訊
        recipientName,
        phone,
        email: email || null,
        lineNickname: lineNickname || "工作人員建立",
        address,
        idNumber: idNumber || null,
        taxId: taxId || null,

        // 計算結果（儲存為 JSON）
        calculationResult: calculationResult,

        // 加值服務
        additionalServices: additionalServices || null,
        serviceNote: serviceNote || null,

        // 訂單狀態
        status: status,
        paymentStatus: paymentStatus || "UNPAID",

        // 內部資訊
        internalNote: internalNote || null,
        assignedToId: req.user ? req.user.id : null,

        // 分享功能
        shareToken: shareToken,
        shareEnabled: shareEnabled,

        // 系統標記
        source: createdBy,

        // 如果已報價，記錄報價金額
        finalQuoteData:
          status === "QUOTED"
            ? {
                shipping: calculationResult.baseFreight || 0,
                remote: calculationResult.remoteFee || 0,
                overweight: calculationResult.overweightFee || 0,
                oversized: calculationResult.oversizedFee || 0,
                service: calculationResult.serviceFee || 0,
                total: calculationResult.totalAmount || 0,
              }
            : null,

        finalTotalAmount: calculationResult.totalAmount || 0,
        totalAmount: calculationResult.totalAmount || 0,
      },
    });

    // 產生分享連結
    const shareUrl = `${req.protocol}://${req.get(
      "host"
    )}/order-share/${shareToken}`;

    // 記錄操作日誌
    console.log(
      `[手動建立訂單] ID: ${order.id}, 建立者: ${
        req.user?.username || "Unknown"
      }, 客戶: ${recipientName}`
    );

    res.status(201).json({
      success: true,
      message: "訂單建立成功",
      orderId: order.id,
      shareToken: shareToken,
      shareUrl: shareUrl,
      order: {
        id: order.id,
        recipientName: order.recipientName,
        phone: order.phone,
        address: order.address,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: order.finalTotalAmount,
        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    console.error("建立訂單失敗:", error);
    res.status(500).json({
      error: "建立訂單失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * 更新手動建立的訂單
 * PUT /api/admin/orders/manual/:orderId
 */
router.put("/orders/manual/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const updateData = req.body;

    // 檢查訂單是否存在
    const existingOrder = await prisma.shipmentOrder.findUnique({
      where: { id: parseInt(orderId) },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: "訂單不存在" });
    }

    // 只允許修改員工建立的訂單
    if (existingOrder.source !== "STAFF") {
      return res.status(403).json({
        error: "只能修改員工建立的訂單",
      });
    }

    // 更新訂單
    const updatedOrder = await prisma.shipmentOrder.update({
      where: { id: parseInt(orderId) },
      data: {
        recipientName: updateData.recipientName || existingOrder.recipientName,
        phone: updateData.phone || existingOrder.phone,
        email:
          updateData.email !== undefined
            ? updateData.email
            : existingOrder.email,
        address: updateData.address || existingOrder.address,
        calculationResult:
          updateData.calculationResult || existingOrder.calculationResult,
        status: updateData.status || existingOrder.status,
        paymentStatus: updateData.paymentStatus || existingOrder.paymentStatus,
        internalNote:
          updateData.internalNote !== undefined
            ? updateData.internalNote
            : existingOrder.internalNote,
        finalTotalAmount:
          updateData.calculationResult?.totalAmount ||
          existingOrder.finalTotalAmount,
        totalAmount:
          updateData.calculationResult?.totalAmount ||
          existingOrder.totalAmount,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: "訂單更新成功",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("更新訂單失敗:", error);
    res.status(500).json({
      error: "更新訂單失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * 取得員工建立的訂單列表
 * GET /api/admin/orders/manual
 */
router.get("/orders/manual", async (req, res) => {
  try {
    const orders = await prisma.shipmentOrder.findMany({
      where: {
        source: "STAFF",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        recipientName: true,
        phone: true,
        address: true,
        status: true,
        paymentStatus: true,
        finalTotalAmount: true,
        totalAmount: true,
        shareToken: true,
        shareEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      count: orders.length,
      orders: orders,
    });
  } catch (error) {
    console.error("取得訂單列表失敗:", error);
    res.status(500).json({
      error: "取得訂單列表失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * 停用/啟用分享連結
 * PATCH /api/admin/orders/:orderId/share
 */
router.patch("/orders/:orderId/share", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { enabled } = req.body;

    const order = await prisma.shipmentOrder.update({
      where: { id: parseInt(orderId) },
      data: {
        shareEnabled: enabled,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `分享連結已${enabled ? "啟用" : "停用"}`,
      shareEnabled: order.shareEnabled,
    });
  } catch (error) {
    console.error("更新分享狀態失敗:", error);
    res.status(500).json({
      error: "更新分享狀態失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * 重新產生分享連結
 * POST /api/admin/orders/:orderId/regenerate-share
 */
router.post("/orders/:orderId/regenerate-share", async (req, res) => {
  try {
    const { orderId } = req.params;

    // 產生新的分享 token
    const newShareToken = crypto.randomBytes(32).toString("hex");

    const order = await prisma.shipmentOrder.update({
      where: { id: parseInt(orderId) },
      data: {
        shareToken: newShareToken,
        shareEnabled: true,
        updatedAt: new Date(),
      },
    });

    const shareUrl = `${req.protocol}://${req.get(
      "host"
    )}/order-share/${newShareToken}`;

    res.json({
      success: true,
      message: "分享連結已重新產生",
      shareToken: newShareToken,
      shareUrl: shareUrl,
    });
  } catch (error) {
    console.error("重新產生分享連結失敗:", error);
    res.status(500).json({
      error: "重新產生分享連結失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// === 會員管理 API (完整版) ===

// 取得會員統計資料
router.get("/customers/stats", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [total, active, inactive, newThisMonth, withOrders] =
      await Promise.all([
        prisma.customer.count(),
        prisma.customer.count({ where: { isActive: true } }),
        prisma.customer.count({ where: { isActive: false } }),
        prisma.customer.count({ where: { createdAt: { gte: startOfMonth } } }),
        prisma.customer.count({
          where: {
            orders: {
              some: {},
            },
          },
        }),
      ]);

    // 會員等級統計（如果資料庫支援）
    let levelStats = {};
    try {
      const levels = await prisma.customer.groupBy({
        by: ["memberLevel"],
        _count: true,
      });
      levels.forEach((level) => {
        levelStats[level.memberLevel || "BASIC"] = level._count;
      });
    } catch (e) {
      // 如果欄位不存在，使用預設值
      levelStats = { BASIC: total };
    }

    res.json({
      total,
      active,
      inactive,
      newThisMonth,
      withOrders,
      levelStats,
    });
  } catch (error) {
    console.error("取得會員統計失敗:", error);
    res.status(500).json({ error: "取得統計資料失敗" });
  }
});

// 取得所有會員列表（增強版）
router.get("/customers", async (req, res) => {
  try {
    const { search, isActive, sort, page = 1, limit = 50 } = req.query;
    const whereClause = {};

    // 狀態篩選
    if (isActive !== undefined) {
      whereClause.isActive = isActive === "true";
    }

    // 搜尋功能
    if (search) {
      whereClause.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { lineNickname: { contains: search } },
        { idNumber: { contains: search } },
      ];
    }

    // 排序設定
    let orderBy = { createdAt: "desc" }; // 預設最新註冊
    switch (sort) {
      case "oldest":
        orderBy = { createdAt: "asc" };
        break;
      case "name":
        orderBy = { name: "asc" };
        break;
      case "email":
        orderBy = { email: "asc" };
        break;
      case "orders":
        // 需要特別處理
        orderBy = { createdAt: "desc" };
        break;
    }

    // 分頁計算
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    // 查詢會員資料
    const [customers, totalCount] = await Promise.all([
      prisma.customer.findMany({
        where: whereClause,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          lineNickname: true,
          defaultAddress: true,
          idNumber: true,
          taxId: true,
          isActive: true,
          emailVerified: true,
          phoneVerified: true,
          needPasswordChange: true,
          passwordResetAt: true,
          memberLevel: true,
          points: true,
          totalSpent: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orders: true,
              parcelNotifications: true,
            },
          },
        },
      }),
      prisma.customer.count({ where: whereClause }),
    ]);

    // 如果需要按訂單數排序，在記憶體中處理
    if (sort === "orders") {
      customers.sort((a, b) => b._count.orders - a._count.orders);
    }

    res.json({
      customers,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("查詢會員失敗:", error);
    res.status(500).json({ error: "查詢會員時發生錯誤" });
  }
});

// 取得單一會員詳細資料（含訂單歷史）
router.get("/customers/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        orders: {
          orderBy: { createdAt: "desc" },
          take: 20, // 取最近20筆訂單
          select: {
            id: true,
            recipientName: true,
            address: true,
            phone: true,
            email: true,
            status: true,
            totalAmount: true,
            paymentStatus: true,
            createdAt: true,
            completedAt: true,
            calculationResult: true,
            additionalServices: true,
            serviceQuoteAmount: true,
          },
        },
        parcelNotifications: {
          orderBy: { createdAt: "desc" },
          take: 10, // 取最近10筆包裹預報
          select: {
            id: true,
            trackingNumber: true,
            productName: true,
            status: true,
            createdAt: true,
          },
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
        additionalServices:
          order.additionalServices &&
          typeof order.additionalServices === "string"
            ? JSON.parse(order.additionalServices)
            : order.additionalServices,
      })),
    };

    // 計算會員統計
    const stats = {
      totalOrders: customer.orders.length,
      completedOrders: customer.orders.filter(
        (o) => o.status === "DELIVERY_COMPLETE"
      ).length,
      totalSpent: customer.orders.reduce(
        (sum, o) => sum + (o.totalAmount || 0),
        0
      ),
      totalParcels: customer.parcelNotifications.length,
    };

    // 移除密碼欄位
    const { passwordHash, passwordResetToken, ...customerData } =
      customerWithParsedOrders;

    res.json({
      ...customerData,
      stats,
    });
  } catch (error) {
    console.error("查詢會員詳情失敗:", error);
    res.status(500).json({ error: "查詢會員詳情時發生錯誤" });
  }
});

// 更新會員狀態（啟用/停用）
router.put("/customers/:id/status", async (req, res) => {
  try {
    const { isActive } = req.body;
    const customerId = req.params.id;

    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        isActive,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
      },
    });

    // 記錄操作日誌
    console.log(
      `[會員狀態變更] ${new Date().toISOString()} - 管理員 ${
        req.user?.username || "Unknown"
      } ` +
        `將會員 ${updatedCustomer.email} 狀態變更為 ${
          isActive ? "啟用" : "停用"
        }`
    );

    // 嘗試記錄審計日誌
    try {
      await prisma.auditLog.create({
        data: {
          action: "CUSTOMER_STATUS_CHANGE",
          targetType: "CUSTOMER",
          targetId: customerId,
          performedById: req.user?.id || null,
          details: JSON.stringify({
            customerEmail: updatedCustomer.email,
            newStatus: isActive ? "ACTIVE" : "INACTIVE",
            changedAt: new Date(),
          }),
        },
      });
    } catch (e) {
      // 審計日誌表可能不存在，忽略錯誤
    }

    res.json({
      message: `會員已${isActive ? "啟用" : "停用"}`,
      customer: updatedCustomer,
    });
  } catch (error) {
    console.error("更新會員狀態失敗:", error);
    res.status(500).json({ error: "更新會員狀態時發生錯誤" });
  }
});

// 重設會員密碼為 8888
router.put("/customers/:id/reset-password", async (req, res) => {
  try {
    const customerId = req.params.id;
    const DEFAULT_PASSWORD = "8888"; // 您要求的預設密碼

    // 確認執行者是管理員角色
    if (
      req.user &&
      req.user.role !== "ADMIN" &&
      req.user.role !== "SUPER_ADMIN"
    ) {
      console.log(
        `[密碼重設拒絕] ${new Date().toISOString()} - 使用者 ${
          req.user.username
        } ` + `(角色: ${req.user.role}) 嘗試重設會員密碼但權限不足`
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
        passwordResetToken: null, // 清除任何重設令牌
        passwordResetExpiry: null,
        loginAttempts: 0, // 重設登入嘗試次數
        lockedUntil: null, // 解除帳號鎖定
      },
    });

    // 嘗試記錄審計日誌
    try {
      await prisma.auditLog.create({
        data: {
          action: "PASSWORD_RESET",
          targetType: "CUSTOMER",
          targetId: customerId,
          performedById: req.user?.id || null,
          details: JSON.stringify({
            customerEmail: customer.email,
            customerName: customer.name,
            resetAt: new Date(),
            adminUsername: req.user?.username || "Unknown",
          }),
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (auditError) {
      console.log(`[審計日誌] 無法寫入資料庫: ${auditError.message}`);
    }

    // 記錄到 server log
    console.log(
      `[密碼重設成功] ${new Date().toISOString()} - 管理員 ${
        req.user?.username || "Unknown"
      } ` +
        `(ID: ${req.user?.id || "Unknown"}) 已將會員 ${
          customer.email
        } 的密碼重設為預設值`
    );

    res.json({
      success: true,
      message: "密碼已重設成功",
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
      },
      temporaryPassword: DEFAULT_PASSWORD,
      note: "請通知會員使用預設密碼 8888 登入，並建議立即修改密碼",
    });
  } catch (error) {
    console.error("重設密碼失敗:", error);
    res.status(500).json({ error: "重設密碼時發生錯誤" });
  }
});

// 批量匯出會員資料（CSV格式）
router.get("/customers/export/csv", async (req, res) => {
  try {
    // 檢查權限
    if (
      req.user &&
      req.user.role !== "ADMIN" &&
      req.user.role !== "SUPER_ADMIN"
    ) {
      return res.status(403).json({ error: "只有管理員可以匯出會員資料" });
    }

    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        lineNickname: true,
        defaultAddress: true,
        idNumber: true,
        taxId: true,
        isActive: true,
        emailVerified: true,
        memberLevel: true,
        points: true,
        totalSpent: true,
        createdAt: true,
        _count: {
          select: { orders: true },
        },
      },
    });

    // 建立CSV內容
    const headers = [
      "會員ID",
      "姓名",
      "Email",
      "電話",
      "LINE暱稱",
      "地址",
      "身分證字號",
      "統一編號",
      "會員等級",
      "積分",
      "總消費",
      "註冊日期",
      "訂單數",
      "狀態",
      "Email驗證",
    ];

    const rows = customers.map((c) => [
      c.id,
      c.name || "",
      c.email,
      c.phone || "",
      c.lineNickname || "",
      c.defaultAddress || "",
      c.idNumber || "",
      c.taxId || "",
      c.memberLevel || "BASIC",
      c.points || 0,
      c.totalSpent || 0,
      new Date(c.createdAt).toLocaleDateString("zh-TW"),
      c._count.orders,
      c.isActive ? "啟用" : "停用",
      c.emailVerified ? "已驗證" : "未驗證",
    ]);

    // 組合CSV字串
    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    // 設定回應標頭
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=members_${Date.now()}.csv`
    );

    // 加入BOM以支援Excel中文
    res.send("\uFEFF" + csvContent);
  } catch (error) {
    console.error("匯出會員資料失敗:", error);
    res.status(500).json({ error: "匯出資料時發生錯誤" });
  }
});

// 更新會員資料
router.put("/customers/:id", async (req, res) => {
  try {
    const customerId = req.params.id;
    const {
      name,
      phone,
      lineNickname,
      defaultAddress,
      idNumber,
      taxId,
      memberLevel,
      points,
      internalNote,
    } = req.body;

    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        name,
        phone,
        lineNickname,
        defaultAddress,
        idNumber,
        taxId,
        memberLevel,
        points: points ? parseInt(points) : undefined,
        internalNote,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        lineNickname: true,
        defaultAddress: true,
        idNumber: true,
        taxId: true,
        memberLevel: true,
        points: true,
        internalNote: true,
      },
    });

    res.json({
      message: "會員資料更新成功",
      customer: updatedCustomer,
    });
  } catch (error) {
    console.error("更新會員資料失敗:", error);
    res.status(500).json({ error: "更新會員資料時發生錯誤" });
  }
});

// === 原有功能（繼續保留）===

// 手動為會員建立訂單（管理員代客下單）
router.post("/customers/:id/orders", async (req, res) => {
  try {
    const customerId = req.params.id;
    const {
      lineNickname,
      recipientName,
      address,
      phone,
      email,
      idNumber,
      taxId,
      calculationResult,
      additionalServices,
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
        email: email || customer.email,
        idNumber: idNumber || customer.idNumber,
        taxId: taxId || customer.taxId,
        calculationResult: JSON.stringify(calculationResult),
        additionalServices: additionalServices
          ? JSON.stringify(additionalServices)
          : null,
        status: "NEEDS_PURCHASE",
        source: "ADMIN", // 標記為管理員建立
      },
    });

    res.status(201).json({
      message: "訂單建立成功",
      order: {
        ...newOrder,
        calculationResult: JSON.parse(newOrder.calculationResult),
        additionalServices: newOrder.additionalServices
          ? JSON.parse(newOrder.additionalServices)
          : null,
      },
    });
  } catch (error) {
    console.error("建立訂單失敗:", error);
    res.status(500).json({ error: "建立訂單時發生錯誤" });
  }
});

// 取得所有員工列表
router.get("/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        fullName: true,
        role: true,
        department: true,
      },
      orderBy: { username: "asc" },
    });
    res.json(users);
  } catch (error) {
    console.error("查詢員工失敗:", error);
    res.status(500).json({ error: "查詢員工時發生錯誤" });
  }
});

// 更新訂單狀態
router.put("/orders/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !Object.values(OrderStatus).includes(status)) {
    return res.status(400).json({ error: "無效的狀態" });
  }

  try {
    const updatedOrder = await prisma.shipmentOrder.update({
      where: { id },
      data: {
        status,
        updatedAt: new Date(),
        completedAt: status === "DELIVERY_COMPLETE" ? new Date() : undefined,
        cancelledAt: status === "CANCELLED" ? new Date() : undefined,
      },
    });
    res.json(updatedOrder);
  } catch (e) {
    res.status(404).json({ error: "找不到訂單" });
  }
});

// 指派訂單給員工
router.put("/orders/:id/assign", async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;

  try {
    const updatedOrder = await prisma.shipmentOrder.update({
      where: { id },
      data: {
        assignedToId: userId || null,
        updatedAt: new Date(),
      },
    });
    res.json(updatedOrder);
  } catch (e) {
    res.status(404).json({ error: "找不到訂單" });
  }
});

// === 加值服務報價 API ===
router.put("/orders/:id/service-quote", async (req, res) => {
  const { id } = req.params;
  const { serviceQuoteAmount, serviceQuoted } = req.body;

  try {
    // 先檢查訂單是否存在且有加值服務
    const order = await prisma.shipmentOrder.findUnique({
      where: { id },
    });

    if (!order) {
      return res.status(404).json({ error: "找不到此訂單" });
    }

    // 檢查是否有加值服務需求
    if (!order.additionalServices) {
      return res.status(400).json({ error: "此訂單無加值服務需求" });
    }

    // 更新報價
    const updatedOrder = await prisma.shipmentOrder.update({
      where: { id },
      data: {
        serviceQuoteAmount: parseFloat(serviceQuoteAmount) || 0,
        serviceQuoted: serviceQuoted === true,
        updatedAt: new Date(),
      },
    });

    res.json({
      message: "報價成功",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("更新服務報價失敗:", error);
    res.status(500).json({ error: "更新報價失敗" });
  }
});

// 取得所有待報價的訂單
router.get("/orders/pending-quotes", async (req, res) => {
  try {
    const orders = await prisma.shipmentOrder.findMany({
      where: {
        additionalServices: { not: null },
        serviceQuoted: false,
      },
      orderBy: { createdAt: "desc" },
      include: {
        customer: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    // 解析 JSON 並過濾真正需要服務的訂單
    const filteredOrders = orders.filter((order) => {
      try {
        const services =
          typeof order.additionalServices === "string"
            ? JSON.parse(order.additionalServices)
            : order.additionalServices;
        return (
          services &&
          (services.carryUpstairs?.needed || services.assembly?.needed)
        );
      } catch (e) {
        return false;
      }
    });

    res.json(filteredOrders);
  } catch (error) {
    console.error("查詢待報價訂單失敗:", error);
    res.status(500).json({ error: "查詢失敗" });
  }
});

// 批次更新服務報價
router.post("/orders/batch-quote", async (req, res) => {
  const { orderQuotes } = req.body;

  if (!Array.isArray(orderQuotes)) {
    return res.status(400).json({ error: "請提供有效的報價資料" });
  }

  try {
    const results = await Promise.all(
      orderQuotes.map(async ({ orderId, amount }) => {
        try {
          return await prisma.shipmentOrder.update({
            where: { id: orderId },
            data: {
              serviceQuoteAmount: parseFloat(amount) || 0,
              serviceQuoted: true,
              updatedAt: new Date(),
            },
          });
        } catch (e) {
          console.error(`更新訂單 ${orderId} 失敗:`, e);
          return null;
        }
      })
    );

    const successCount = results.filter((r) => r !== null).length;

    res.json({
      message: `批次報價完成，成功 ${successCount} 筆，失敗 ${
        orderQuotes.length - successCount
      } 筆`,
      results: results.filter((r) => r !== null),
    });
  } catch (error) {
    console.error("批次更新報價失敗:", error);
    res.status(500).json({ error: "批次更新失敗" });
  }
});

module.exports = router;
