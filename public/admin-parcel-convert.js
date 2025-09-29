// admin-parcel-convert.js - 修復版本
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

  // 偏遠地區費率
  const remoteAreaRates = {
    "0": { label: "非偏遠地區", rate: 0 },
    "500": { label: "宜蘭縣", rate: 500 },
    "700": { label: "嘉義縣", rate: 700 },
    "800": { label: "屏東縣", rate: 800 },
    "1000": { label: "台東縣", rate: 1000 },
    "1200": { label: "花蓮縣", rate: 1200 }
  };

  // API 配置
  const API_BASE = "/api/parcel-to-order";
  const token = localStorage.getItem("authToken");

  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
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

    console.log("初始化包裹轉訂單頁面, ID:", parcelId);
    loadParcelData();
    setupEventListeners();
    setupDeliveryLocationSelect();
  }

  // ===== 設置配送地區選擇 =====
  function setupDeliveryLocationSelect() {
    const deliveryLocationEl = document.getElementById("delivery-location");
    if (!deliveryLocationEl) {
      console.log("創建配送地區選擇元素");
      // 在運費輸入框後面加入配送地區選擇
      const shippingFeeGroup = document.querySelector('#shipping-fee').closest('.form-group');
      if (shippingFeeGroup) {
        const locationGroup = document.createElement('div');
        locationGroup.className = 'form-group';
        locationGroup.innerHTML = `
          <label for="delivery-location">配送地區</label>
          <select id="delivery-location" class="form-control">
            <option value="0">非偏遠地區</option>
            <option value="500">宜蘭縣 (+NT$500/CBM)</option>
            <option value="700">嘉義縣 (+NT$700/CBM)</option>
            <option value="800">屏東縣 (+NT$800/CBM)</option>
            <option value="1000">台東縣 (+NT$1000/CBM)</option>
            <option value="1200">花蓮縣 (+NT$1200/CBM)</option>
          </select>
        `;
        shippingFeeGroup.parentNode.insertBefore(locationGroup, shippingFeeGroup.nextSibling);
        
        // 加入事件監聽
        document.getElementById("delivery-location").addEventListener("change", calculateShippingFee);
      }
    }
  }

  // ===== 工具函數 =====
  function extractParcelId() {
    const pathParts = window.location.pathname.split("/");
    return pathParts[pathParts.length - 1] || null;
  }

  function showAlert(type, message) {
    const alertEl = document.getElementById("alert-message");
    if (alertEl) {
      alertEl.className = `alert alert-${type}`;
      alertEl.textContent = message;
      alertEl.style.display = "block";
      setTimeout(() => {
        alertEl.style.display = "none";
      }, 5000);
    } else {
      alert(message);
    }
  }

  // ===== 載入包裹資料 =====
  async function loadParcelData() {
    showLoading(true);
    
    try {
      const response = await fetch(`${API_BASE}/parcel/${parcelId}`, {
        headers: headers,
      });

      if (!response.ok) {
        throw new Error("無法載入包裹資料");
      }

      const data = await response.json();
      currentParcel = data.parcel;
      currentOrder = data.order;

      displayParcelInfo(currentParcel);
      
      if (currentOrder) {
        displayConvertedOrder(currentOrder);
      }
    } catch (error) {
      console.error("載入包裹資料失敗:", error);
      showAlert("error", "載入包裹資料失敗：" + error.message);
    } finally {
      showLoading(false);
    }
  }

  // ===== 計算材積和CBM =====
  function calculateCBM() {
    const length = parseFloat(document.getElementById("actual-length").value) || 0;
    const width = parseFloat(document.getElementById("actual-width").value) || 0;
    const height = parseFloat(document.getElementById("actual-height").value) || 0;

    if (length > 0 && width > 0 && height > 0) {
      const volume = (length * width * height) / VOLUME_DIVISOR; // 材積(才)
      const cbm = volume / CBM_TO_CAI_FACTOR; // CBM
      document.getElementById("actual-cbm").value = cbm.toFixed(4) + " m³";
      
      // 計算後自動更新運費
      calculateShippingFee();
    } else {
      document.getElementById("actual-cbm").value = "";
    }
  }

  // ===== 自動計算運費 =====
  function calculateShippingFee() {
    console.log("開始計算運費...");
    
    const length = parseFloat(document.getElementById("actual-length").value) || 0;
    const width = parseFloat(document.getElementById("actual-width").value) || 0;
    const height = parseFloat(document.getElementById("actual-height").value) || 0;
    const weight = parseFloat(document.getElementById("actual-weight").value) || 0;

    // 必須有完整數據才計算
    if (length <= 0 || width <= 0 || height <= 0 || weight <= 0) {
      console.log("資料不完整，無法計算");
      return;
    }

    // 取得傢俱類型
    const furnitureTypeEl = document.getElementById("furniture-type");
    const furnitureType = furnitureTypeEl ? furnitureTypeEl.value : "general";
    const rateInfo = rates[furnitureType];

    // 計算材積（才）
    const singleVolume = (length * width * height) / VOLUME_DIVISOR;
    const cbm = singleVolume / CBM_TO_CAI_FACTOR;

    // 計算基本費用
    const volumeCost = singleVolume * rateInfo.volumeRate;
    const weightCost = weight * rateInfo.weightRate;
    
    // 取較高者作為基本運費
    let baseFreight = Math.max(volumeCost, weightCost);
    
    // 確保不低於最低消費
    baseFreight = Math.max(baseFreight, MINIMUM_CHARGE);

    // 計算額外費用
    let additionalFees = 0;
    let feeDetails = [];

    // 超重費
    if (weight > OVERWEIGHT_LIMIT) {
      additionalFees += OVERWEIGHT_FEE;
      feeDetails.push(`超重費: NT$${OVERWEIGHT_FEE}`);
    }

    // 超長費
    const maxDimension = Math.max(length, width, height);
    if (maxDimension > OVERSIZED_LIMIT) {
      additionalFees += OVERSIZED_FEE;
      feeDetails.push(`超長費: NT$${OVERSIZED_FEE}`);
    }

    // 偏遠地區費用
    const deliveryLocationEl = document.getElementById("delivery-location");
    let remoteFee = 0;
    if (deliveryLocationEl) {
      const remoteRate = parseFloat(deliveryLocationEl.value) || 0;
      if (remoteRate > 0) {
        remoteFee = Math.round(cbm * remoteRate);
        feeDetails.push(`偏遠地區費: NT$${remoteFee}`);
      }
    }

    // 計算總運費
    const totalShippingFee = Math.round(baseFreight + additionalFees + remoteFee);

    // 更新運費欄位
    const shippingFeeInput = document.getElementById("shipping-fee");
    if (shippingFeeInput) {
      shippingFeeInput.value = totalShippingFee;
      
      // 顯示計算明細
      showCalculationDetails(baseFreight, feeDetails, totalShippingFee);
      
      // 更新價格摘要
      updatePriceSummary();
    }

    console.log("運費計算完成:", {
      基本運費: baseFreight,
      額外費用: additionalFees,
      偏遠地區費: remoteFee,
      總運費: totalShippingFee
    });
  }

  // ===== 顯示計算明細 =====
  function showCalculationDetails(baseFreight, feeDetails, total) {
    let detailsEl = document.getElementById("calculation-details");
    
    if (!detailsEl) {
      // 創建明細顯示區域
      const shippingFeeInput = document.getElementById("shipping-fee");
      detailsEl = document.createElement("div");
      detailsEl.id = "calculation-details";
      detailsEl.className = "calculation-details";
      detailsEl.style.cssText = "margin-top: 10px; padding: 10px; background: #f5f5f5; border-radius: 5px; font-size: 12px;";
      shippingFeeInput.parentNode.appendChild(detailsEl);
    }

    let detailsHTML = `
      <div style="color: #666;">
        <strong>運費計算明細：</strong><br>
        基本運費: NT$${Math.round(baseFreight).toLocaleString()}<br>
    `;
    
    if (feeDetails.length > 0) {
      detailsHTML += feeDetails.join('<br>') + '<br>';
    }
    
    detailsHTML += `
        <strong style="color: #1a73e8;">總計: NT$${total.toLocaleString()}</strong>
      </div>
    `;
    
    detailsEl.innerHTML = detailsHTML;
    detailsEl.style.display = "block";
  }

  // ===== 更新價格摘要 =====
  function updatePriceSummary() {
    const shipping = parseFloat(document.getElementById("shipping-fee").value) || 0;
    const service = parseFloat(document.getElementById("service-fee").value) || 0;
    const protection = parseFloat(document.getElementById("protection-price").value) || 0;
    const other = parseFloat(document.getElementById("other-fee").value) || 0;
    const total = shipping + service + protection + other;

    document.getElementById("summary-shipping").textContent = shipping.toLocaleString();
    document.getElementById("summary-service").textContent = service.toLocaleString();
    document.getElementById("summary-protection").textContent = protection.toLocaleString();
    document.getElementById("summary-other").textContent = other.toLocaleString();
    document.getElementById("summary-total").textContent = total.toLocaleString();

    // 更新總金額顏色
    const totalEl = document.getElementById("summary-total");
    if (totalEl) {
      totalEl.style.color = total === 0 ? "#e74c3c" : "#1b5e20";
      totalEl.style.fontWeight = "bold";
    }
  }

  // ===== 設定事件監聽器 =====
  function setupEventListeners() {
    // 尺寸和重量變更時自動計算
    ["actual-length", "actual-width", "actual-height", "actual-weight"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        // 使用多個事件確保能捕捉到變化
        element.addEventListener("input", () => {
          calculateCBM();
          calculateShippingFee();
        });
        element.addEventListener("change", () => {
          calculateCBM();
          calculateShippingFee();
        });
        element.addEventListener("blur", () => {
          calculateCBM();
          calculateShippingFee();
        });
      }
    });

    // 傢俱類型變更
    const furnitureTypeEl = document.getElementById("furniture-type");
    if (furnitureTypeEl) {
      furnitureTypeEl.addEventListener("change", calculateShippingFee);
    } else {
      // 如果沒有傢俱類型選擇，創建一個
      const weightGroup = document.querySelector('#actual-weight').closest('.form-group');
      if (weightGroup) {
        const typeGroup = document.createElement('div');
        typeGroup.className = 'form-group';
        typeGroup.innerHTML = `
          <label for="furniture-type">傢俱類型</label>
          <select id="furniture-type" class="form-control">
            <option value="general">一般家具</option>
            <option value="special_a">特殊家具A (玻璃/大理石)</option>
            <option value="special_b">特殊家具B (精密設備)</option>
            <option value="special_c">特殊家具C (易碎品)</option>
          </select>
        `;
        weightGroup.parentNode.insertBefore(typeGroup, weightGroup.nextSibling);
        document.getElementById("furniture-type").addEventListener("change", calculateShippingFee);
      }
    }

    // 手動輸入的費用變更時更新總計
    ["shipping-fee", "service-fee", "protection-price", "other-fee"].forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener("input", updatePriceSummary);
        element.addEventListener("change", updatePriceSummary);
      }
    });

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
  }

  // ===== 處理加強保護切換 =====
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

  // ===== 顯示包裹資訊 =====
  function displayParcelInfo(parcel) {
    if (!parcel) return;

    // 更新包裹基本資訊
    setElementText("parcel-tracking", parcel.trackingNumber || "-");
    setElementText("parcel-product", parcel.productName || "-");
    setElementText("parcel-purchase-date", formatDateTime(parcel.purchaseDate));
    setElementText("parcel-estimated-weight", `${parcel.estimatedWeight || 0} kg`);
    setElementText("parcel-notes", parcel.notes || "無");

    // 顯示狀態
    const statusEl = document.getElementById("parcel-status");
    if (statusEl && parcel.status) {
      statusEl.textContent = STATUS_MAP[parcel.status] || parcel.status;
      statusEl.style.color = STATUS_COLORS[parcel.status] || "#666";
    }

    // 顯示圖片
    if (parcel.productImages && parcel.productImages.length > 0) {
      const imagesContainer = document.getElementById("product-images");
      if (imagesContainer) {
        imagesContainer.innerHTML = parcel.productImages
          .map(img => `<img src="${getFullImageUrl(img)}" alt="商品圖片" style="max-width: 100px; margin: 5px; cursor: pointer;" onclick="window.open('${getFullImageUrl(img)}', '_blank')">`)
          .join("");
        
        const imagesContainerEl = document.getElementById("product-images-container");
        if (imagesContainerEl) {
          imagesContainerEl.style.display = "block";
        }
      }
    }

    // 顯示客戶資訊
    displayCustomerInfo(parcel);
  }

  // ===== 顯示客戶資訊 =====
  function displayCustomerInfo(parcel) {
    if (parcel.customer) {
      setElementText("customer-name", parcel.customer.name);
      setElementText("customer-email", parcel.customer.email);
      setElementText("customer-phone", parcel.customer.phone || "-");
      setElementText("customer-address", parcel.customer.defaultAddress || "待確認");
      setElementText("customer-id", parcel.customer.idNumber || "-");
      setElementText("customer-taxid", parcel.customer.taxId || "-");
    } else {
      setElementText("customer-name", parcel.guestName || "訪客");
      setElementText("customer-email", parcel.guestEmail || "-");
      setElementText("customer-phone", parcel.guestPhone || "-");
      setElementText("customer-address", "待確認");
      setElementText("customer-id", "-");
      setElementText("customer-taxid", "-");
    }
  }

  // ===== 輔助函數 =====
  function setElementText(id, text) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = text;
    }
  }

  function showLoading(show) {
    const loadingEl = document.getElementById("loading");
    const mainContentEl = document.getElementById("main-content");
    
    if (loadingEl) {
      loadingEl.style.display = show ? "block" : "none";
    }
    if (mainContentEl) {
      mainContentEl.style.display = show ? "none" : "block";
    }
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

  function formatDateTime(dateString) {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleString("zh-TW");
  }

  // ===== 處理轉換為訂單 =====
  async function handleConvertToOrder(e) {
    if (e) e.preventDefault();

    if (isConverting) return;

    // 驗證表單
    const validation = validateForm();
    if (!validation.valid) {
      showAlert("error", validation.message);
      if (validation.field) {
        document.getElementById(validation.field).focus();
      }
      return;
    }

    const confirmMessage = `
確定要將此包裹轉換為正式訂單嗎？

包裹：${currentParcel.productName}
單號：${currentParcel.trackingNumber}
總金額：NT$ ${document.getElementById("summary-total").textContent}
    `.trim();

    if (!confirm(confirmMessage)) return;

    await performConversion();
  }

  // ===== 驗證表單 =====
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

  // ===== 執行轉換 =====
  async function performConversion() {
    isConverting = true;
    const convertBtn = document.getElementById("btn-convert");
    const originalText = convertBtn.textContent;
    convertBtn.disabled = true;
    convertBtn.textContent = "轉換中...";

    try {
      const formData = {
        actualWeight: parseFloat(document.getElementById("actual-weight").value),
        actualLength: parseFloat(document.getElementById("actual-length").value),
        actualWidth: parseFloat(document.getElementById("actual-width").value),
        actualHeight: parseFloat(document.getElementById("actual-height").value),
        shippingFee: parseFloat(document.getElementById("shipping-fee").value),
        serviceFee: parseFloat(document.getElementById("service-fee").value) || 0,
        protectionFee: parseFloat(document.getElementById("protection-price").value) || 0,
        otherFee: parseFloat(document.getElementById("other-fee").value) || 0,
        protectionNeeded: document.getElementById("protection-needed").checked,
        protectionNote: document.getElementById("protection-note")?.value || "",
        quoteNote: document.getElementById("quote-note")?.value || "",
        furnitureType: document.getElementById("furniture-type")?.value || "general",
        deliveryLocation: document.getElementById("delivery-location")?.value || "0"
      };

      console.log("發送轉換請求:", formData);

      const response = await fetch(`${API_BASE}/convert/${parcelId}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "轉換失敗");
      }

      const result = await response.json();
      console.log("轉換成功:", result);

      showAlert("success", "包裹已成功轉換為訂單！");
      currentOrder = result.order;
      displayConvertedOrder(result.order);

    } catch (error) {
      console.error("轉換失敗:", error);
      showAlert("error", "轉換失敗：" + error.message);
    } finally {
      isConverting = false;
      convertBtn.disabled = false;
      convertBtn.textContent = originalText;
    }
  }

  // ===== 顯示已轉換的訂單 =====
  function displayConvertedOrder(order) {
    const shareSection = document.getElementById("share-section");
    const convertForm = document.querySelector(".conversion-form");

    if (shareSection && order.shareToken) {
      const shareUrl = `${window.location.origin}/order-share/${order.shareToken}`;
      const shareLinkEl = document.getElementById("share-link");
      if (shareLinkEl) {
        shareLinkEl.value = shareUrl;
      }

      shareSection.style.display = "block";
      shareSection.innerHTML += `
        <div style="margin-top: 20px; padding: 15px; background: #e3f2fd; border-radius: 5px;">
          <p><strong>訂單編號：</strong>${order.id}</p>
          <p><strong>建立時間：</strong>${formatDateTime(order.createdAt)}</p>
          <p><strong>訂單金額：</strong>NT$ ${(order.finalTotalAmount || 0).toLocaleString()}</p>
        </div>
      `;
    }

    if (convertForm) {
      convertForm.style.display = "none";
    }
  }

  // ===== 全域函數（供 HTML 呼叫）=====
  window.convertToOrder = handleConvertToOrder;
  window.resetForm = function() {
    if (confirm("確定要重置所有輸入的資料嗎？")) {
      document.querySelectorAll('input[type="number"]').forEach(input => {
        input.value = "";
      });
      document.querySelectorAll('textarea').forEach(textarea => {
        textarea.value = "";
      });
      document.getElementById("protection-needed").checked = false;
      document.getElementById("protection-details").style.display = "none";
      updatePriceSummary();
    }
  };
  window.copyShareLink = function() {
    const shareLinkEl = document.getElementById("share-link");
    if (shareLinkEl) {
      shareLinkEl.select();
      document.execCommand("copy");
      showAlert("success", "連結已複製到剪貼簿");
    }
  };
  window.viewOrder = function() {
    if (currentOrder) {
      window.location.href = `/admin/orders/${currentOrder.id}`;
    }
  };
  window.createAnother = function() {
    window.location.href = "/admin/parcels";
  };

})();
