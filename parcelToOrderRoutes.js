// parcelToOrderRoutes.js - 包裹轉訂單功能路由
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");

const router = express.Router();
const prisma = new PrismaClient();

// === 認證中間件（相容現有系統）===
const authenticateOperator = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "需要操作員或管理員權限" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 檢查是否為員工（非會員）
    if (decoded.type === "customer") {
      return res.status(403).json({ error: "會員無法執行此操作" });
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
      // 向後相容：如果沒有 role 欄位但有 id，也允許（舊版 token）
      if (decoded.id) {
        req.user = decoded;
        next();
      } else {
        return res.status(403).json({ error: "權限不足" });
      }
    }
  } catch (error) {
    return res.status(401).json({ error: "認證失敗" });
  }
};

// === 檢查包裹是否可以轉換 ===
router.get("/check/:parcelId", authenticateOperator, async (req, res) => {
  try {
    const { parcelId } = req.params;

    const parcel = await prisma.parcelNotification.findUnique({
      where: { id: parcelId },
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
          },
        },
      },
    });

    if (!parcel) {
      return res.status(404).json({ error: "找不到此包裹預報" });
    }

    // 檢查是否可以轉換
    const canConvert = parcel.status === "ARRIVED" && !parcel.isConverted;

    res.json({
      canConvert,
      parcel: {
        ...parcel,
        productImages: JSON.parse(parcel.productImages || "[]"),
      },
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
});

