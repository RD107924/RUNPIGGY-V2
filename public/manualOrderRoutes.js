// manualOrderRoutes.js
const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();

/**
 * 手動建立訂單 API
 * POST /api/admin/orders/manual
 * 僅限已登入的工作人員使用
 */
router.post("/manual", async (req, res) => {
  try {
    const {
      // 客戶資訊
      recipientName,
      phone,
      email,
      lineNickname,
      address,
      idNumber,
      taxId,

      // 計算結果
      calculationResult,

      // 加值服務
      additionalServices,
      serviceNote,

      // 訂單設定
      status = "QUOTED",
      paymentStatus = "UNPAID",
      internalNote,

      // 系統標記
      createdBy = "STAFF",
      shareEnabled = true,
    } = req.body;

    // 驗證必要欄位
    if (!recipientName || !phone || !address || !calculationResult) {
      return res.status(400).json({
        error: "缺少必要欄位",
        required: ["recipientName", "phone", "address", "calculationResult"],
      });
    }

    // 產生分享 token
    const shareToken = crypto.randomBytes(32).toString("hex");

    // 建立訂單
    const order = await prisma.shipmentOrder.create({
      data: {
        // 客戶資訊
        recipientName,
        phone,
        email: email || null,
        lineNickname: lineNickname || "工作人員建立",
        address,
        idNumber: idNumber || null,
        taxId: taxId || null,

        // 計算結果（儲存為 JSON）
        calculationResult: calculationResult,

        // 加值服務
        additionalServices: additionalServices || null,
        serviceNote: serviceNote || null,

        // 訂單狀態
        status: status,
        paymentStatus: paymentStatus,

        // 內部資訊
        internalNote: internalNote || null,
        assignedToId: req.user ? req.user.id : null, // 指派給建立者

        // 分享功能
        shareToken: shareToken,
        shareEnabled: shareEnabled,

        // 系統標記
        source: createdBy, // 標記為員工建立

        // 如果已報價，記錄報價金額
        finalQuoteData:
          status === "QUOTED"
            ? {
                shipping: calculationResult.baseFreight || 0,
                remote: calculationResult.remoteFee || 0,
                overweight: calculationResult.overweightFee || 0,
                oversized: calculationResult.oversizedFee || 0,
                service: calculationResult.serviceFee || 0,
                total: calculationResult.totalAmount || 0,
              }
            : null,

        finalTotalAmount: calculationResult.totalAmount || 0,
      },
    });

    // 產生分享連結
    const shareUrl = `${req.protocol}://${req.get(
      "host"
    )}/order-share/${shareToken}`;

    // 記錄操作日誌
    console.log(
      `[手動建立訂單] ID: ${order.id}, 建立者: ${
        req.user?.username || "Unknown"
      }, 客戶: ${recipientName}`
    );

    res.status(201).json({
      success: true,
      message: "訂單建立成功",
      orderId: order.id,
      shareToken: shareToken,
      shareUrl: shareUrl,
      order: {
        id: order.id,
        recipientName: order.recipientName,
        phone: order.phone,
        address: order.address,
        status: order.status,
        paymentStatus: order.paymentStatus,
        totalAmount: order.finalTotalAmount,
        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    console.error("建立訂單失敗:", error);
    res.status(500).json({
      error: "建立訂單失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * 更新手動建立的訂單
 * PUT /api/admin/orders/manual/:orderId
 */
router.put("/manual/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;
    const updateData = req.body;

    // 檢查訂單是否存在
    const existingOrder = await prisma.shipmentOrder.findUnique({
      where: { id: parseInt(orderId) },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: "訂單不存在" });
    }

    // 只允許修改員工建立的訂單
    if (existingOrder.source !== "STAFF") {
      return res.status(403).json({
        error: "只能修改員工建立的訂單",
      });
    }

    // 更新訂單
    const updatedOrder = await prisma.shipmentOrder.update({
      where: { id: parseInt(orderId) },
      data: {
        // 更新客戶資訊
        recipientName: updateData.recipientName || existingOrder.recipientName,
        phone: updateData.phone || existingOrder.phone,
        email:
          updateData.email !== undefined
            ? updateData.email
            : existingOrder.email,
        address: updateData.address || existingOrder.address,

        // 更新計算結果
        calculationResult:
          updateData.calculationResult || existingOrder.calculationResult,

        // 更新狀態
        status: updateData.status || existingOrder.status,
        paymentStatus: updateData.paymentStatus || existingOrder.paymentStatus,

        // 更新備註
        internalNote:
          updateData.internalNote !== undefined
            ? updateData.internalNote
            : existingOrder.internalNote,

        // 更新金額
        finalTotalAmount:
          updateData.calculationResult?.totalAmount ||
          existingOrder.finalTotalAmount,

        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: "訂單更新成功",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("更新訂單失敗:", error);
    res.status(500).json({
      error: "更新訂單失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * 取得員工建立的訂單列表
 * GET /api/admin/orders/manual
 */
router.get("/manual", async (req, res) => {
  try {
    const orders = await prisma.shipmentOrder.findMany({
      where: {
        source: "STAFF",
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        recipientName: true,
        phone: true,
        address: true,
        status: true,
        paymentStatus: true,
        finalTotalAmount: true,
        shareToken: true,
        shareEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      count: orders.length,
      orders: orders,
    });
  } catch (error) {
    console.error("取得訂單列表失敗:", error);
    res.status(500).json({
      error: "取得訂單列表失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * 停用/啟用分享連結
 * PATCH /api/admin/orders/:orderId/share
 */
router.patch("/:orderId/share", async (req, res) => {
  try {
    const { orderId } = req.params;
    const { enabled } = req.body;

    const order = await prisma.shipmentOrder.update({
      where: { id: parseInt(orderId) },
      data: {
        shareEnabled: enabled,
        updatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `分享連結已${enabled ? "啟用" : "停用"}`,
      shareEnabled: order.shareEnabled,
    });
  } catch (error) {
    console.error("更新分享狀態失敗:", error);
    res.status(500).json({
      error: "更新分享狀態失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

/**
 * 重新產生分享連結
 * POST /api/admin/orders/:orderId/regenerate-share
 */
router.post("/:orderId/regenerate-share", async (req, res) => {
  try {
    const { orderId } = req.params;

    // 產生新的分享 token
    const newShareToken = crypto.randomBytes(32).toString("hex");

    const order = await prisma.shipmentOrder.update({
      where: { id: parseInt(orderId) },
      data: {
        shareToken: newShareToken,
        shareEnabled: true,
        updatedAt: new Date(),
      },
    });

    const shareUrl = `${req.protocol}://${req.get(
      "host"
    )}/order-share/${newShareToken}`;

    res.json({
      success: true,
      message: "分享連結已重新產生",
      shareToken: newShareToken,
      shareUrl: shareUrl,
    });
  } catch (error) {
    console.error("重新產生分享連結失敗:", error);
    res.status(500).json({
      error: "重新產生分享連結失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

module.exports = router;
