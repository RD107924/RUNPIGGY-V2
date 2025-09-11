// order-share.js - 訂單分享頁面邏輯
(function () {
  "use strict";

  // ===== 全域變數 =====
  let currentOrder = null;
  let shareToken = null;
  let viewCount = 0;
  let isLoading = false;

  // 銀行資訊配置（可依需求調整）
  const BANK_INFO = {
    bankName: "台灣銀行",
    bankCode: "004",
    accountNumber: "123-456-789-000",
    accountName: "小跑豬運輸有限公司",
    swiftCode: "BKTWTWTP",
  };

  // 聯絡資訊配置
  const CONTACT_INFO = {
    phone: "0800-123-456",
    line: "@runpiggy",
    email: "service@runpiggy.com",
    website: "https://www.runpiggy.com",
    address: "台北市信義區信義路五段7號",
  };

  // 狀態對應表
  const STATUS_MAP = {
    // 訂單狀態
    NEEDS_PURCHASE: { text: "需採購", color: "#ff9800", icon: "📋" },
    PURCHASED: { text: "已採購", color: "#2196f3", icon: "✅" },
    IN_WAREHOUSE: { text: "已入庫", color: "#4caf50", icon: "📦" },
    NOT_IN_WAREHOUSE: { text: "未入庫", color: "#f44336", icon: "❌" },
    SHIPPED: { text: "已發貨", color: "#9c27b0", icon: "🚚" },
    IN_CUSTOMS: { text: "清關中", color: "#ff5722", icon: "🛃" },
    DELIVERY_COMPLETE: { text: "派送完成", color: "#00bcd4", icon: "✨" },
    // 付款狀態
    PENDING: { text: "待付款", color: "#ff9800", icon: "⏳" },
    PAID: { text: "已付款", color: "#4caf50", icon: "✅" },
    FAILED: { text: "付款失敗", color: "#f44336", icon: "❌" },
    REFUNDED: { text: "已退款", color: "#9e9e9e", icon: "↩️" },
  };

  // ===== 初始化 =====
  document.addEventListener("DOMContentLoaded", function () {
    init();
  });

  function init() {
    // 取得分享 token
    shareToken = extractShareToken();
    if (!shareToken) {
      showError("無效的訂單連結", "請確認您的連結是否正確");
      return;
    }

    // 載入訂單資料
    loadOrderData();

    // 設定事件監聽器
    setupEventListeners();

    // 初始化動畫
    initAnimations();

    // 檢查深色模式
    checkDarkMode();
  }

  // ===== 工具函數 =====
  function extractShareToken() {
    // 從 URL 路徑取得 token
    const pathMatch = window.location.pathname.match(/\/order-share\/([^\/]+)/);
    if (pathMatch) {
      return pathMatch[1];
    }

    // 從 URL 參數取得 token（備用）
    const params = new URLSearchParams(window.location.search);
    return params.get("token") || null;
  }

  function formatDateTime(dateString) {
    if (!dateString) return "-";

    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    // 如果是今天
    if (diff < 86400000 && date.getDate() === now.getDate()) {
      return `今天 ${date.toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    // 如果是昨天
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.getDate() === yesterday.getDate()) {
      return `昨天 ${date.toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      })}`;
    }

    // 其他日期
    return date.toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatCurrency(amount) {
    if (typeof amount !== "number") {
      amount = parseFloat(amount) || 0;
    }

    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function formatNumber(num) {
    return new Intl.NumberFormat("zh-TW").format(num);
  }

  function calculateDaysRemaining(createdAt) {
    const created = new Date(createdAt);
    const deadline = new Date(created);
    deadline.setDate(deadline.getDate() + 3); // 3天期限

    const now = new Date();
    const diff = deadline - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    return days > 0 ? days : 0;
  }

  // ===== UI 控制函數 =====
  function showLoading(show = true) {
    const loadingEl = document.getElementById("loading-container");
    const orderEl = document.getElementById("order-card");
    const errorEl = document.getElementById("error-container");

    if (loadingEl) loadingEl.style.display = show ? "block" : "none";
    if (orderEl) orderEl.style.display = show ? "none" : "block";
    if (errorEl) errorEl.style.display = "none";

    isLoading = show;
  }

  function showError(title, message = "") {
    const loadingEl = document.getElementById("loading-container");
    const orderEl = document.getElementById("order-card");
    const errorEl = document.getElementById("error-container");

    if (loadingEl) loadingEl.style.display = "none";
    if (orderEl) orderEl.style.display = "none";
    if (errorEl) {
      errorEl.style.display = "block";

      const titleEl = errorEl.querySelector(".error-title");
      const messageEl = errorEl.querySelector(".error-message");

      if (titleEl) titleEl.textContent = title;
      if (messageEl)
        messageEl.textContent =
          message || "請確認您的連結是否正確，或聯繫客服人員。";
    }
  }

  function showToast(message, type = "success", duration = 3000) {
    // 移除現有的 toast
    const existingToast = document.querySelector(".toast-message");
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement("div");
    toast.className = "toast-message";

    // 選擇圖示
    let icon = "";
    let bgColor = "";
    switch (type) {
      case "success":
        icon = "✅";
        bgColor = "#4caf50";
        break;
      case "error":
        icon = "❌";
        bgColor = "#f44336";
        break;
      case "warning":
        icon = "⚠️";
        bgColor = "#ff9800";
        break;
      case "info":
        icon = "ℹ️";
        bgColor = "#2196f3";
        break;
      default:
        icon = "✅";
        bgColor = "#333";
    }

    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${bgColor};
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 350px;
      animation: slideInRight 0.3s ease-out;
      font-size: 14px;
      line-height: 1.4;
    `;

    toast.innerHTML = `
      <span style="font-size: 20px;">${icon}</span>
      <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // 自動移除
    setTimeout(() => {
      toast.style.animation = "slideOutRight 0.3s ease-out";
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ===== 資料載入 =====
  async function loadOrderData() {
    if (isLoading) return;

    showLoading(true);

    try {
      const response = await fetch(`/api/order-share/${shareToken}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("訂單不存在或連結已失效");
        } else if (response.status === 403) {
          throw new Error("您沒有權限查看此訂單");
        }
        throw new Error(`載入失敗 (錯誤代碼: ${response.status})`);
      }

      const data = await response.json();

      if (!data.success || !data.order) {
        throw new Error("訂單資料格式錯誤");
      }

      currentOrder = data.order;
      viewCount = data.viewCount || 1;

      // 顯示訂單資料
      displayOrderData(currentOrder);

      // 記錄查看
      logView();

      // 顯示成功訊息
      if (viewCount === 1) {
        showToast("訂單載入成功", "success");
      }
    } catch (error) {
      console.error("載入訂單失敗:", error);
      showError("無法載入訂單", error.message);
    } finally {
      showLoading(false);
    }
  }

  // ===== 顯示訂單資料 =====
  function displayOrderData(order) {
    if (!order) return;

    // 基本資訊
    displayBasicInfo(order);

    // 收件資訊
    displayRecipientInfo(order);

    // 商品明細
    displayOrderItems(order);

    // 價格明細
    displayPriceDetails(order);

    // 付款資訊
    displayPaymentInfo(order);

    // 狀態顯示
    updateOrderStatus(order);

    // 備註資訊
    displayNotes(order);

    // 顯示訂單卡片
    const orderCard = document.getElementById("order-card");
    if (orderCard) {
      orderCard.style.display = "block";
      orderCard.style.animation = "fadeIn 0.5s ease-out";
    }
  }

  function displayBasicInfo(order) {
    // 訂單編號
    const orderIdEl = document.getElementById("order-id");
    if (orderIdEl) {
      orderIdEl.textContent = order.id.substring(0, 8).toUpperCase() + "...";
      orderIdEl.title = order.id; // 完整 ID 作為提示
    }

    // 建立時間
    const orderDateEl = document.getElementById("order-date");
    if (orderDateEl) {
      orderDateEl.textContent = formatDateTime(order.createdAt);
    }

    // 剩餘付款天數（如果未付款）
    if (order.paymentStatus !== "PAID") {
      const daysRemaining = calculateDaysRemaining(order.createdAt);
      if (daysRemaining > 0) {
        const reminderEl = document.createElement("p");
        reminderEl.style.cssText =
          "color: #ff5722; font-weight: bold; margin-top: 10px;";
        reminderEl.textContent = `⏰ 剩餘付款時間：${daysRemaining} 天`;

        const headerEl = document.querySelector(".order-header");
        if (headerEl && !headerEl.querySelector(".payment-reminder")) {
          reminderEl.className = "payment-reminder";
          headerEl.appendChild(reminderEl);
        }
      }
    }
  }

  function displayRecipientInfo(order) {
    setElementText("recipient-name", order.recipientName);
    setElementText("recipient-phone", formatPhone(order.phone));
    setElementText("recipient-address", order.address);
    setElementText("recipient-email", order.email);

    // 如果有身分證或統編，也顯示（遮蔽部分資訊）
    if (order.idNumber) {
      addInfoRow("身分證字號", maskIdNumber(order.idNumber), "recipient-info");
    }
    if (order.taxId) {
      addInfoRow("統一編號", order.taxId, "recipient-info");
    }
  }

  function displayOrderItems(order) {
    const container = document.getElementById("items-container");
    if (!container) return;

    let itemsHTML = "";

    if (order.sourceParcel) {
      // 從包裹轉換的訂單
      itemsHTML = createParcelItem(order.sourceParcel, order);
    } else if (order.calculationResult) {
      // 一般訂單
      const items = order.calculationResult.allItemsData || [];
      itemsHTML = items.map((item) => createOrderItem(item)).join("");
    }

    container.innerHTML = itemsHTML || '<p style="color: #999;">無商品資料</p>';

    // 添加動畫
    container.querySelectorAll(".item-card").forEach((card, index) => {
      card.style.animation = `slideIn 0.3s ease-out ${index * 0.1}s both`;
    });
  }

  function createParcelItem(parcel, order) {
    return `
      <div class="item-card">
        <div class="item-header">
          <span class="item-name">${escapeHtml(parcel.productName)}</span>
          <span class="item-quantity">數量: ${parcel.quantity}</span>
        </div>
        <div class="item-details">
          <div class="item-detail">
            <span class="item-detail-label">物流單號</span>
            <span class="item-detail-value">${escapeHtml(
              parcel.trackingNumber
            )}</span>
          </div>
          ${
            order.actualWeight
              ? `
            <div class="item-detail">
              <span class="item-detail-label">實際重量</span>
              <span class="item-detail-value">${order.actualWeight} kg</span>
            </div>
          `
              : ""
          }
          ${
            order.actualLength && order.actualWidth && order.actualHeight
              ? `
            <div class="item-detail">
              <span class="item-detail-label">實際尺寸</span>
              <span class="item-detail-value">
                ${order.actualLength} × ${order.actualWidth} × ${order.actualHeight} cm
              </span>
            </div>
          `
              : ""
          }
          ${
            order.actualCbm
              ? `
            <div class="item-detail">
              <span class="item-detail-label">材積</span>
              <span class="item-detail-value">${order.actualCbm.toFixed(
                4
              )} m³</span>
            </div>
          `
              : ""
          }
        </div>
        ${
          order.protectionNeeded
            ? `
          <div class="protection-notice" style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 6px;">
            <strong style="color: #856404;">🛡️ 已加強保護</strong>
            ${
              order.protectionNote
                ? `<p style="margin: 5px 0 0; color: #856404; font-size: 0.9em;">${escapeHtml(
                    order.protectionNote
                  )}</p>`
                : ""
            }
          </div>
        `
            : ""
        }
      </div>
    `;
  }

  function createOrderItem(item) {
    return `
      <div class="item-card">
        <div class="item-header">
          <span class="item-name">${escapeHtml(item.itemName || "商品")}</span>
          <span class="item-quantity">數量: ${item.quantity || 1}</span>
        </div>
        <div class="item-details">
          <div class="item-detail">
            <span class="item-detail-label">重量</span>
            <span class="item-detail-value">${item.weight || 0} kg</span>
          </div>
          <div class="item-detail">
            <span class="item-detail-label">尺寸</span>
            <span class="item-detail-value">
              ${item.length || 0} × ${item.width || 0} × ${item.height || 0} cm
            </span>
          </div>
          ${
            item.cbm
              ? `
            <div class="item-detail">
              <span class="item-detail-label">材積</span>
              <span class="item-detail-value">${item.cbm.toFixed(4)} m³</span>
            </div>
          `
              : ""
          }
        </div>
      </div>
    `;
  }

  function displayPriceDetails(order) {
    let shipping = 0;
    let service = 0;
    let protection = 0;
    let other = 0;
    let total = order.finalTotalAmount || order.totalAmount || 0;

    // 解析價格資料
    if (order.finalQuoteData) {
      shipping = order.finalQuoteData.shipping || 0;
      service = order.finalQuoteData.service || 0;
      protection = order.finalQuoteData.protection || 0;
      other = order.finalQuoteData.other || 0;
    } else if (order.calculationResult) {
      const result = order.calculationResult;
      shipping = result.finalSeaFreightCost || result.finalTotal || 0;

      if (result.remoteFee) {
        other = result.remoteFee;
      }
    }

    // 加值服務費用
    if (order.serviceQuoteAmount) {
      service += order.serviceQuoteAmount;
    }

    // 加強保護費用
    if (order.protectionPrice) {
      protection = order.protectionPrice;
    }

    // 更新顯示
    updatePriceDisplay("shipping-fee", shipping);
    updatePriceDisplay("service-fee", service);

    // 條件顯示
    if (protection > 0) {
      showPriceRow("protection-row", "protection-fee", protection);
    }

    if (other > 0) {
      showPriceRow("other-row", "other-fee", other);
    }

    // 總計
    updatePriceDisplay("total-amount", total);
    updatePriceDisplay("payment-amount", total);

    // 儲存金額供複製使用
    window.orderTotalAmount = total;
  }

  function displayPaymentInfo(order) {
    const paymentSection = document.querySelector(".payment-section");
    const agreementSection = document.querySelector(".agreement-section");

    if (!paymentSection) return;

    if (order.paymentStatus === "PAID") {
      // 已付款，隱藏付款資訊
      paymentSection.style.display = "none";
      if (agreementSection) {
        agreementSection.style.display = "none";
      }

      // 顯示已付款訊息
      const paidNotice = document.createElement("div");
      paidNotice.className = "paid-notice";
      paidNotice.style.cssText = `
        background: #e8f5e9;
        border: 2px solid #4caf50;
        border-radius: 12px;
        padding: 25px;
        text-align: center;
        margin: 30px 0;
      `;
      paidNotice.innerHTML = `
        <h3 style="color: #2e7d32; margin-top: 0;">✅ 已完成付款</h3>
        <p style="color: #555; margin: 10px 0;">
          付款時間：${formatDateTime(order.paidAt)}
        </p>
        <p style="color: #666; margin-bottom: 0;">
          我們已收到您的款項，訂單正在處理中
        </p>
      `;

      paymentSection.parentNode.insertBefore(paidNotice, paymentSection);
    } else {
      // 更新銀行資訊
      updateBankInfo();

      // 更新付款期限提醒
      updatePaymentDeadline(order);
    }
  }

  function displayNotes(order) {
    // 顯示備註（如果有）
    if (order.quoteNote || order.customerNote || order.adminNote) {
      const notesSection = document.createElement("div");
      notesSection.className = "info-section";
      notesSection.innerHTML = "<h3>📝 備註說明</h3>";

      if (order.quoteNote) {
        notesSection.innerHTML += `
          <div class="info-row">
            <span class="info-label">報價說明：</span>
            <span class="info-value">${escapeHtml(order.quoteNote)}</span>
          </div>
        `;
      }

      if (order.customerNote) {
        notesSection.innerHTML += `
          <div class="info-row">
            <span class="info-label">客戶備註：</span>
            <span class="info-value">${escapeHtml(order.customerNote)}</span>
          </div>
        `;
      }

      const contentEl = document.querySelector(".order-content");
      const paymentSection = document.querySelector(".payment-section");
      if (contentEl && paymentSection) {
        contentEl.insertBefore(notesSection, paymentSection);
      }
    }
  }

  function updateOrderStatus(order) {
    // 訂單狀態
    const orderStatusEl = document.getElementById("order-status");
    if (orderStatusEl && STATUS_MAP[order.status]) {
      const status = STATUS_MAP[order.status];
      orderStatusEl.textContent = `${status.icon} ${status.text}`;
      orderStatusEl.style.backgroundColor = status.color + "20";
      orderStatusEl.style.color = status.color;
    }

    // 付款狀態
    const paymentStatusEl = document.getElementById("payment-status");
    if (paymentStatusEl && STATUS_MAP[order.paymentStatus]) {
      const status = STATUS_MAP[order.paymentStatus];
      paymentStatusEl.textContent = `${status.icon} ${status.text}`;
      paymentStatusEl.className = `status-badge payment-${order.paymentStatus.toLowerCase()}`;
    }
  }

  // ===== 事件處理 =====
  function setupEventListeners() {
    // 列印按鈕
    const printBtn = document.querySelector('[onclick="printOrder()"]');
    if (printBtn) {
      printBtn.removeAttribute("onclick");
      printBtn.addEventListener("click", handlePrint);
    }

    // 確認付款按鈕
    const confirmBtn = document.querySelector('[onclick="confirmPayment()"]');
    if (confirmBtn) {
      confirmBtn.removeAttribute("onclick");
      confirmBtn.addEventListener("click", handleConfirmPayment);
    }

    // 複製按鈕
    document.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", handleCopy);
    });

    // 返回首頁按鈕
    const homeBtn = document.querySelector('[onclick*="location.href"]');
    if (homeBtn) {
      homeBtn.removeAttribute("onclick");
      homeBtn.addEventListener("click", () => {
        window.location.href = "/";
      });
    }

    // 自動重新載入（每30秒檢查狀態更新）
    setInterval(() => {
      if (!isLoading && currentOrder && currentOrder.paymentStatus !== "PAID") {
        loadOrderData();
      }
    }, 30000);
  }

  function handlePrint(e) {
    e.preventDefault();

    // 記錄列印動作
    logAction("print");

    // 執行列印
    window.print();

    showToast("準備列印訂單...", "info");
  }

  function handleConfirmPayment(e) {
    e.preventDefault();

    const confirmMessage = `
請確認以下資訊：
1. 已匯款金額：${formatCurrency(window.orderTotalAmount || 0)}
2. 匯款帳號後5碼

確認後我們將盡快為您處理訂單。
    `.trim();

    if (confirm(confirmMessage)) {
      // 記錄確認動作
      logAction("payment_confirmed");

      showToast(
        "感謝您的付款通知！我們已收到您的確認，將盡快核對款項並處理訂單。",
        "success",
        5000
      );

      // 可以在這裡加入通知後端的邏輯
      notifyPaymentConfirmation();
    }
  }

  function handleCopy(e) {
    e.preventDefault();

    const btn = e.target;
    const text =
      btn.getAttribute("data-copy") ||
      btn.previousElementSibling?.textContent?.trim();

    if (!text) return;

    copyToClipboard(text).then(() => {
      const originalText = btn.textContent;
      btn.textContent = "已複製";
      btn.style.backgroundColor = "#4caf50";

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.backgroundColor = "";
      }, 2000);
    });
  }

  // ===== 輔助函數 =====
  function setElementText(id, text) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text || "-";
    }
  }

  function updatePriceDisplay(id, amount) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = formatCurrency(amount);

      // 如果金額為0，變更顏色
      if (amount === 0) {
        element.style.color = "#999";
      }
    }
  }

  function showPriceRow(rowId, priceId, amount) {
    const row = document.getElementById(rowId);
    const price = document.getElementById(priceId);

    if (row) {
      row.style.display = amount > 0 ? "flex" : "none";
    }
    if (price) {
      price.textContent = formatCurrency(amount);
    }
  }

  function addInfoRow(label, value, containerId) {
    const container = document.querySelector(`.info-section#${containerId}`);
    if (!container) return;

    const row = document.createElement("div");
    row.className = "info-row";
    row.innerHTML = `
      <span class="info-label">${escapeHtml(label)}：</span>
      <span class="info-value">${escapeHtml(value)}</span>
    `;

    container.appendChild(row);
  }

  function updateBankInfo() {
    // 更新銀行資訊顯示
    const bankInfoEl = document.querySelector(".bank-info");
    if (!bankInfoEl) return;

    bankInfoEl.innerHTML = `
      <div class="bank-info-row">
        <span class="bank-label">銀行名稱：</span>
        <span class="bank-value">
          ${BANK_INFO.bankName}（${BANK_INFO.bankCode}）
          <button class="copy-btn" data-copy="${
            BANK_INFO.bankName
          }">複製</button>
        </span>
      </div>
      <div class="bank-info-row">
        <span class="bank-label">帳號：</span>
        <span class="bank-value">
          ${BANK_INFO.accountNumber}
          <button class="copy-btn" data-copy="${BANK_INFO.accountNumber.replace(
            /-/g,
            ""
          )}">複製</button>
        </span>
      </div>
      <div class="bank-info-row">
        <span class="bank-label">戶名：</span>
        <span class="bank-value">
          ${BANK_INFO.accountName}
          <button class="copy-btn" data-copy="${
            BANK_INFO.accountName
          }">複製</button>
        </span>
      </div>
      <div class="bank-info-row">
        <span class="bank-label">匯款金額：</span>
        <span class="bank-value" style="color: #d32f2f; font-size: 1.2em;">
          <span id="payment-amount">${formatCurrency(
            window.orderTotalAmount || 0
          )}</span>
          <button class="copy-btn" onclick="copyAmount()">複製</button>
        </span>
      </div>
    `;

    // 重新綁定複製按鈕事件
    bankInfoEl.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", handleCopy);
    });
  }

  function updatePaymentDeadline(order) {
    const daysRemaining = calculateDaysRemaining(order.createdAt);
    const noticeEl = document.querySelector(".important-notice ul");

    if (noticeEl && daysRemaining >= 0) {
      const firstLi = noticeEl.querySelector("li");
      if (firstLi) {
        if (daysRemaining === 0) {
          firstLi.innerHTML =
            '⚠️ <strong style="color: #d32f2f;">今天是最後付款期限！</strong>';
        } else {
          firstLi.innerHTML = `請於 <strong>${daysRemaining} 個工作天內</strong> 完成匯款`;
        }
      }
    }
  }

  function formatPhone(phone) {
    if (!phone) return "-";

    // 移除所有非數字字符
    const cleaned = phone.replace(/\D/g, "");

    // 格式化為 0900-000-000
    if (cleaned.length === 10 && cleaned.startsWith("09")) {
      return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(
        7
      )}`;
    }

    return phone;
  }

  function maskIdNumber(idNumber) {
    if (!idNumber) return "-";

    // 保留前3碼和後2碼
    if (idNumber.length >= 5) {
      return (
        idNumber.substring(0, 3) +
        "****" +
        idNumber.substring(idNumber.length - 2)
      );
    }

    return idNumber;
  }

  function escapeHtml(text) {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return text ? text.replace(/[&<>"']/g, (m) => map[m]) : "";
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // 備用方案
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      showToast("已複製到剪貼簿", "success");
    } catch (err) {
      console.error("複製失敗:", err);
      showToast("複製失敗，請手動複製", "error");
    }
  }

  // ===== API 互動 =====
  async function notifyPaymentConfirmation() {
    if (!currentOrder) return;

    try {
      // 發送付款確認通知到後端（如果有相應的 API）
      const response = await fetch(
        `/api/order-share/${shareToken}/confirm-payment`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            orderId: currentOrder.id,
            timestamp: new Date().toISOString(),
          }),
        }
      );

      if (response.ok) {
        console.log("付款確認已通知");
      }
    } catch (error) {
      console.log("通知失敗，但不影響使用者體驗");
    }
  }

  function logAction(action) {
    // 記錄使用者動作（用於分析）
    try {
      const data = {
        action: action,
        orderId: currentOrder?.id,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
      };

      // 可以發送到分析服務
      console.log("User action:", data);
    } catch (error) {
      // 忽略錯誤
    }
  }

  function logView() {
    console.log(`訂單查看次數: ${viewCount}`);

    // 如果是第一次查看，顯示歡迎訊息
    if (viewCount === 1) {
      setTimeout(() => {
        showToast("歡迎查看您的訂單詳情", "info");
      }, 1000);
    }
  }

  // ===== 進階功能 =====
  function initAnimations() {
    // 添加 CSS 動畫
    if (!document.getElementById("order-share-styles")) {
      const style = document.createElement("style");
      style.id = "order-share-styles";
      style.textContent = `
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        .pulse-animation {
          animation: pulse 2s infinite;
        }
      `;
      document.head.appendChild(style);
    }
  }

  function checkDarkMode() {
    // 檢查系統深色模式
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      console.log("深色模式已偵測");
      // 可以在這裡添加深色模式支援
    }

    // 監聽深色模式變化
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", (e) => {
        console.log("深色模式切換:", e.matches ? "開啟" : "關閉");
      });
  }

  // ===== 全域函數（供 HTML 呼叫）=====
  window.copyText = function (text) {
    copyToClipboard(text);
  };

  window.copyAmount = function () {
    const amount = window.orderTotalAmount || 0;
    copyToClipboard(amount.toString());
  };

  window.printOrder = handlePrint;
  window.confirmPayment = handleConfirmPayment;

  // ===== 匯出模組 =====
  window.OrderShare = {
    init: init,
    reload: loadOrderData,
    getCurrentOrder: () => currentOrder,
    getViewCount: () => viewCount,
    showToast: showToast,
    formatCurrency: formatCurrency,
    formatDateTime: formatDateTime,
  };
})();