// === 轉換包裹為訂單 ===
router.post("/convert/:parcelId", authenticateOperator, async (req, res) => {
  try {
    const { parcelId } = req.params;
    const {
      // 實際測量數據
      actualWeight,
      actualLength,
      actualWidth,
      actualHeight,
      // 加強保護
      protectionNeeded,
      protectionPrice,
      protectionNote,
      // 最終報價
      finalQuoteData,
      finalTotalAmount,
      quoteNote,
      // 額外服務
      additionalServices,
    } = req.body;

    // 檢查包裹是否存在且可以轉換
    const parcel = await prisma.parcelNotification.findUnique({
      where: { id: parcelId },
      include: {
        customer: true,
      },
    });

    if (!parcel) {
      return res.status(404).json({ error: "找不到此包裹預報" });
    }

    if (parcel.status !== "ARRIVED") {
      return res.status(400).json({
        error: `包裹狀態必須為 ARRIVED 才能轉換，目前狀態為 ${parcel.status}`,
      });
    }

    if (parcel.isConverted) {
      return res.status(400).json({
        error: "此包裹已經轉換為訂單",
        orderId: parcel.convertedOrderId,
      });
    }

    // 準備收件人資訊
    let recipientInfo = {};
    if (parcel.customer) {
      // 會員資料
      recipientInfo = {
        recipientName: parcel.customer.name,
        address: parcel.customer.defaultAddress || "待確認",
        phone: parcel.customer.phone || "待確認",
        email: parcel.customer.email,
        idNumber: parcel.customer.idNumber,
        taxId: parcel.customer.taxId,
        lineNickname: parcel.customer.lineNickname,
      };
    } else {
      // 訪客資料
      recipientInfo = {
        recipientName: parcel.guestName || "訪客",
        address: "待確認",
        phone: parcel.guestPhone || "待確認",
        email: parcel.guestEmail || "pending@example.com",
        idNumber: null,
        taxId: null,
        lineNickname: null,
      };
    }

    // 計算實際材積
    let actualCbm = null;
    if (actualLength && actualWidth && actualHeight) {
      actualCbm = (actualLength * actualWidth * actualHeight) / 1000000; // 轉換為立方米
    }

    // 準備計算結果（基礎結構）
    const calculationResult = {
      allItemsData: [
        {
          itemName: parcel.productName,
          quantity: parcel.quantity,
          weight: actualWeight || 0,
          length: actualLength || 0,
          width: actualWidth || 0,
          height: actualHeight || 0,
          cbm: actualCbm || 0,
        },
      ],
      totalShipmentVolume: actualCbm || 0,
      totalCbm: actualCbm || 0,
      initialSeaFreightCost: 0,
      finalSeaFreightCost: 0,
      remoteAreaRate: 0,
      remoteFee: 0,
      hasOversizedItem: false,
      finalTotal: finalTotalAmount || 0,
    };

    // 開始交易
    const result = await prisma.$transaction(async (tx) => {
      // 1. 創建訂單
      const order = await tx.shipmentOrder.create({
        data: {
          // 收件人資訊
          ...recipientInfo,
          // 訂單內容
          calculationResult: JSON.stringify(calculationResult),
          totalAmount: finalTotalAmount,
          // 來源包裹
          sourceParcelId: parcelId,
          // 實際測量數據
          actualWeight,
          actualLength,
          actualWidth,
          actualHeight,
          actualCbm,
          // 加強保護
          protectionNeeded: protectionNeeded || false,
          protectionPrice,
          protectionNote,
          // 最終報價
          finalQuoteData: finalQuoteData
            ? JSON.stringify(finalQuoteData)
            : null,
          finalTotalAmount,
          quoteNote,
          quoteValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天有效期
          // 額外服務
          additionalServices: additionalServices
            ? JSON.stringify(additionalServices)
            : null,
          // 關聯
          customerId: parcel.customerId,
          assignedToId: req.user.id,
          // 分享功能
          shareCreatedAt: new Date(),
          // 狀態
          status: "NEEDS_PURCHASE",
          paymentStatus: "PENDING",
        },
      });

      // 2. 更新包裹狀態
      await tx.parcelNotification.update({
        where: { id: parcelId },
        data: {
          isConverted: true,
          convertedAt: new Date(),
          convertedBy: req.user.id,
          convertedOrderId: order.id,
          status: "COMPLETED", // 可選：將包裹狀態更新為已完成
        },
      });

      // 3. 記錄操作日誌（如果有 OrderOperationLog 表）
      try {
        await tx.orderOperationLog.create({
          data: {
            orderId: order.id,
            operatorId: req.user.id,
            action: "CONVERT_FROM_PARCEL",
            details: JSON.stringify({
              parcelId,
              originalStatus: parcel.status,
              operatorName: req.user.username,
              timestamp: new Date(),
            }),
            ipAddress: req.ip || req.connection?.remoteAddress,
            userAgent: req.headers["user-agent"],
          },
        });
      } catch (logError) {
        // 如果沒有日誌表，忽略錯誤
        console.log("操作日誌記錄失敗（可能表不存在）:", logError.message);
      }

      return order;
    });

    // 記錄到 console
    console.log(
      `[包裹轉訂單] ${new Date().toISOString()} - 操作員 ${
        req.user.username || req.user.id
      } 將包裹 ${parcelId} 轉換為訂單 ${result.id}`
    );

    res.status(201).json({
      success: true,
      message: "包裹已成功轉換為訂單",
      order: {
        id: result.id,
        shareToken: result.shareToken,
        shareUrl: `${req.protocol}://${req.get("host")}/order-share/${
          result.shareToken
        }`,
        createdAt: result.createdAt,
      },
    });
  } catch (error) {
    console.error("轉換包裹為訂單失敗:", error);
    res.status(500).json({
      error: "轉換失敗",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// === 更新訂單資訊（轉換後的調整）===
router.put("/update/:orderId", authenticateOperator, async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      // 實際測量數據
      actualWeight,
      actualLength,
      actualWidth,
      actualHeight,
      // 加強保護
      protectionNeeded,
      protectionPrice,
      protectionNote,
      // 最終報價
      finalQuoteData,
      finalTotalAmount,
      quoteNote,
      // 管理備註
      adminNote,
    } = req.body;

    // 檢查訂單是否存在
    const order = await prisma.shipmentOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        sourceParcelId: true,
        paymentStatus: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "找不到此訂單" });
    }

    if (order.paymentStatus === "PAID") {
      return res.status(400).json({ error: "已付款的訂單無法修改" });
    }

    // 計算實際材積
    let actualCbm = null;
    if (actualLength && actualWidth && actualHeight) {
      actualCbm = (actualLength * actualWidth * actualHeight) / 1000000;
    }

    // 準備更新數據
    const updateData = {};

    if (actualWeight !== undefined) updateData.actualWeight = actualWeight;
    if (actualLength !== undefined) updateData.actualLength = actualLength;
    if (actualWidth !== undefined) updateData.actualWidth = actualWidth;
    if (actualHeight !== undefined) updateData.actualHeight = actualHeight;
    if (actualCbm !== undefined) updateData.actualCbm = actualCbm;

    if (protectionNeeded !== undefined)
      updateData.protectionNeeded = protectionNeeded;
    if (protectionPrice !== undefined)
      updateData.protectionPrice = protectionPrice;
    if (protectionNote !== undefined)
      updateData.protectionNote = protectionNote;

    if (finalQuoteData !== undefined)
      updateData.finalQuoteData = JSON.stringify(finalQuoteData);
    if (finalTotalAmount !== undefined)
      updateData.finalTotalAmount = finalTotalAmount;
    if (quoteNote !== undefined) updateData.quoteNote = quoteNote;

    if (adminNote !== undefined) updateData.adminNote = adminNote;

    updateData.updatedAt = new Date();

    // 更新訂單
    const updatedOrder = await prisma.shipmentOrder.update({
      where: { id: orderId },
      data: updateData,
    });

    // 記錄操作日誌
    try {
      await prisma.orderOperationLog.create({
        data: {
          orderId,
          operatorId: req.user.id,
          action: "UPDATE_ORDER",
          previousValue: JSON.stringify(order),
          newValue: JSON.stringify(updateData),
          details: JSON.stringify({
            updateType: "MANUAL_ADJUSTMENT",
            operatorName: req.user.username,
            timestamp: new Date(),
          }),
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.headers["user-agent"],
        },
      });
    } catch (logError) {
      console.log("操作日誌記錄失敗:", logError.message);
    }

    res.json({
      success: true,
      message: "訂單已更新",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("更新訂單失敗:", error);
    res.status(500).json({ error: "更新失敗" });
  }
});

// === 生成/重新生成分享連結 ===
router.post("/share/:orderId", authenticateOperator, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { regenerate } = req.body;

    // 檢查訂單是否存在
    const order = await prisma.shipmentOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        shareToken: true,
        recipientName: true,
        finalTotalAmount: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "找不到此訂單" });
    }

    let shareToken = order.shareToken;

    // 如果需要重新生成或沒有 token
    if (regenerate || !shareToken) {
      const { randomBytes } = require("crypto");
      shareToken = randomBytes(32).toString("hex");

      await prisma.shipmentOrder.update({
        where: { id: orderId },
        data: {
          shareToken,
          shareCreatedAt: new Date(),
          shareViewCount: 0,
        },
      });

      console.log(
        `[分享連結] ${new Date().toISOString()} - 操作員 ${
          req.user.username || req.user.id
        } 為訂單 ${orderId} ${regenerate ? "重新" : ""}生成分享連結`
      );
    }

    const shareUrl = `${req.protocol}://${req.get(
      "host"
    )}/order-share/${shareToken}`;

    res.json({
      success: true,
      shareToken,
      shareUrl,
      message: `分享連結已${regenerate ? "重新" : ""}生成`,
      orderInfo: {
        id: order.id,
        recipientName: order.recipientName,
        amount: order.finalTotalAmount,
      },
    });
  } catch (error) {
    console.error("生成分享連結失敗:", error);
    res.status(500).json({ error: "生成分享連結失敗" });
  }
});

