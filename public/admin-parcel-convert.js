// admin-parcel-convert.js - 包裹轉訂單管理介面邏輯
(function () {
  "use strict";

  // ===== 全域變數 =====
  let currentParcel = null;
  let currentOrder = null;
  let isConverting = false;
  let parcelId = null;

  // API 配置
  const API_BASE = "/api/parcel-to-order";
  const token = localStorage.getItem("authToken");

  // 如果沒有 token，重定向到登入頁
  if (!token) {
    window.location.href = "/login.html";
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // ===== 狀態對應表 =====
  const STATUS_MAP = {
    PENDING: "待確認",
    CONFIRMED: "已確認",
    ARRIVED: "已到倉",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };

  const STATUS_COLORS = {
    PENDING: "#d63031",
    CONFIRMED: "#00b894",
    ARRIVED: "#88e309ff",
    COMPLETED: "#00cec9",
    CANCELLED: "#e74c3c",
  };

  // ===== 初始化 =====
  document.addEventListener("DOMContentLoaded", function () {
    init();
  });

  function init() {
    // 取得包裹 ID
    parcelId = extractParcelId();
    if (!parcelId) {
      showAlert("error", "無效的包裹 ID");
      return;
    }

    // 載入包裹資料
    loadParcelData();

    // 設定事件監聽器
    setupEventListeners();

    // 初始化價格摘要
    updatePriceSummary();
  }

  // ===== 工具函數 =====
  function extractParcelId() {
    const pathParts = window.location.pathname.split("/");
    return pathParts[pathParts.length - 1] || null;
  }

  function getFullImageUrl(imagePath) {
    if (!imagePath) return "/assets/no-image.png";
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      return imagePath;
    }
    const baseUrl = window.location.origin;
    const path = imagePath.startsWith("/") ? imagePath : "/" + imagePath;
    return baseUrl + path;
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  function formatDateTime(dateString) {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("zh-TW", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // ===== UI 輔助函數 =====
  function showLoading(show = true) {
    const loadingEl = document.getElementById("loading");
    const mainContentEl = document.getElementById("main-content");

    if (loadingEl) {
      loadingEl.classList.toggle("active", show);
    }
    if (mainContentEl) {
      mainContentEl.style.display = show ? "none" : "block";
    }
  }

  function showAlert(type, message, duration = 5000) {
    const alertContainer = document.getElementById("alert-container");
    if (!alertContainer) {
      console.error("Alert container not found");
      return;
    }

    // 移除現有的 alert
    alertContainer.innerHTML = "";

    // 建立新的 alert
    const alert = document.createElement("div");
    alert.className = `alert alert-${type} active`;

    // 加入圖示
    const icon = document.createElement("span");
    icon.style.marginRight = "10px";
    switch (type) {
      case "success":
        icon.innerHTML = "✅";
        break;
      case "error":
        icon.innerHTML = "❌";
        break;
      case "warning":
        icon.innerHTML = "⚠️";
        break;
      default:
        icon.innerHTML = "ℹ️";
    }

    alert.appendChild(icon);
    alert.appendChild(document.createTextNode(message));
    alertContainer.appendChild(alert);

    // 自動移除
    if (duration > 0) {
      setTimeout(() => {
        alert.classList.remove("active");
        setTimeout(() => alert.remove(), 300);
      }, duration);
    }
  }

  function updateButtonState(button, loading = false, text = null) {
    if (!button) return;

    button.disabled = loading;
    if (text) {
      button.textContent = text;
    }

    if (loading) {
      button.style.opacity = "0.6";
      button.style.cursor = "not-allowed";
    } else {
      button.style.opacity = "1";
      button.style.cursor = "pointer";
    }
  }

  // ===== 資料載入 =====
  async function loadParcelData() {
    showLoading(true);

    try {
      const response = await fetch(`${API_BASE}/check/${parcelId}`, {
        headers: headers,
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem("authToken");
          window.location.href = "/login.html";
          return;
        }

        const error = await response.json();
        throw new Error(error.error || "載入失敗");
      }

      const data = await response.json();
      currentParcel = data.parcel;

      // 顯示包裹資訊
      displayParcelInfo(currentParcel);

      // 檢查是否可以轉換
      if (!data.canConvert) {
        showAlert("warning", data.message);
        const convertBtn = document.getElementById("btn-convert");
        if (convertBtn) {
          convertBtn.disabled = true;
          convertBtn.textContent = "無法轉換";
        }
      } else {
        showAlert("success", "包裹已到倉，可以轉換為訂單");
      }

      // 如果已經轉換過，顯示訂單資訊
      if (currentParcel.isConverted && currentParcel.convertedOrder) {
        displayConvertedOrder(currentParcel.convertedOrder);
      }
    } catch (error) {
      console.error("載入包裹資料失敗:", error);
      showAlert("error", error.message || "網路錯誤，請稍後再試");
    } finally {
      showLoading(false);
    }
  }

  // ===== 顯示資料 =====
  function displayParcelInfo(parcel) {
    if (!parcel) return;

    // 包裹基本資訊
    setElementText("tracking-number", parcel.trackingNumber);
    setElementText("logistics-company", parcel.logisticsCompany || "-");
    setElementText("product-name", parcel.productName);
    setElementText("quantity", parcel.quantity);
    setElementText("customer-note", parcel.note || "無");

    // 狀態
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = STATUS_MAP[parcel.status] || parcel.status;
      statusEl.className = `status-badge status-${parcel.status}`;
      statusEl.style.backgroundColor = STATUS_COLORS[parcel.status] || "#999";
    }

    // 商品圖片
    displayProductImages(parcel.productImages);

    // 客戶資訊
    displayCustomerInfo(parcel);

    // 如果有預設值，填入表單
    if (parcel.weight) {
      document.getElementById("actual-weight").value = parcel.weight;
    }
  }

  function displayProductImages(images) {
    const container = document.getElementById("product-images-container");
    const imagesEl = document.getElementById("product-images");

    if (!container || !imagesEl) return;

    if (images && images.length > 0) {
      container.style.display = "block";
      imagesEl.innerHTML = images
        .map((img) => {
          const fullUrl = getFullImageUrl(img);
          return `
          <img src="${fullUrl}" 
               alt="商品圖片" 
               onclick="viewImage('${fullUrl}')"
               onerror="this.src='/assets/no-image.png'"
               title="點擊查看大圖">
        `;
        })
        .join("");
    } else {
      container.style.display = "none";
    }
  }

  function displayCustomerInfo(parcel) {
    if (parcel.customer) {
      // 會員資訊
      setElementText("customer-name", parcel.customer.name);
      setElementText("customer-email", parcel.customer.email);
      setElementText("customer-phone", parcel.customer.phone || "-");
      setElementText(
        "customer-address",
        parcel.customer.defaultAddress || "待確認"
      );
      setElementText("customer-id", parcel.customer.idNumber || "-");
      setElementText("customer-taxid", parcel.customer.taxId || "-");

      // 標記為會員
      const nameEl = document.getElementById("customer-name");
      if (nameEl) {
        nameEl.innerHTML +=
          ' <span style="color: #1a73e8; font-size: 12px;">(會員)</span>';
      }
    } else {
      // 訪客資訊
      setElementText("customer-name", parcel.guestName || "訪客");
      setElementText("customer-email", parcel.guestEmail || "-");
      setElementText("customer-phone", parcel.guestPhone || "-");
      setElementText("customer-address", "待確認");
      setElementText("customer-id", "-");
      setElementText("customer-taxid", "-");

      // 標記為訪客
      const nameEl = document.getElementById("customer-name");
      if (nameEl) {
        nameEl.innerHTML +=
          ' <span style="color: #ff7675; font-size: 12px;">(訪客)</span>';
      }
    }
  }

  function displayConvertedOrder(order) {
    const shareSection = document.getElementById("share-section");
    const convertForm = document.querySelector(".conversion-form");

    if (shareSection && order.shareToken) {
      const shareUrl = `${window.location.origin}/order-share/${order.shareToken}`;
      const shareLinkEl = document.getElementById("share-link");
      if (shareLinkEl) {
        shareLinkEl.value = shareUrl;
      }

      shareSection.classList.add("active");
      shareSection.innerHTML += `
        <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 5px;">
          <p><strong>訂單編號：</strong>${order.id}</p>
          <p><strong>建立時間：</strong>${formatDateTime(order.createdAt)}</p>
          ${
            order.finalTotalAmount
              ? `<p><strong>訂單金額：</strong>${formatCurrency(
                  order.finalTotalAmount
                )}</p>`
              : ""
          }
        </div>
      `;
    }

    if (convertForm) {
      convertForm.style.display = "none";
    }
  }

  function setElementText(id, text) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text;
    }
  }

  // ===== 事件監聽器設定 =====
  function setupEventListeners() {
    // 尺寸輸入 - 計算材積
    ["actual-length", "actual-width", "actual-height"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener("input", calculateCBM);
        element.addEventListener("change", calculateCBM);
      }
    });

    // 價格輸入 - 更新總計
    ["shipping-fee", "service-fee", "protection-price", "other-fee"].forEach(
      (id) => {
        const element = document.getElementById(id);
        if (element) {
          element.addEventListener("input", updatePriceSummary);
          element.addEventListener("change", updatePriceSummary);
        }
      }
    );

    // 加強保護勾選
    const protectionCheckbox = document.getElementById("protection-needed");
    if (protectionCheckbox) {
      protectionCheckbox.addEventListener("change", handleProtectionToggle);
    }

    // 轉換按鈕
    const convertBtn = document.getElementById("btn-convert");
    if (convertBtn) {
      convertBtn.addEventListener("click", handleConvertToOrder);
    }

    // 重置按鈕
    const resetBtn = document.querySelector('[onclick="resetForm()"]');
    if (resetBtn) {
      resetBtn.removeAttribute("onclick");
      resetBtn.addEventListener("click", handleResetForm);
    }

    // 返回按鈕
    const backBtn = document.querySelector('[onclick="goBack()"]');
    if (backBtn) {
      backBtn.removeAttribute("onclick");
      backBtn.addEventListener("click", handleGoBack);
    }

    // 複製連結按鈕
    const copyBtn = document.querySelector('[onclick="copyShareLink()"]');
    if (copyBtn) {
      copyBtn.removeAttribute("onclick");
      copyBtn.addEventListener("click", handleCopyShareLink);
    }

    // 查看訂單按鈕
    const viewOrderBtn = document.querySelector('[onclick="viewOrder()"]');
    if (viewOrderBtn) {
      viewOrderBtn.removeAttribute("onclick");
      viewOrderBtn.addEventListener("click", handleViewOrder);
    }

    // 轉換另一個按鈕
    const anotherBtn = document.querySelector('[onclick="createAnother()"]');
    if (anotherBtn) {
      anotherBtn.removeAttribute("onclick");
      anotherBtn.addEventListener("click", handleCreateAnother);
    }

    // 數字輸入驗證
    document.querySelectorAll('input[type="number"]').forEach((input) => {
      input.addEventListener("input", function () {
        if (this.value < 0) {
          this.value = 0;
        }
      });
    });
  }

  // ===== 事件處理函數 =====
  function calculateCBM() {
    const length =
      parseFloat(document.getElementById("actual-length").value) || 0;
    const width =
      parseFloat(document.getElementById("actual-width").value) || 0;
    const height =
      parseFloat(document.getElementById("actual-height").value) || 0;
    const cbmEl = document.getElementById("actual-cbm");

    if (!cbmEl) return;

    if (length > 0 && width > 0 && height > 0) {
      const cbm = (length * width * height) / 1000000;
      cbmEl.value = cbm.toFixed(4) + " m³";

      // 檢查是否超大件
      if (length > 300 || width > 300 || height > 300) {
        showAlert("warning", "注意：單邊超過 300cm，可能需要收取超長費");
      }
    } else {
      cbmEl.value = "";
    }
  }

  function updatePriceSummary() {
    const shipping =
      parseFloat(document.getElementById("shipping-fee").value) || 0;
    const service =
      parseFloat(document.getElementById("service-fee").value) || 0;
    const protection =
      parseFloat(document.getElementById("protection-price").value) || 0;
    const other = parseFloat(document.getElementById("other-fee").value) || 0;
    const total = shipping + service + protection + other;

    // 更新摘要顯示
    setElementText("summary-shipping", shipping.toLocaleString());
    setElementText("summary-service", service.toLocaleString());
    setElementText("summary-protection", protection.toLocaleString());
    setElementText("summary-other", other.toLocaleString());
    setElementText("summary-total", total.toLocaleString());

    // 如果總金額為 0，顯示警告
    if (total === 0 && shipping === 0) {
      const totalEl = document.getElementById("summary-total");
      if (totalEl) {
        totalEl.style.color = "#e74c3c";
      }
    } else {
      const totalEl = document.getElementById("summary-total");
      if (totalEl) {
        totalEl.style.color = "#1b5e20";
      }
    }
  }

  function handleProtectionToggle(e) {
    const detailsEl = document.getElementById("protection-details");
    const priceInput = document.getElementById("protection-price");

    if (!detailsEl) return;

    if (e.target.checked) {
      detailsEl.style.display = "block";
      if (priceInput) {
        priceInput.focus();
      }
    } else {
      detailsEl.style.display = "none";
      if (priceInput) {
        priceInput.value = "0";
      }
      updatePriceSummary();
    }
  }

  async function handleConvertToOrder(e) {
    e.preventDefault();

    if (isConverting) {
      return;
    }

    // 驗證必填欄位
    const validation = validateForm();
    if (!validation.valid) {
      showAlert("error", validation.message);
      if (validation.field) {
        document.getElementById(validation.field).focus();
      }
      return;
    }

    // 確認對話框
    const confirmMessage = `
確定要將此包裹轉換為正式訂單嗎？

包裹：${currentParcel.productName}
單號：${currentParcel.trackingNumber}
總金額：NT$ ${document.getElementById("summary-total").textContent}
    `.trim();

    if (!confirm(confirmMessage)) {
      return;
    }

    await performConversion();
  }

  function validateForm() {
    // 必填欄位檢查
    const requiredFields = [
      { id: "actual-weight", name: "實際重量" },
      { id: "actual-length", name: "長度" },
      { id: "actual-width", name: "寬度" },
      { id: "actual-height", name: "高度" },
      { id: "shipping-fee", name: "運費" },
    ];

    for (const field of requiredFields) {
      const value = parseFloat(document.getElementById(field.id).value);
      if (!value || value <= 0) {
        return {
          valid: false,
          message: `請填寫${field.name}`,
          field: field.id,
        };
      }
    }

    // 檢查總金額
    const total = parseFloat(
      document.getElementById("summary-total").textContent.replace(/,/g, "")
    );
    if (total <= 0) {
      return {
        valid: false,
        message: "總金額必須大於 0",
        field: "shipping-fee",
      };
    }

    // 如果勾選加強保護，必須填寫費用
    if (document.getElementById("protection-needed").checked) {
      const protectionPrice = parseFloat(
        document.getElementById("protection-price").value
      );
      if (!protectionPrice || protectionPrice < 0) {
        return {
          valid: false,
          message: "請填寫加強保護費用",
          field: "protection-price",
        };
      }
    }

    return { valid: true };
  }

  async function performConversion() {
    isConverting = true;
    const convertBtn = document.getElementById("btn-convert");
    updateButtonState(convertBtn, true, "轉換中...");

    try {
      // 收集表單資料
      const formData = collectFormData();

      // 發送轉換請求
      const response = await fetch(`${API_BASE}/convert/${parcelId}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "轉換失敗");
      }

      const result = await response.json();
      currentOrder = result.order;

      // 顯示成功訊息
      showAlert("success", "包裹已成功轉換為訂單！");

      // 顯示分享區塊
      displayShareSection(result.order);

      // 隱藏轉換表單
      const convertForm = document.querySelector(".conversion-form");
      if (convertForm) {
        convertForm.style.display = "none";
      }

      // 記錄到 console
      console.log("訂單轉換成功:", result);
    } catch (error) {
      console.error("轉換失敗:", error);
      showAlert("error", error.message || "網路錯誤，請稍後再試");
    } finally {
      isConverting = false;
      updateButtonState(convertBtn, false, "確認轉換為訂單");
    }
  }

  function collectFormData() {
    const weight = parseFloat(document.getElementById("actual-weight").value);
    const length = parseFloat(document.getElementById("actual-length").value);
    const width = parseFloat(document.getElementById("actual-width").value);
    const height = parseFloat(document.getElementById("actual-height").value);
    const shippingFee = parseFloat(
      document.getElementById("shipping-fee").value
    );
    const serviceFee =
      parseFloat(document.getElementById("service-fee").value) || 0;
    const otherFee =
      parseFloat(document.getElementById("other-fee").value) || 0;
    const protectionPrice =
      parseFloat(document.getElementById("protection-price").value) || 0;

    return {
      actualWeight: weight,
      actualLength: length,
      actualWidth: width,
      actualHeight: height,
      protectionNeeded: document.getElementById("protection-needed").checked,
      protectionPrice: protectionPrice,
      protectionNote: document.getElementById("protection-note").value,
      finalQuoteData: {
        shipping: shippingFee,
        service: serviceFee,
        protection: protectionPrice,
        other: otherFee,
      },
      finalTotalAmount: shippingFee + serviceFee + protectionPrice + otherFee,
      quoteNote: document.getElementById("quote-note").value,
      additionalServices: collectAdditionalServices(),
    };
  }

  function collectAdditionalServices() {
    const services = {};

    // 收集可能的加值服務（根據實際需求擴充）
    const protectionNeeded =
      document.getElementById("protection-needed").checked;
    if (protectionNeeded) {
      services.protection = {
        needed: true,
        price:
          parseFloat(document.getElementById("protection-price").value) || 0,
        note: document.getElementById("protection-note").value,
      };
    }

    return Object.keys(services).length > 0 ? services : null;
  }

  function displayShareSection(order) {
    const shareSection = document.getElementById("share-section");
    if (!shareSection) return;

    const shareUrl = `${window.location.origin}/order-share/${order.shareToken}`;
    const shareLinkEl = document.getElementById("share-link");
    if (shareLinkEl) {
      shareLinkEl.value = shareUrl;
    }

    shareSection.classList.add("active");

    // 加入額外資訊
    const infoDiv = document.createElement("div");
    infoDiv.style.cssText =
      "margin-top: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px;";
    infoDiv.innerHTML = `
      <h5 style="margin-top: 0; color: #1565c0;">訂單資訊</h5>
      <p><strong>訂單編號：</strong>${order.id}</p>
      <p><strong>建立時間：</strong>${formatDateTime(order.createdAt)}</p>
      <p><strong>分享連結：</strong><a href="${shareUrl}" target="_blank">開啟連結</a></p>
      <p style="margin-bottom: 0; color: #666; font-size: 14px;">
        💡 提示：請將此連結傳送給客戶，客戶可透過連結查看訂單詳情並進行付款。
      </p>
    `;

    const existingInfo = shareSection.querySelector('div[style*="background"]');
    if (!existingInfo) {
      shareSection.appendChild(infoDiv);
    }
  }

  function handleResetForm(e) {
    e.preventDefault();

    if (!confirm("確定要重置表單嗎？所有輸入的資料將會清除。")) {
      return;
    }

    // 重置所有輸入欄位
    document.querySelectorAll(".form-control").forEach((input) => {
      if (!input.disabled && !input.readOnly) {
        if (input.type === "number") {
          input.value = "";
        } else if (input.type === "textarea") {
          input.value = "";
        } else {
          input.value = "";
        }
      }
    });

    // 重置勾選框
    document.getElementById("protection-needed").checked = false;
    document.getElementById("protection-details").style.display = "none";

    // 更新價格摘要
    updatePriceSummary();

    showAlert("success", "表單已重置");
  }

  function handleGoBack(e) {
    e.preventDefault();
    window.location.href = "/admin-parcels";
  }

  function handleCopyShareLink(e) {
    e.preventDefault();

    const input = document.getElementById("share-link");
    if (!input) return;

    // 選擇文字
    input.select();
    input.setSelectionRange(0, 99999); // 行動裝置相容

    // 複製到剪貼簿
    try {
      const successful = document.execCommand("copy");
      if (successful) {
        showAlert("success", "連結已複製到剪貼簿！");

        // 視覺反饋
        const copyBtn = e.target;
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "已複製！";
        copyBtn.style.backgroundColor = "#27ae60";

        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.backgroundColor = "";
        }, 2000);
      } else {
        throw new Error("複製失敗");
      }
    } catch (err) {
      // 備用方案：使用 Clipboard API
      if (navigator.clipboard) {
        navigator.clipboard
          .writeText(input.value)
          .then(() => showAlert("success", "連結已複製到剪貼簿！"))
          .catch(() => showAlert("error", "複製失敗，請手動複製"));
      } else {
        showAlert("error", "複製失敗，請手動複製");
      }
    }
  }

  function handleViewOrder(e) {
    e.preventDefault();

    if (currentOrder) {
      window.open(`/admin?orderId=${currentOrder.id}`, "_blank");
    } else {
      showAlert("error", "訂單資訊不存在");
    }
  }

  function handleCreateAnother(e) {
    e.preventDefault();
    window.location.href = "/admin-parcels";
  }

  // ===== 全域函數（供 HTML 呼叫）=====
  window.viewImage = function (url) {
    window.open(url, "_blank");
  };

  window.resetForm = handleResetForm;
  window.goBack = handleGoBack;
  window.copyShareLink = handleCopyShareLink;
  window.viewOrder = handleViewOrder;
  window.createAnother = handleCreateAnother;
  window.convertToOrder = handleConvertToOrder;

  // ===== 匯出供外部使用 =====
  window.ParcelConverter = {
    init: init,
    reload: loadParcelData,
    getCurrentParcel: () => currentParcel,
    getCurrentOrder: () => currentOrder,
    updatePrices: updatePriceSummary,
    calculateCBM: calculateCBM,
  };
})();
