// server.js (整合會員系統與包裹預報版本 - 包含包裹轉訂單功能)
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const path = require("path");
const cors = require("cors");
require("dotenv").config(); // 加載環境變數

// 引入所有需要的路由和中間件
const authMiddleware = require("./authMiddleware");
const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const quoteRoutes = require("./quoteRoutes");
const customerRoutes = require("./customerRoutes"); // 會員路由

// 檢查 parcelRoutes 是否存在，如果不存在則創建簡單的路由
let parcelRoutes;
try {
  parcelRoutes = require("./parcelRoutes");
  console.log("包裹預報路由載入成功");
} catch (error) {
  console.log("包裹預報路由尚未建立，使用預設路由");
  const router = express.Router();
  router.get("/admin/stats", (req, res) => {
    res.json({
      totalParcels: 0,
      pendingParcels: 0,
      confirmedParcels: 0,
      arrivedParcels: 0,
      completedParcels: 0,
    });
  });
  parcelRoutes = router;
}

// 檢查 parcelToOrderRoutes 是否存在
let parcelToOrderRoutes;
try {
  parcelToOrderRoutes = require("./parcelToOrderRoutes");
  console.log("包裹轉訂單路由載入成功");
} catch (error) {
  console.log("包裹轉訂單路由尚未建立，使用預設路由");
  const router = express.Router();
  router.get("/test", (req, res) => {
    res.json({
      message: "包裹轉訂單功能尚未啟用",
      timestamp: new Date().toISOString(),
    });
  });
  parcelToOrderRoutes = router;
}

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));

// --- API Routes ---
app.use("/api/quotes", quoteRoutes); // 公開的估價單 API
app.use("/api/users", userRoutes); // 公開的使用者登入 API
app.use("/api/customers", customerRoutes); // 會員相關 API
app.use("/api/parcels", parcelRoutes); // 包裹預報 API
app.use("/api/parcel-to-order", parcelToOrderRoutes); // 包裹轉訂單 API（新增）
app.use("/api/admin", authMiddleware, adminRoutes); // 受保護的後台管理 API

// 客戶提交正式訂單的 API (支援會員和非會員) - 更新版本包含 email 和 taxId
app.post("/api/orders", async (req, res) => {
  try {
    const {
      lineNickname,
      recipientName,
      address,
      phone,
      email, // 新增 - 必填
      idNumber,
      taxId, // 新增 - 選填
      calculationResult,
      additionalServices,
      customerToken,
    } = req.body;

    // 驗證必填欄位 - 現在包含 email
    if (
      !recipientName ||
      !address ||
      !phone ||
      !email ||
      !idNumber ||
      !calculationResult
    ) {
      return res.status(400).json({
        error: "缺少必要的訂單資訊",
        details: {
          recipientName: !recipientName ? "缺少收件人姓名" : null,
          address: !address ? "缺少地址" : null,
          phone: !phone ? "缺少電話" : null,
          email: !email ? "缺少電子郵件" : null,
          idNumber: !idNumber ? "缺少身分證字號" : null,
          calculationResult: !calculationResult ? "缺少計算結果" : null,
        },
      });
    }

    // 驗證 Email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "電子郵件格式不正確" });
    }

    // 驗證統一編號格式（如果有提供）
    if (taxId && !/^\d{8}$/.test(taxId)) {
      return res.status(400).json({ error: "統一編號格式錯誤，必須是8位數字" });
    }

    // 檢查是否為會員下單
    let customerId = null;
    if (customerToken) {
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(customerToken, process.env.JWT_SECRET);
        if (decoded.type === "customer") {
          customerId = decoded.id;
          console.log("會員下單，ID:", customerId);
        }
      } catch (error) {
        console.log("會員 token 無效，以非會員身份下單:", error.message);
      }
    } else {
      console.log("非會員下單");
    }

    // 淨化計算結果
    const cleanCalculationResult = {
      allItemsData: calculationResult.allItemsData,
      totalShipmentVolume: calculationResult.totalShipmentVolume,
      totalCbm: calculationResult.totalCbm,
      initialSeaFreightCost: calculationResult.initialSeaFreightCost,
      finalSeaFreightCost: calculationResult.finalSeaFreightCost,
      remoteAreaRate: calculationResult.remoteAreaRate,
      remoteFee: calculationResult.remoteFee,
      hasOversizedItem: calculationResult.hasOversizedItem,
      finalTotal: calculationResult.finalTotal,
    };

    // 創建新訂單 - 包含 email 和 taxId
    const newOrder = await prisma.shipmentOrder.create({
      data: {
        lineNickname: lineNickname || "未提供",
        recipientName,
        address,
        phone,
        email, // 新增
        idNumber,
        taxId: taxId || null, // 新增 - 可為空
        calculationResult: JSON.stringify(cleanCalculationResult),
        additionalServices: additionalServices
          ? JSON.stringify(additionalServices)
          : null,
        customerId,
      },
    });

    // 如果有選擇加值服務，記錄到 console
    if (
      additionalServices &&
      (additionalServices.carryUpstairs?.needed ||
        additionalServices.assembly?.needed)
    ) {
      console.log(`訂單 ${newOrder.id} 包含加值服務：`);
      if (additionalServices.carryUpstairs?.needed) {
        console.log(
          `  - 搬運上樓：${additionalServices.carryUpstairs.floor}樓，${
            additionalServices.carryUpstairs.hasElevator === "yes" ? "有" : "無"
          }電梯`
        );
      }
      if (additionalServices.assembly?.needed) {
        console.log(`  - 組裝服務：${additionalServices.assembly.items}`);
      }
    }

    // 記錄發票資訊
    if (taxId) {
      console.log(`訂單 ${newOrder.id} 需要開立公司發票，統一編號：${taxId}`);
    }
    console.log(`電子發票將寄送至：${email}`);

    res.status(201).json(newOrder);
  } catch (error) {
    console.error("建立訂單時發生錯誤:", error);

    // 更詳細的錯誤訊息
    if (error.code === "P2002") {
      res.status(400).json({ error: "訂單資料重複" });
    } else if (error.code === "P2003") {
      res.status(400).json({ error: "關聯資料錯誤" });
    } else {
      res.status(500).json({
        error: "伺服器內部錯誤",
        details:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  }
});

// === 新增：訂單分享頁面 API ===
app.get("/api/order-share/:shareToken", async (req, res) => {
  try {
    const { shareToken } = req.params;

    const order = await prisma.shipmentOrder.findUnique({
      where: { shareToken },
      include: {
        customer: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
        sourceParcel: {
          select: {
            trackingNumber: true,
            productName: true,
            quantity: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "找不到此訂單" });
    }

    // 更新查看次數
    await prisma.shipmentOrder.update({
      where: { id: order.id },
      data: {
        shareViewCount: order.shareViewCount + 1,
        shareLastViewedAt: new Date(),
      },
    });

    // 解析 JSON 欄位
    const orderData = {
      ...order,
      calculationResult:
        typeof order.calculationResult === "string"
          ? JSON.parse(order.calculationResult)
          : order.calculationResult,
      additionalServices: order.additionalServices
        ? JSON.parse(order.additionalServices)
        : null,
      finalQuoteData: order.finalQuoteData
        ? JSON.parse(order.finalQuoteData)
        : null,
    };

    // 移除敏感資訊
    delete orderData.internalNote;
    delete orderData.assignedToId;
    delete orderData.shareToken; // 不要暴露 token 本身

    res.json({
      success: true,
      order: orderData,
      viewCount: order.shareViewCount + 1,
    });
  } catch (error) {
    console.error("取得分享訂單失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// === 處理前端頁面請求 ===
app.get("/quote.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "quote.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/admin-parcels", (req, res) => {
  const filePath = path.join(__dirname, "public", "admin-parcels.html");
  const fs = require("fs");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.redirect("/admin");
  }
});

// 新增：包裹轉訂單管理頁面
app.get("/admin-parcel-convert/:parcelId", (req, res) => {
  const filePath = path.join(__dirname, "public", "admin-parcel-convert.html");
  const fs = require("fs");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("包裹轉訂單頁面尚未建立");
  }
});

app.get("/register.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});

app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/customer.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "customer.html"));
});

app.get("/parcel.html", (req, res) => {
  const filePath = path.join(__dirname, "public", "parcel.html");
  const fs = require("fs");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.redirect("/customer.html");
  }
});