// === 取得訂單詳情（操作員用）===
router.get("/order/:orderId", authenticateOperator, async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await prisma.shipmentOrder.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        sourceParcel: {
          select: {
            id: true,
            trackingNumber: true,
            productName: true,
            quantity: true,
            productImages: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            username: true,
            fullName: true,
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({ error: "找不到此訂單" });
    }

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
      sourceParcel: order.sourceParcel
        ? {
            ...order.sourceParcel,
            productImages: JSON.parse(order.sourceParcel.productImages || "[]"),
          }
        : null,
    };

    res.json(orderData);
  } catch (error) {
    console.error("取得訂單詳情失敗:", error);
    res.status(500).json({ error: "伺服器內部錯誤" });
  }
});

// === 標記訂單已付款 ===
router.post("/mark-paid/:orderId", authenticateOperator, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { paymentMethod, paymentNote, invoiceNumber } = req.body;

    const order = await prisma.shipmentOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        paymentStatus: true,
      },
    });

    if (!order) {
      return res.status(404).json({ error: "找不到此訂單" });
    }

    if (order.paymentStatus === "PAID") {
      return res.status(400).json({ error: "此訂單已標記為已付款" });
    }

    const updatedOrder = await prisma.shipmentOrder.update({
      where: { id: orderId },
      data: {
        paymentStatus: "PAID",
        paidAt: new Date(),
        paymentMethod: paymentMethod || "TRANSFER",
        customerNote: paymentNote,
        invoiceNumber,
        status: "PURCHASED", // 更新訂單狀態為已採購
      },
    });

    // 記錄操作日誌
    try {
      await prisma.orderOperationLog.create({
        data: {
          orderId,
          operatorId: req.user.id,
          action: "MARK_PAID",
          details: JSON.stringify({
            paymentMethod,
            paymentNote,
            invoiceNumber,
            operatorName: req.user.username,
            timestamp: new Date(),
          }),
        },
      });
    } catch (logError) {
      console.log("操作日誌記錄失敗:", logError.message);
    }

    console.log(
      `[付款確認] ${new Date().toISOString()} - 操作員 ${
        req.user.username || req.user.id
      } 標記訂單 ${orderId} 為已付款`
    );

    res.json({
      success: true,
      message: "訂單已標記為已付款",
      order: updatedOrder,
    });
  } catch (error) {
    console.error("標記付款失敗:", error);
    res.status(500).json({ error: "標記付款失敗" });
  }
});

