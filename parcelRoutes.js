// parcelRoutes.js - 支援會員與非會員預報包裹（含圖片上傳與轉訂單功能）
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const router = express.Router();
const prisma = new PrismaClient();

// === 設定 multer 儲存 ===
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "public", "uploads", "parcels");
    // 確保目錄存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("只允許上傳圖片檔案"));
    }
  },
});

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

// 操作員認證中間件（新增：支援 OPERATOR 和 ADMIN）
const authenticateOperator = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "需要操作員或管理員權限" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.id || decoded.type === "customer") {
      return res.status(403).json({ error: "無效的操作員認證" });
    }

    // 允許 OPERATOR 和 ADMIN 角色
    if (
      decoded.role &&
      (decoded.role === "OPERATOR" ||
        decoded.role === "ADMIN" ||
        decoded.role === "SUPER_ADMIN")
    ) {
      req.user = decoded;
      next();
    } else {
      return res.status(403).json({ error: "權限不足" });
    }
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

// 純 JSON 的路由（保留原有的）
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

// === 支援圖片上傳的路由 ===
router.post(
  "/create-with-images",
  optionalAuthenticateCustomer,
  upload.array("images", 5),
  async (req, res) => {
    try {
      console.log("收到包含圖片的請求");
      console.log("文字資料:", req.body);
      console.log("圖片數量:", req.files ? req.files.length : 0);

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
        // 如果驗證失敗，刪除已上傳的檔案
        if (req.files) {
          req.files.forEach((file) => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return res.status(400).json({
          error: "物流單號和商品名稱為必填欄位",
        });
      }

      // 非會員需要提供聯絡資訊
      if (!req.customer && (!guestEmail || !guestPhone)) {
        // 刪除已上傳的檔案
        if (req.files) {
          req.files.forEach((file) => {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path);
            }
          });
        }
        return res.status(400).json({
          error: "非會員需要提供電子郵件和電話",
        });
      }

      // 處理圖片 URLs
      const imageUrls = req.files
        ? req.files.map((file) => `/uploads/parcels/${file.filename}`)
        : [];

      console.log("圖片路徑:", imageUrls);

      // 建立包裹預報資料
      const parcelData = {
        trackingNumber: trackingNumber.trim(),
        logisticsCompany: logisticsCompany || "",
        productName: productName.trim(),
        productLink: productLink || null,
        productImages: JSON.stringify(imageUrls), // 儲存圖片路徑
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

      // 發生錯誤時刪除已上傳的檔案
      if (req.files) {
        req.files.forEach((file) => {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        });
      }

      res.status(500).json({
        error: "伺服器內部錯誤",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
);

// 非會員查詢包裹 - 使用查詢碼（保持原有）
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

// 非會員使用 email + 單號查詢所有包裹（保持原有）
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

// 取得會員的包裹預報列表（保持原有）
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

// 取得單一包裹預報詳情（會員）（保持原有）
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

// 取得所有包裹預報列表 (管理員)（保持原有）
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
        // 新增：包含轉換的訂單資訊
        convertedOrder: {
          select: {
            id: true,
            shareToken: true,
            createdAt: true,
            finalTotalAmount: true,
            paymentStatus: true,
          },
        },
      },
    });

    // 解析 JSON 欄位
    const parcelsWithParsedImages = parcels.map((parcel) => ({
      ...parcel,
      productImages: JSON.parse(parcel.productImages),
      isGuest: !parcel.customerId,
      canConvert: parcel.status === "ARRIVED" && !parcel.isConverted, // 新增：標記是否可以轉換
    }));

    res.json(parcelsWithParsedImages);
  } catch (error) {
    console.error("取得包裹預報列表失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// === 新增：取得單一包裹詳情（管理員/操作員）===
router.get("/admin/:id", authenticateOperator, async (req, res) => {
  try {
    const parcel = await prisma.parcelNotification.findUnique({
      where: { id: req.params.id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            defaultAddress: true,
            idNumber: true,
            taxId: true,
          },
        },
        convertedOrder: {
          select: {
            id: true,
            shareToken: true,
            createdAt: true,
            finalTotalAmount: true,
            paymentStatus: true,
          },
        },
      },
    });

    if (!parcel) {
      return res.status(404).json({ error: "找不到此包裹預報" });
    }

    // 解析 JSON 欄位
    const parcelWithParsedImages = {
      ...parcel,
      productImages: JSON.parse(parcel.productImages),
      canConvert: parcel.status === "ARRIVED" && !parcel.isConverted,
    };

    res.json(parcelWithParsedImages);
  } catch (error) {
    console.error("取得包裹詳情失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 更新包裹預報狀態 (管理員)（保持原有）
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

// === 新增：檢查包裹是否可以轉換為訂單 ===
router.get(
  "/admin/:id/check-convertible",
  authenticateOperator,
  async (req, res) => {
    try {
      const parcel = await prisma.parcelNotification.findUnique({
        where: { id: req.params.id },
        select: {
          id: true,
          status: true,
          isConverted: true,
          convertedOrder: {
            select: {
              id: true,
              shareToken: true,
            },
          },
        },
      });

      if (!parcel) {
        return res.status(404).json({ error: "找不到此包裹預報" });
      }

      const canConvert = parcel.status === "ARRIVED" && !parcel.isConverted;

      res.json({
        parcelId: parcel.id,
        canConvert,
        status: parcel.status,
        isConverted: parcel.isConverted,
        convertedOrder: parcel.convertedOrder,
        message: canConvert
          ? "此包裹可以轉換為訂單"
          : parcel.isConverted
          ? "此包裹已經轉換為訂單"
          : `包裹狀態必須為 ARRIVED 才能轉換，目前狀態為 ${parcel.status}`,
      });
    } catch (error) {
      console.error("檢查包裹轉換狀態失敗:", error);
      res.status(500).json({ error: "伺服器內部錯誤" });
    }
  }
);

// 取得統計資料 (管理員)（增強版）
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
      convertedParcels, // 新增
      convertibleParcels, // 新增
    ] = await Promise.all([
      prisma.parcelNotification.count(),
      prisma.parcelNotification.count({ where: { status: "PENDING" } }),
      prisma.parcelNotification.count({ where: { status: "CONFIRMED" } }),
      prisma.parcelNotification.count({ where: { status: "ARRIVED" } }),
      prisma.parcelNotification.count({ where: { status: "COMPLETED" } }),
      prisma.parcelNotification.count({ where: { customerId: null } }),
      prisma.parcelNotification.count({ where: { customerId: { not: null } } }),
      prisma.parcelNotification.count({ where: { isConverted: true } }), // 新增：已轉換數量
      prisma.parcelNotification.count({
        where: {
          status: "ARRIVED",
          isConverted: false,
        },
      }), // 新增：可轉換數量
    ]);

    res.json({
      totalParcels,
      pendingParcels,
      confirmedParcels,
      arrivedParcels,
      completedParcels,
      guestParcels,
      memberParcels,
      convertedParcels, // 新增
      convertibleParcels, // 新增
    });
  } catch (error) {
    console.error("取得統計資料失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 測試路由（保持原有）
router.get("/test", (req, res) => {
  res.json({
    message: "包裹預報路由運作正常",
    timestamp: new Date().toISOString(),
    features: {
      basic: true,
      imageUpload: true,
      parcelToOrder: true, // 新增
    },
  });
});

module.exports = router;
