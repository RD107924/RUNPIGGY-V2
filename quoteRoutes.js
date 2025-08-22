// quoteRoutes.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const router = express.Router();

// POST /api/quotes - 建立一個新的估價單分享
router.post("/", async (req, res) => {
  try {
    const { calculationResult } = req.body;
    if (!calculationResult) {
      return res.status(400).json({ error: "缺少計算結果" });
    }

    const quote = await prisma.calculationQuote.create({
      data: {
        calculationResult: calculationResult,
      },
    });

    // 只回傳新建立的 ID
    res.status(201).json({ id: quote.id });
  } catch (error) {
    console.error("建立估價單失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// GET /api/quotes/:id - 根據 ID 獲取一個已儲存的估價單
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const quote = await prisma.calculationQuote.findUnique({
      where: { id },
    });

    if (!quote) {
      return res.status(404).json({ error: "找不到此估價單" });
    }

    res.json(quote);
  } catch (error) {
    console.error("獲取估價單失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

module.exports = router;