// === 取得轉換統計 ===
router.get("/stats", authenticateOperator, async (req, res) => {
  try {
    const [
      totalConverted,
      pendingPayment,
      paidOrders,
      todayConverted,
      thisMonthConverted,
    ] = await Promise.all([
      // 總轉換數
      prisma.parcelNotification.count({
        where: { isConverted: true },
      }),
      // 待付款
      prisma.shipmentOrder.count({
        where: {
          sourceParcelId: { not: null },
          paymentStatus: "PENDING",
        },
      }),
      // 已付款
      prisma.shipmentOrder.count({
        where: {
          sourceParcelId: { not: null },
          paymentStatus: "PAID",
        },
      }),
      // 今日轉換
      prisma.parcelNotification.count({
        where: {
          isConverted: true,
          convertedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      // 本月轉換
      prisma.parcelNotification.count({
        where: {
          isConverted: true,
          convertedAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
    ]);

    res.json({
      totalConverted,
      pendingPayment,
      paidOrders,
      todayConverted,
      thisMonthConverted,
      conversionRate: await calculateConversionRate(),
    });
  } catch (error) {
    console.error("取得統計資料失敗:", error);
    res.status(500).json({ error: "取得統計資料失敗" });
  }
});

// 計算轉換率輔助函數
async function calculateConversionRate() {
  try {
    const [arrivedCount, convertedCount] = await Promise.all([
      prisma.parcelNotification.count({
        where: { status: "ARRIVED" },
      }),
      prisma.parcelNotification.count({
        where: {
          status: "ARRIVED",
          isConverted: true,
        },
      }),
    ]);

    if (arrivedCount === 0) return 0;
    return Math.round((convertedCount / arrivedCount) * 100);
  } catch (error) {
    return 0;
  }
}

// === 測試路由 ===
router.get("/test", (req, res) => {
  res.json({
    message: "包裹轉訂單路由運作正常",
    timestamp: new Date().toISOString(),
    endpoints: [
      "GET /check/:parcelId - 檢查包裹是否可以轉換",
      "POST /convert/:parcelId - 轉換包裹為訂單",
      "PUT /update/:orderId - 更新訂單資訊",
      "POST /share/:orderId - 生成分享連結",
      "GET /order/:orderId - 取得訂單詳情",
      "POST /mark-paid/:orderId - 標記訂單已付款",
      "GET /stats - 取得轉換統計",
    ],
  });
});

module.exports = router;
