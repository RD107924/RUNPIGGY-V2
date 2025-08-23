// parcelRoutes.js - 支援會員與非會員預報包裹
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");

const router = express.Router();
const prisma = new PrismaClient();

// === 認證中間件 ===
// 原有的會員認證中間件
const authenticateCustomer = require("./customerAuthMiddleware");
const authenticateAdmin = require("./authMiddleware");

// 新增：選擇性會員認證中間件
const optionalAuthenticateCustomer = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    // 沒有 token，以非會員身份繼續
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
    // token 無效，以非會員身份繼續
    req.customer = null;
    next();
  }
};

// === 檔案上傳設定 (保持原有) ===
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, "public", "uploads", "parcels");
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

// === 公開 API（支援會員與非會員）===

// 建立包裹預報 - 支援會員與非會員
router.post(
  "/create",
  optionalAuthenticateCustomer, // 使用選擇性認證
  upload.array("images", 5),
  async (req, res) => {
    try {
      const {
        trackingNumber,
        logisticsCompany,
        productName,
        productLink,
        quantity,
        note,
        // 非會員需要提供的額外資訊
        guestEmail,
        guestPhone,
        guestName,
      } = req.body;

      // 驗證必填欄位
      if (!trackingNumber || !productName) {
        if (req.files) {
          req.files.forEach((file) => fs.unlinkSync(file.path));
        }
        return res.status(400).json({
          error: "物流單號和商品名稱為必填欄位",
        });
      }

      // 非會員需要提供聯絡資訊
      if (!req.customer && (!guestEmail || !guestPhone)) {
        if (req.files) {
          req.files.forEach((file) => fs.unlinkSync(file.path));
        }
        return res.status(400).json({
          error: "非會員需要提供電子郵件和電話",
        });
      }

      // 處理上傳的圖片
      const imageUrls = req.files
        ? req.files.map((file) => `/uploads/parcels/${file.filename}`)
        : [];

      // 建立包裹預報資料
      const parcelData = {
        trackingNumber,
        logisticsCompany,
        productName,
        productLink,
        productImages: JSON.stringify(imageUrls),
        quantity: parseInt(quantity) || 1,
        note,
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
        // 產生簡單的查詢碼（可以改用更複雜的邏輯）
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
        queryCode: queryCode, // 非會員會收到查詢碼
        isGuest: !req.customer,
      });
    } catch (error) {
      console.error("建立包裹預報失敗:", error);

      // 發生錯誤時刪除已上傳的檔案
      if (req.files) {
        req.files.forEach((file) => {
          fs.unlinkSync(file.path);
        });
      }

      res.status(500).json({ error: "伺服器內部錯誤" });
    }
  }
);

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
      customerId: null, // 確保只查詢非會員的包裹
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

// === 會員專屬 API (保持原有) ===

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

// === 管理員 API (保持原有，但增強查詢) ===

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

    // 新增：篩選會員或非會員包裹
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
      // 標記是否為訪客
      isGuest: !parcel.customerId,
    }));

    res.json(parcelsWithParsedImages);
  } catch (error) {
    console.error("取得包裹預報列表失敗:", error);
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

module.exports = router;