// 公開包裹預報頁面路由
app.get("/parcel-public", (req, res) => {
  const filePath = path.join(__dirname, "public", "parcel-public.html");
  const fs = require("fs");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send("包裹預報頁面尚未建立");
  }
});

// 訂單頁面路由
app.get("/order.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "order.html"));
});

// 新增：訂單分享頁面路由
app.get("/order-share/:shareToken", (req, res) => {
  const filePath = path.join(__dirname, "public", "order-share.html");
  const fs = require("fs");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>訂單分享</title>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background-color: #f5f5f5;
          }
          .error-container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 { color: #333; }
          p { color: #666; margin: 20px 0; }
          a {
            color: #1a73e8;
            text-decoration: none;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="error-container">
          <h1>訂單分享功能建置中</h1>
          <p>此功能即將上線，敬請期待！</p>
          <a href="/">返回首頁</a>
        </div>
      </body>
      </html>
    `);
  }
});

// 錯誤處理中間件
app.use((err, req, res, next) => {
  console.error("伺服器錯誤:", err.stack);
  res.status(500).json({
    error: "伺服器內部錯誤",
    details: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 處理 - 必須在所有路由之後，錯誤處理之前
app.use((req, res) => {
  // API 請求返回 JSON
  if (req.path.startsWith("/api/")) {
    res.status(404).json({ error: "找不到該 API 端點" });
  } else {
    // 其他請求返回主頁
    res.sendFile(path.join(__dirname, "public", "index.html"));
  }
});

// 啟動伺服器
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`伺服器正在 ${HOST}:${PORT} 上運行`);
  console.log(`環境: ${process.env.NODE_ENV || "development"}`);

  if (process.env.NODE_ENV === "production") {
    console.log("生產環境已啟動");
  } else {
    console.log(`本地訪問: http://localhost:${PORT}`);
  }

  // 顯示資料庫連線狀態
  prisma
    .$connect()
    .then(() => {
      console.log("✅ 資料庫連線成功");
    })
    .catch((error) => {
      console.error("❌ 資料庫連線失敗:", error);
    });
});

// 優雅關閉
process.on("SIGTERM", async () => {
  console.log("收到 SIGTERM 信號，準備關閉伺服器...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("收到 SIGINT 信號，準備關閉伺服器...");
  await prisma.$disconnect();
  process.exit(0);
});
