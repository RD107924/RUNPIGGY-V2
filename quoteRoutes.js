// quoteRoutes.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const router = express.Router();

// POST /api/quotes - 建立一個新的估價單分享
router.post("/", async (req, res) => {
  try {
    const { calculationResult } = req.body;

    // 檢查是否有提供計算結果
    if (!calculationResult) {
      console.error("缺少計算結果資料");
      return res.status(400).json({ error: "缺少計算結果" });
    }

    // 記錄接收到的資料（用於除錯）
    console.log("接收到的計算結果資料類型:", typeof calculationResult);
    console.log("資料大小:", JSON.stringify(calculationResult).length, "bytes");

    try {
      // 將物件轉換為 JSON 字串存入資料庫
      const quote = await prisma.calculationQuote.create({
        data: {
          calculationResult: JSON.stringify(calculationResult), // 重要：轉換為 JSON 字串
        },
      });

      console.log("成功建立估價單，ID:", quote.id);

      // 只回傳新建立的 ID
      res.status(201).json({ id: quote.id });
    } catch (dbError) {
      console.error("資料庫操作失敗:", dbError);
      throw dbError;
    }
  } catch (error) {
    console.error("建立估價單失敗:", error);
    console.error("錯誤詳情:", error.message);
    console.error("錯誤堆疊:", error.stack);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// GET /api/quotes/:id - 根據 ID 獲取一個已儲存的估價單
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    console.log("查詢估價單 ID:", id);

    // 從資料庫查詢估價單
    const quote = await prisma.calculationQuote.findUnique({
      where: { id },
    });

    // 如果找不到估價單
    if (!quote) {
      console.log("找不到估價單:", id);
      return res.status(404).json({ error: "找不到此估價單" });
    }

    try {
      // 將 JSON 字串解析回物件
      const parsedResult = JSON.parse(quote.calculationResult);

      // 組合回傳結果
      const result = {
        id: quote.id,
        createdAt: quote.createdAt,
        calculationResult: parsedResult, // 重要：解析後的物件
      };

      console.log("成功取得估價單:", id);
      res.json(result);
    } catch (parseError) {
      console.error("解析 JSON 失敗:", parseError);
      // 如果解析失敗，嘗試直接回傳（相容舊資料）
      res.json(quote);
    }
  } catch (error) {
    console.error("獲取估價單失敗:", error);
    console.error("錯誤詳情:", error.message);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

module.exports = router;
