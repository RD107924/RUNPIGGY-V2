// server.js (最終完整版)
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const path = require("path");
const cors = require("cors");

// 引入所有需要的路由和中間件
const authMiddleware = require("./authMiddleware");
const userRoutes = require("./userRoutes");
const adminRoutes = require("./adminRoutes");
const quoteRoutes = require("./quoteRoutes"); // 引入估價單路由

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(__dirname, "public")));

// --- API Routes ---
app.use("/api/quotes", quoteRoutes); // 公開的估價單 API
app.use("/api/users", userRoutes); // 公開的使用者登入 API
app.use("/api/admin", authMiddleware, adminRoutes); // 受保護的後台管理 API

// 客戶提交正式訂單的 API (公開)
app.post("/api/orders", async (req, res) => {
  try {
    const {
      lineNickname,
      recipientName,
      address,
      phone,
      idNumber,
      calculationResult,
    } = req.body;

    if (!recipientName || !address || !phone || !calculationResult) {
      return res.status(400).json({ error: "缺少必要的訂單資訊" });
    }

    // --- 淨化步驟 ---
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
        calculationResult: cleanCalculationResult, // 使用淨化後的資料
      },
    });
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
// 將所有其他請求導向主計算器頁面
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`伺服器正在 http://localhost:${PORT} 上運行`);
});
