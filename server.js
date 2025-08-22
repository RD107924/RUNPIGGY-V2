// server.js (整合會員系統版本)
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const path = require("path");
const cors = require("cors");

// 引入所有需要的路由和中間件
const authMiddleware = require("./authMiddleware");
const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const quoteRoutes = require("./quoteRoutes");
const customerRoutes = require("./customerRoutes"); // 新增會員路由

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- API Routes ---
app.use("/api/quotes", quoteRoutes); // 公開的估價單 API
app.use("/api/users", userRoutes); // 公開的使用者登入 API
app.use("/api/customers", customerRoutes); // 會員相關 API
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
      additionalServices, // 新增：加值服務資料
      customerToken // 新增：如果是會員下單，會帶入 token
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
        if (decoded.type === 'customer') {
          customerId = decoded.id;
          console.log("會員下單，ID:", customerId); // 除錯用
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
        calculationResult: JSON.stringify(cleanCalculationResult), // 轉換為 JSON 字串
        additionalServices: additionalServices ? JSON.stringify(additionalServices) : null, // 儲存加值服務資料
        customerId // 如果是會員下單，會關聯到會員 ID
      },
    });
    
    // 如果有選擇加值服務，記錄到 console（方便管理員查看）
    if (additionalServices && (additionalServices.carryUpstairs?.needed || additionalServices.assembly?.needed)) {
      console.log(`訂單 ${newOrder.id} 包含加值服務：`);
      if (additionalServices.carryUpstairs?.needed) {
        console.log(`  - 搬運上樓：${additionalServices.carryUpstairs.floor}樓，${additionalServices.carryUpstairs.hasElevator === 'yes' ? '有' : '無'}電梯`);
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
app.get("/register.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "register.html"));
});
app.get("/login.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});
app.get("/customer.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "customer.html"));
});

// 將所有其他請求導向主計算器頁面
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 啟動伺服器 - 重要！使用環境變數 PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`伺服器正在 port ${PORT} 上運行`);
    console.log(`環境: ${process.env.NODE_ENV || 'development'}`);
});