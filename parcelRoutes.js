// parcelRoutes.js - 包裹預報相關 API
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const prisma = new PrismaClient();
const router = express.Router();

// 確保上傳目錄存在
const uploadDir = path.join(__dirname, "public", "uploads", "parcels");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 設定 multer 上傳
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5, // 最多5張圖片
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("只允許上傳圖片檔案 (jpeg, jpg, png, gif, webp)"));
    }
  },
});

// 會員認證中介軟體
function authenticateCustomer(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "請先登入" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.type !== "customer") {
      return res.status(403).json({ error: "無效的會員權限" });
    }

    req.customer = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "無效的登入憑證" });
  }
}

// 管理員認證中介軟體
function authenticateAdmin(req, res, next) {
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "請先登入" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 確認是管理員 token
    if (!decoded.username || decoded.type === "customer") {
      return res.status(403).json({ error: "需要管理員權限" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: "無效的登入憑證" });
  }
}

// === 會員端 API ===

// 建立新的包裹預報 (需要會員登入)
router.post(
  "/",
  authenticateCustomer,
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
      } = req.body;

      // 驗證必填欄位
      if (!trackingNumber || !productName) {
        // 如果驗證失敗，刪除已上傳的檔案
        if (req.files) {
          req.files.forEach((file) => {
            fs.unlinkSync(file.path);
          });
        }
        return res.status(400).json({ error: "請提供物流單號和商品名稱" });
      }

      // 處理上傳的圖片
      const imageUrls = req.files
        ? req.files.map((file) => `/uploads/parcels/${file.filename}`)
        : [];

      // 建立包裹預報
      const parcel = await prisma.parcelNotification.create({
        data: {
          trackingNumber,
          logisticsCompany,
          productName,
          productLink,
          productImages: JSON.stringify(imageUrls),
          quantity: parseInt(quantity) || 1,
          note,
          customerId: req.customer.id,
          status: "PENDING",
        },
      });

      // 解析 JSON 欄位
      const parcelWithParsedImages = {
        ...parcel,
        productImages: JSON.parse(parcel.productImages),
      };

      res.status(201).json({
        message: "包裹預報成功",
        parcel: parcelWithParsedImages,
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

// 取得單一包裹預報詳情
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

// 取消包裹預報
router.put("/my-parcels/:id/cancel", authenticateCustomer, async (req, res) => {
  try {
    const parcel = await prisma.parcelNotification.findFirst({
      where: {
        id: req.params.id,
        customerId: req.customer.id,
        status: "PENDING",
      },
    });

    if (!parcel) {
      return res.status(404).json({ error: "找不到此包裹預報或無法取消" });
    }

    const updatedParcel = await prisma.parcelNotification.update({
      where: { id: req.params.id },
      data: { status: "CANCELLED" },
    });

    res.json({
      message: "包裹預報已取消",
      parcel: updatedParcel,
    });
  } catch (error) {
    console.error("取消包裹預報失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// === 管理員端 API ===

// 取得所有包裹預報列表 (管理員)
router.get("/admin", authenticateAdmin, async (req, res) => {
  try {
    const { status, search, customerId } = req.query;
    const whereClause = {};

    if (status) {
      whereClause.status = status;
    }

    if (customerId) {
      whereClause.customerId = customerId;
    }

    if (search) {
      whereClause.OR = [
        { trackingNumber: { contains: search } },
        { productName: { contains: search } },
        { logisticsCompany: { contains: search } },
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
      include: {
        customer: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    res.json({
      message: "包裹預報狀態已更新",
      parcel: updatedParcel,
    });
  } catch (error) {
    console.error("更新包裹預報狀態失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 新增管理員備註 (管理員)
router.put("/admin/:id/note", authenticateAdmin, async (req, res) => {
  try {
    const { adminNote } = req.body;

    const updatedParcel = await prisma.parcelNotification.update({
      where: { id: req.params.id },
      data: { adminNote },
    });

    res.json({
      message: "備註已更新",
      parcel: updatedParcel,
    });
  } catch (error) {
    console.error("更新備註失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 取得包裹預報統計 (管理員)
router.get("/admin/stats", authenticateAdmin, async (req, res) => {
  try {
    const [
      totalParcels,
      pendingParcels,
      confirmedParcels,
      arrivedParcels,
      completedParcels,
    ] = await Promise.all([
      prisma.parcelNotification.count(),
      prisma.parcelNotification.count({ where: { status: "PENDING" } }),
      prisma.parcelNotification.count({ where: { status: "CONFIRMED" } }),
      prisma.parcelNotification.count({ where: { status: "ARRIVED" } }),
      prisma.parcelNotification.count({ where: { status: "COMPLETED" } }),
    ]);

    res.json({
      totalParcels,
      pendingParcels,
      confirmedParcels,
      arrivedParcels,
      completedParcels,
    });
  } catch (error) {
    console.error("取得統計失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

module.exports = router;
