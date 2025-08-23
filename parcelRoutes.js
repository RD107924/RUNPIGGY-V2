// parcelRoutes.js - 支援會員與非會員預報包裹（含錯誤處理）
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const router = express.Router();
const prisma = new PrismaClient();

// === 認證中間件（內建版本，避免依賴問題）===
// 管理員認證中間件
const authenticateAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "需要管理員權限" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.id || decoded.type === "customer") {
      return res.status(403).json({ error: "無效的管理員認證" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "認證失敗" });
  }
};

// 會員認證中間件
const authenticateCustomer = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "需要登入會員帳號" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== "customer") {
      return res.status(403).json({ error: "無效的會員認證" });
    }

    req.customer = { id: decoded.id };
    next();
  } catch (error) {
    return res.status(401).json({ error: "認證失敗" });
  }
};

// 選擇性會員認證中間件
const optionalAuthenticateCustomer = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    req.customer = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type === "customer") {
      req.customer = { id: decoded.id };
    } else {
      req.customer = null;
    }
    next();
  } catch (error) {
    req.customer = null;
    next();
  }
};

// === 簡化版 API（不需要檔案上傳）===

// 建立包裹預報 - 支援會員與非會員（簡化版，不含圖片上傳）
router.post("/create", optionalAuthenticateCustomer, async (req, res) => {
  try {
    const {
      trackingNumber,
      logisticsCompany,
      productName,
      productLink,
      quantity,
      note,
      guestEmail,
      guestPhone,
      guestName,
    } = req.body;

    // 驗證必填欄位
    if (!trackingNumber || !productName) {
      return res.status(400).json({
        error: "物流單號和商品名稱為必填欄位",
      });
    }

    // 非會員需要提供聯絡資訊
    if (!req.customer && (!guestEmail || !guestPhone)) {
      return res.status(400).json({
        error: "非會員需要提供電子郵件和電話",
      });
    }

    // 建立包裹預報資料
    const parcelData = {
      trackingNumber,
      logisticsCompany: logisticsCompany || "",
      productName,
      productLink: productLink || null,
      productImages: "[]", // 暫時不處理圖片
      quantity: parseInt(quantity) || 1,
      note: note || null,
      status: "PENDING",
    };

    // 如果是會員，關聯到會員 ID
    if (req.customer) {
      parcelData.customerId = req.customer.id;
    } else {
      // 非會員，儲存聯絡資訊
      parcelData.guestEmail = guestEmail;
      parcelData.guestPhone = guestPhone;
      parcelData.guestName = guestName || "訪客";
    }

    const parcel = await prisma.parcelNotification.create({
      data: parcelData,
    });

    // 解析 JSON 欄位
    const parcelWithParsedImages = {
      ...parcel,
      productImages: JSON.parse(parcel.productImages),
    };

    // 為非會員產生查詢碼
    let queryCode = null;
    if (!req.customer) {
      queryCode = `${parcel.id}-${Date.now().toString(36).toUpperCase()}`;

      // 更新包裹記錄，儲存查詢碼
      await prisma.parcelNotification.update({
        where: { id: parcel.id },
        data: { queryCode },
      });

      parcelWithParsedImages.queryCode = queryCode;
    }

    res.status(201).json({
      message: "包裹預報成功",
      parcel: parcelWithParsedImages,
      queryCode: queryCode,
      isGuest: !req.customer,
    });
  } catch (error) {
    console.error("建立包裹預報失敗:", error);
    res.status(500).json({
      error: "伺服器內部錯誤",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// 非會員查詢包裹 - 使用查詢碼
router.get("/track/:queryCode", async (req, res) => {
  try {
    const { queryCode } = req.params;

    const parcel = await prisma.parcelNotification.findFirst({
      where: {
        queryCode: queryCode,
      },
    });

    if (!parcel) {
      return res.status(404).json({ error: "找不到此包裹預報" });
    }

    // 解析 JSON 欄位
    const parcelWithParsedImages = {
      ...parcel,
      productImages: JSON.parse(parcel.productImages),
    };

    // 隱藏敏感資訊
    delete parcelWithParsedImages.guestEmail;
    delete parcelWithParsedImages.guestPhone;

    res.json(parcelWithParsedImages);
  } catch (error) {
    console.error("查詢包裹失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 非會員使用 email + 單號查詢所有包裹
router.post("/track-by-email", async (req, res) => {
  try {
    const { email, trackingNumber } = req.body;

    if (!email) {
      return res.status(400).json({ error: "請提供電子郵件" });
    }

    const whereClause = {
      guestEmail: email,
      customerId: null,
    };

    if (trackingNumber) {
      whereClause.trackingNumber = trackingNumber;
    }

    const parcels = await prisma.parcelNotification.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    // 解析 JSON 欄位並隱藏敏感資訊
    const parcelsWithParsedImages = parcels.map((parcel) => {
      const parsed = {
        ...parcel,
        productImages: JSON.parse(parcel.productImages),
      };
      delete parsed.guestEmail;
      delete parsed.guestPhone;
      return parsed;
    });

    res.json(parcelsWithParsedImages);
  } catch (error) {
    console.error("查詢包裹失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 取得會員的包裹預報列表
router.get("/my-parcels", authenticateCustomer, async (req, res) => {
  try {
    const { status } = req.query;
    const whereClause = { customerId: req.customer.id };

    if (status) {
      whereClause.status = status;
    }

    const parcels = await prisma.parcelNotification.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    // 解析 JSON 欄位
    const parcelsWithParsedImages = parcels.map((parcel) => ({
      ...parcel,
      productImages: JSON.parse(parcel.productImages),
    }));

    res.json(parcelsWithParsedImages);
  } catch (error) {
    console.error("取得包裹預報列表失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 取得單一包裹預報詳情（會員）
router.get("/my-parcels/:id", authenticateCustomer, async (req, res) => {
  try {
    const parcel = await prisma.parcelNotification.findFirst({
      where: {
        id: req.params.id,
        customerId: req.customer.id,
      },
    });

    if (!parcel) {
      return res.status(404).json({ error: "找不到此包裹預報" });
    }

    // 解析 JSON 欄位
    const parcelWithParsedImages = {
      ...parcel,
      productImages: JSON.parse(parcel.productImages),
    };

    res.json(parcelWithParsedImages);
  } catch (error) {
    console.error("取得包裹預報詳情失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 取得所有包裹預報列表 (管理員)
router.get("/admin", authenticateAdmin, async (req, res) => {
  try {
    const { status, search, customerId, isGuest } = req.query;
    const whereClause = {};

    if (status) {
      whereClause.status = status;
    }

    if (customerId) {
      whereClause.customerId = customerId;
    }

    // 篩選會員或非會員包裹
    if (isGuest === "true") {
      whereClause.customerId = null;
    } else if (isGuest === "false") {
      whereClause.customerId = { not: null };
    }

    if (search) {
      whereClause.OR = [
        { trackingNumber: { contains: search } },
        { productName: { contains: search } },
        { logisticsCompany: { contains: search } },
        { guestEmail: { contains: search } },
        { guestPhone: { contains: search } },
      ];
    }

    const parcels = await prisma.parcelNotification.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    // 解析 JSON 欄位
    const parcelsWithParsedImages = parcels.map((parcel) => ({
      ...parcel,
      productImages: JSON.parse(parcel.productImages),
      isGuest: !parcel.customerId,
    }));

    res.json(parcelsWithParsedImages);
  } catch (error) {
    console.error("取得包裹預報列表失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 更新包裹預報狀態 (管理員)
router.put("/admin/:id/status", authenticateAdmin, async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const validStatuses = [
      "PENDING",
      "CONFIRMED",
      "ARRIVED",
      "COMPLETED",
      "CANCELLED",
    ];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: "無效的狀態" });
    }

    const updateData = { status };

    // 根據狀態更新時間戳記
    if (status === "CONFIRMED") {
      updateData.confirmedAt = new Date();
    } else if (status === "ARRIVED") {
      updateData.arrivedAt = new Date();
    }

    if (adminNote !== undefined) {
      updateData.adminNote = adminNote;
    }

    const updatedParcel = await prisma.parcelNotification.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({
      message: "狀態更新成功",
      parcel: updatedParcel,
    });
  } catch (error) {
    console.error("更新包裹狀態失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 取得統計資料 (管理員)
router.get("/admin/stats", authenticateAdmin, async (req, res) => {
  try {
    const [
      totalParcels,
      pendingParcels,
      confirmedParcels,
      arrivedParcels,
      completedParcels,
      guestParcels,
      memberParcels,
    ] = await Promise.all([
      prisma.parcelNotification.count(),
      prisma.parcelNotification.count({ where: { status: "PENDING" } }),
      prisma.parcelNotification.count({ where: { status: "CONFIRMED" } }),
      prisma.parcelNotification.count({ where: { status: "ARRIVED" } }),
      prisma.parcelNotification.count({ where: { status: "COMPLETED" } }),
      prisma.parcelNotification.count({ where: { customerId: null } }),
      prisma.parcelNotification.count({ where: { customerId: { not: null } } }),
    ]);

    res.json({
      totalParcels,
      pendingParcels,
      confirmedParcels,
      arrivedParcels,
      completedParcels,
      guestParcels,
      memberParcels,
    });
  } catch (error) {
    console.error("取得統計資料失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 測試路由
router.get("/test", (req, res) => {
  res.json({
    message: "包裹預報路由運作正常",
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// 修改 3: 創建一個新的簡化版本（可選方案）
// 如果上面的方案還是有問題，使用這個純 JSON 版本
// ============================================
// 在 parcelRoutes.js 中添加一個純 JSON 的路由
router.post("/create-json", optionalAuthenticateCustomer, async (req, res) => {
  try {
    console.log("JSON 請求 headers:", req.headers);
    console.log("JSON 請求 body:", req.body);

    const {
      trackingNumber,
      logisticsCompany,
      productName,
      productLink,
      quantity,
      note,
      guestEmail,
      guestPhone,
      guestName,
    } = req.body;

    // 驗證必填欄位
    if (!trackingNumber || !productName) {
      console.log("缺少必填欄位");
      return res.status(400).json({
        error: "物流單號和商品名稱為必填欄位",
        received: { trackingNumber, productName },
      });
    }

    // 非會員需要提供聯絡資訊
    if (!req.customer && (!guestEmail || !guestPhone)) {
      return res.status(400).json({
        error: "非會員需要提供電子郵件和電話",
      });
    }

    // 建立包裹預報資料（不包含圖片）
    const parcelData = {
      trackingNumber: trackingNumber.trim(),
      logisticsCompany: logisticsCompany || "",
      productName: productName.trim(),
      productLink: productLink || null,
      productImages: "[]", // 暫時不處理圖片
      quantity: parseInt(quantity) || 1,
      note: note || null,
      status: "PENDING",
    };

    // 如果是會員，關聯到會員 ID
    if (req.customer) {
      parcelData.customerId = req.customer.id;
    } else {
      // 非會員，儲存聯絡資訊
      parcelData.guestEmail = guestEmail;
      parcelData.guestPhone = guestPhone;
      parcelData.guestName = guestName || "訪客";
    }

    console.log("準備儲存的資料:", parcelData);

    const parcel = await prisma.parcelNotification.create({
      data: parcelData,
    });

    // 解析 JSON 欄位
    const parcelWithParsedImages = {
      ...parcel,
      productImages: JSON.parse(parcel.productImages),
    };

    // 為非會員產生查詢碼
    let queryCode = null;
    if (!req.customer) {
      queryCode = `${parcel.id}-${Date.now().toString(36).toUpperCase()}`;

      // 更新包裹記錄，儲存查詢碼
      await prisma.parcelNotification.update({
        where: { id: parcel.id },
        data: { queryCode },
      });

      parcelWithParsedImages.queryCode = queryCode;
    }

    res.status(201).json({
      message: "包裹預報成功",
      parcel: parcelWithParsedImages,
      queryCode: queryCode,
      isGuest: !req.customer,
    });
  } catch (error) {
    console.error("建立包裹預報失敗:", error);
    res.status(500).json({
      error: "伺服器內部錯誤",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});
module.exports = router;
