// admin-parcel-convert.js - 包裹轉訂單管理介面邏輯（修正版）
(function () {
  "use strict";

  // ===== 全域變數 =====
  let currentParcel = null;
  let currentOrder = null;
  let isConverting = false;
  let parcelId = null;

  // ===== 傢俱計算器常數定義 =====
  const VOLUME_DIVISOR = 28317;
  const CBM_TO_CAI_FACTOR = 35.3;
  const MINIMUM_CHARGE = 2000;
  const OVERWEIGHT_LIMIT = 100;
  const OVERWEIGHT_FEE = 800;
  const OVERSIZED_LIMIT = 300;
  const OVERSIZED_FEE = 800;

  // 費率定義
  const rates = {
    general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
    special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
    special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
    special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
  };

  // API 配置
  const API_BASE = "/api/parcel-to-order";
  const token = localStorage.getItem("authToken");

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
    parcelId = extractParcelId();
    if (!parcelId) {
      showAlert("error", "無效的包裹 ID");
      return;
    }

    loadParcelData();
    setupEventListeners();
    updatePriceSummary();
  }

  // ===== 工具函數 =====
  function extractParcelId() {
    const pathParts = window.location.pathname.split("/");
    return pathParts[pathParts.length - 1] || null;
  }

  function getFullImageUrl(imagePath) {
    if (!imagePath) return "";
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

    alertContainer.innerHTML = "";

    const alert = document.createElement("div");
    alert.className = `alert alert-${type} active`;

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
      case "info":
        icon.innerHTML = "ℹ️";
        break;
      default:
        icon.innerHTML = "ℹ️";
    }

    alert.appendChild(icon);
    alert.appendChild(document.createTextNode(message));
    alertContainer.appendChild(alert);

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

      displayParcelInfo(currentParcel);

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

    setElementText("tracking-number", parcel.trackingNumber);
    setElementText("logistics-company", parcel.logisticsCompany || "-");
    setElementText("product-name", parcel.productName);
    setElementText("quantity", parcel.quantity);
    setElementText("customer-note", parcel.note || "無");

    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = STATUS_MAP[parcel.status] || parcel.status;
      statusEl.className = `status-badge status-${parcel.status}`;
      statusEl.style.backgroundColor = STATUS_COLORS[parcel.status] || "#999";
    }

    displayProductImages(parcel.productImages);
    displayCustomerInfo(parcel);

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
               onerror="this.style.display='none'"
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
      setElementText("customer-name", parcel.customer.name);
      setElementText("customer-email", parcel.customer.email);
      setElementText("customer-phone", parcel.customer.phone || "-");
      setElementText(
        "customer-address",
        parcel.customer.defaultAddress || "待確認"
      );
      setElementText("customer-id", parcel.customer.idNumber || "-");
      setElementText("customer-taxid", parcel.customer.taxId || "-");

      const nameEl = document.getElementById("customer-name");
      if (nameEl) {
        nameEl.innerHTML +=
          ' <span style="color: #1a73e8; font-size: 12px;">(會員)</span>';
      }
    } else {
      setElementText("customer-name", parcel.guestName || "訪客");
      setElementText("customer-email", parcel.guestEmail || "-");
      setElementText("customer-phone", parcel.guestPhone || "-");
      setElementText("customer-address", "待確認");
      setElementText("customer-id", "-");
      setElementText("customer-taxid", "-");

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
    ["actual-length", "actual-width", "actual-height", "actual-weight"].forEach(
      (id) => {
        const element = document.getElementById(id);
        if (element) {
          element.addEventListener("input", () => {
            calculateCBM();
            calculateShippingFee();
          });
          element.addEventListener("change", () => {
            calculateCBM();
            calculateShippingFee();
          });
        }
      }
    );

    ["shipping-fee", "service-fee", "protection-price", "other-fee"].forEach(
      (id) => {
        const element = document.getElementById(id);
        if (element) {
          element.addEventListener("input", updatePriceSummary);
          element.addEventListener("change", updatePriceSummary);
        }
      }
    );

    const protectionCheckbox = document.getElementById("protection-needed");
    if (protectionCheckbox) {
      protectionCheckbox.addEventListener("change", handleProtectionToggle);
    }

    const resetBtn = document.querySelector('[onclick="resetForm()"]');
    if (resetBtn) {
      resetBtn.removeAttribute("onclick");
      resetBtn.addEventListener("click", handleResetForm);
    }

    const backBtn = document.querySelector('[onclick="goBack()"]');
    if (backBtn) {
      backBtn.removeAttribute("onclick");
      backBtn.addEventListener("click", handleGoBack);
    }

    const copyBtn = document.querySelector('[onclick="copyShareLink()"]');
    if (copyBtn) {
      copyBtn.removeAttribute("onclick");
      copyBtn.addEventListener("click", handleCopyShareLink);
    }

    const viewOrderBtn = document.querySelector('[onclick="viewOrder()"]');
    if (viewOrderBtn) {
      viewOrderBtn.removeAttribute("onclick");
      viewOrderBtn.addEventListener("click", handleViewOrder);
    }

    const anotherBtn = document.querySelector('[onclick="createAnother()"]');
    if (anotherBtn) {
      anotherBtn.removeAttribute("onclick");
      anotherBtn.addEventListener("click", handleCreateAnother);
    }

    document.querySelectorAll('input[type="number"]').forEach((input) => {
      input.addEventListener("input", function () {
        if (this.value < 0) {
          this.value = 0;
        }
      });
    });
  }

  // ===== 計算函數 =====
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
      const volume = (length * width * height) / VOLUME_DIVISOR;
      cbmEl.value = volume.toFixed(2) + " 材";
    } else {
      cbmEl.value = "";
    }
  }

  function calculateShippingFee() {
    const weight =
      parseFloat(document.getElementById("actual-weight").value) || 0;
    const length =
      parseFloat(document.getElementById("actual-length").value) || 0;
    const width =
      parseFloat(document.getElementById("actual-width").value) || 0;
    const height =
      parseFloat(document.getElementById("actual-height").value) || 0;

    if (weight <= 0 || length <= 0 || width <= 0 || height <= 0) {
      return;
    }

    // 獲取家具類型
    const furnitureTypeEl = document.getElementById("furniture-type");
    const furnitureType = furnitureTypeEl ? furnitureTypeEl.value : "general";
    const rateInfo = rates[furnitureType];

    // 計算材積（才）- 修正：直接計算材積，不需要 Math.ceil
    const singleVolume = (length * width * height) / VOLUME_DIVISOR;

    // 計算費用
    const volumeCost = singleVolume * rateInfo.volumeRate;
    const weightCost = weight * rateInfo.weightRate;
    
    // 取較高者作為基本運費
    let baseFreight = Math.max(volumeCost, weightCost);
    
    // 確保不低於最低消費
    baseFreight = Math.max(baseFreight, MINIMUM_CHARGE);

    // 計算額外費用
    let additionalFees = 0;

    // 超重費
    if (weight > OVERWEIGHT_LIMIT) {
      additionalFees += OVERWEIGHT_FEE;
    }

    // 超長費
    const maxDimension = Math.max(length, width, height);
    if (maxDimension > OVERSIZED_LIMIT) {
      additionalFees += OVERSIZED_FEE;
    }

    // 獲取偏遠地區費用
    const deliveryLocationEl = document.getElementById("delivery-location");
    let remoteFee = 0;
    if (deliveryLocationEl) {
      const remoteRate = parseFloat(deliveryLocationEl.value) || 0;
      if (remoteRate > 0) {
        // 偏遠地區費用 = 材積轉立方米 × 費率
        const cbm = singleVolume / CBM_TO_CAI_FACTOR;
        remoteFee = cbm * remoteRate;
      }
    }

    // 計算總運費
    const totalShippingFee = baseFreight + additionalFees + remoteFee;

    // 更新運費欄位
    const shippingFeeInput = document.getElementById("shipping-fee");
    if (shippingFeeInput) {
      shippingFeeInput.value = Math.round(totalShippingFee);
      updatePriceSummary();
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

    setElementText("summary-shipping", shipping.toLocaleString());
    setElementText("summary-service", service.toLocaleString());
    setElementText("summary-protection", protection.toLocaleString());
    setElementText("summary-other", other.toLocaleString());
    setElementText("summary-total", total.toLocaleString());

    const totalEl = document.getElementById("summary-total");
    if (totalEl) {
      totalEl.style.color = total === 0 ? "#e74c3c" : "#1b5e20";
    }
  }

  // ===== 事件處理函數 =====
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
    if (e && e.preventDefault) {
      e.preventDefault();
    }

    if (isConverting) {
      return;
    }

    const validation = validateForm();
    if (!validation.valid) {
      showAlert("error", validation.message);
      if (validation.field) {
        document.getElementById(validation.field).focus();
      }
      return;
    }

    if (!currentParcel) {
      showAlert("error", "包裹資料未載入");
      return;
    }

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

    return { valid: true };
  }

  async function performConversion() {
    isConverting = true;
    const convertBtn = document.getElementById("btn-convert");
    updateButtonState(convertBtn, true, "轉換中...");

    try {
      const formData = collectFormData();
      console.log("準備發送的資料:", formData);

      const response = await fetch(`${API_BASE}/convert/${parcelId}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error("API 錯誤回應:", errorData);
        throw new Error(errorData.error || "轉換失敗");
      }

      const result = await response.json();
      currentOrder = result.order;
      showAlert("success", "包裹已成功轉換為訂單！");
      displayShareSection(result.order);

      const convertForm = document.querySelector(".conversion-form");
      if (convertForm) {
        convertForm.style.display = "none";
      }
    } catch (error) {
      console.error("轉換失敗:", error);
      showAlert("error", `轉換失敗：${error.message}`);
    } finally {
      isConverting = false;
      updateButtonState(convertBtn, false, "確認轉換為訂單");
    }
  }

  // ===== 修正後的 collectFormData 函數 =====
  function collectFormData() {
    // 基本測量數據
    const weight =
      parseFloat(document.getElementById("actual-weight").value) || 0;
    const length =
      parseFloat(document.getElementById("actual-length").value) || 0;
    const width =
      parseFloat(document.getElementById("actual-width").value) || 0;
    const height =
      parseFloat(document.getElementById("actual-height").value) || 0;

    // 費用數據
    const shippingFee =
      parseFloat(document.getElementById("shipping-fee").value) || 0;
    const serviceFee =
      parseFloat(document.getElementById("service-fee").value) || 0;
    const otherFee =
      parseFloat(document.getElementById("other-fee").value) || 0;

    // 加強保護
    const protectionCheckbox = document.getElementById("protection-needed");
    const protectionNeeded = protectionCheckbox
      ? protectionCheckbox.checked
      : false;
    const protectionPrice = protectionNeeded
      ? parseFloat(document.getElementById("protection-price").value) || 0
      : 0;
    const protectionNote = protectionNeeded
      ? document.getElementById("protection-note").value || ""
      : "";

    // 計算總金額
    const finalTotalAmount =
      shippingFee + serviceFee + protectionPrice + otherFee;

    // 組裝 finalQuoteData 物件（這是後端需要的格式）
    const finalQuoteData = {
      shippingFee: shippingFee,
      serviceFee: serviceFee,
      protectionFee: protectionPrice,
      otherFee: otherFee,
      totalAmount: finalTotalAmount,
      // 加入其他可能需要的欄位
      furnitureType:
        document.getElementById("furniture-type")?.value || "general",
      deliveryLocation:
        document.getElementById("delivery-location")?.value || "0",
      calculatedAt: new Date().toISOString(),
    };

    // 組裝 additionalServices 物件
    const additionalServices = {
      protection: {
        needed: protectionNeeded,
        price: protectionPrice,
        note: protectionNote,
      },
      // 可以加入其他額外服務
      express: false,
      insurance: false,
      packaging: false,
    };

    // 報價備註
    const quoteNote = document.getElementById("quote-note")?.value || "";

    // 返回完整的資料物件（符合後端 API 的期待格式）
    return {
      // 實際測量數據
      actualWeight: weight,
      actualLength: length,
      actualWidth: width,
      actualHeight: height,

      // 加強保護
      protectionNeeded: protectionNeeded,
      protectionPrice: protectionPrice,
      protectionNote: protectionNote,

      // 最終報價數據（物件格式）- 這是關鍵的修正
      finalQuoteData: finalQuoteData,

      // 最終總金額
      finalTotalAmount: finalTotalAmount,

      // 報價備註
      quoteNote: quoteNote,

      // 額外服務（物件格式）- 這是關鍵的修正
      additionalServices: additionalServices,
    };
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

    document.querySelectorAll(".form-control").forEach((input) => {
      if (!input.disabled && !input.readOnly) {
        input.value = "";
      }
    });

    const protectionCheckbox = document.getElementById("protection-needed");
    if (protectionCheckbox) {
      protectionCheckbox.checked = false;
    }

    const protectionDetails = document.getElementById("protection-details");
    if (protectionDetails) {
      protectionDetails.style.display = "none";
    }

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

    input.select();
    input.setSelectionRange(0, 99999);

    try {
      const successful = document.execCommand("copy");
      if (successful) {
        showAlert("success", "連結已複製到剪貼簿！");

        const copyBtn = e.target;
        const originalText = copyBtn.textContent;
        copyBtn.textContent = "已複製！";
        copyBtn.style.backgroundColor = "#27ae60";

        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.backgroundColor = "";
        }, 2000);
      }
    } catch (err) {
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
  window.convertToOrder = function () {
    handleConvertToOrder();
  };

  // ===== 匯出供外部使用 =====
  window.ParcelConverter = {
    init: init,
    reload: loadParcelData,
    getCurrentParcel: () => currentParcel,
    getCurrentOrder: () => currentOrder,
    updatePrices: updatePriceSummary,
    calculateCBM: calculateCBM,
    calculateShipping: calculateShippingFee,
  };
})();
