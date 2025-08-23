// server.js (整合會員系統與包裹預報版本)
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

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- API Routes ---
app.use("/api/quotes", quoteRoutes); // 公開的估價單 API
app.use("/api/users", userRoutes); // 公開的使用者登入 API
app.use("/api/customers", customerRoutes); // 會員相關 API
app.use("/api/parcels", parcelRoutes); // 包裹預報 API
app.use("/api/admin", authMiddleware, adminRoutes); // 受保護的後台管理 API

// 客戶提交正式訂單的 API (支援會員和非會員)
app.post("/api/orders", async (req, res) => {
  try {
    const {
      lineNickname,
      recipientName,
      address,
      phone,
      idNumber,
      calculationResult,
      additionalServices,
      customerToken,
    } = req.body;

    if (!recipientName || !address || !phone || !calculationResult) {
      return res.status(400).json({ error: "缺少必要的訂單資訊" });
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

    const newOrder = await prisma.shipmentOrder.create({
      data: {
        lineNickname: lineNickname || "未提供",
        recipientName,
        address,
        phone,
        idNumber,
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

    res.status(201).json(newOrder);
  } catch (error) {
    console.error("建立訂單時發生錯誤:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// 處理前端頁面請求
app.get("/quote.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "quote.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/admin-parcels", (req, res) => {
  const filePath = path.join(__dirname, "public", "admin-parcels.html");
  // 檢查檔案是否存在
  const fs = require("fs");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // 如果包裹管理頁面還不存在，重定向到主管理頁面
    res.redirect("/admin");
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
  // 檢查檔案是否存在
  const fs = require("fs");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // 如果包裹預報頁面還不存在，重定向到會員中心
    res.redirect("/customer.html");
  }
});

// 將所有其他請求導向主計算器頁面
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 錯誤處理中間件
app.use((err, req, res, next) => {
  console.error("伺服器錯誤:", err.stack);
  res.status(500).json({ error: "伺服器內部錯誤" });
});

// 啟動伺服器 - 只有一個 app.listen！
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`伺服器正在 port ${PORT} 上運行`);
  console.log(`環境: ${process.env.NODE_ENV || "development"}`);

  if (process.env.NODE_ENV === "production") {
    console.log("生產環境已啟動");
  } else {
    console.log(`本地訪問: http://localhost:${PORT}`);
  }
});
