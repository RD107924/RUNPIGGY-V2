// public/order.js - 完整優化版本
document.addEventListener("DOMContentLoaded", () => {
  const orderForm = document.getElementById("orderForm");
  const formMessage = document.getElementById("formMessage");
  const submitButton = orderForm.querySelector('button[type="submit"]');

  // 檢查是否為會員，以及是否需要預填資料
  const params = new URLSearchParams(window.location.search);
  const shouldPrefill = params.get("prefill") === "true";
  const customerToken = localStorage.getItem("customerToken");

  // 如果是會員且需要預填，自動填入會員資料
  if (shouldPrefill && customerToken) {
    prefillCustomerData();
  }

  // 預填會員資料
  async function prefillCustomerData() {
    try {
      const response = await fetch("/api/customers/profile", {
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      });

      if (response.ok) {
        const customer = await response.json();
        // 自動填入會員預設資料
        document.getElementById("recipientName").value = customer.name || "";
        document.getElementById("address").value =
          customer.defaultAddress || "";
        document.getElementById("phone").value = customer.phone || "";
        document.getElementById("email").value = customer.email || ""; // 新增
        document.getElementById("idNumber").value = customer.idNumber || "";
        document.getElementById("taxId").value = customer.taxId || ""; // 新增
      }
    } catch (error) {
      console.log("無法載入會員資料:", error);
    }
  }

  orderForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const originalBtnText = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = `<span class="spinner"></span> 訂單提交中...`;

    const calculationData = JSON.parse(localStorage.getItem("calculationData"));
    if (!calculationData || !calculationData.calculationResult) {
      formMessage.textContent =
        "錯誤：找不到運費試算記錄，請返回主頁重新操作。";
      formMessage.style.color = "red";
      submitButton.disabled = false;
      submitButton.innerHTML = originalBtnText;
      return;
    }

    // 收集表單資料
    const recipientName = document.getElementById("recipientName").value.trim();
    const address = document.getElementById("address").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const email = document.getElementById("email").value.trim(); // 新增
    const idNumber = document.getElementById("idNumber").value.trim();
    const taxId = document.getElementById("taxId").value.trim(); // 新增

    // 驗證必填欄位
    if (!recipientName || !address || !phone || !email || !idNumber) {
      formMessage.textContent = "請填寫所有必填欄位！";
      formMessage.style.color = "red";
      submitButton.disabled = false;
      submitButton.innerHTML = originalBtnText;
      return;
    }

    // 驗證 Email 格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      formMessage.textContent = "請輸入有效的電子郵件地址！";
      formMessage.style.color = "red";
      document.getElementById("email").focus();
      submitButton.disabled = false;
      submitButton.innerHTML = originalBtnText;
      return;
    }

    // 驗證統一編號格式（如果有填寫）
    if (taxId && !/^\d{8}$/.test(taxId)) {
      formMessage.textContent = "統一編號格式錯誤，請輸入8位數字！";
      formMessage.style.color = "red";
      document.getElementById("taxId").focus();
      submitButton.disabled = false;
      submitButton.innerHTML = originalBtnText;
      return;
    }

    // 收集加值服務資料
    const needCarryUpstairs =
      document.getElementById("needCarryUpstairs").checked;
    const floorNumber = document.getElementById("floorNumber").value;
    const hasElevator =
      document.querySelector('input[name="hasElevator"]:checked')?.value || "";
    const needAssembly = document.getElementById("needAssembly").checked;
    const assemblyItems = document.getElementById("assemblyItems").value;

    // 組合加值服務資訊
    const additionalServices = {
      carryUpstairs: {
        needed: needCarryUpstairs,
        floor: needCarryUpstairs ? floorNumber : null,
        hasElevator: needCarryUpstairs ? hasElevator : null,
      },
      assembly: {
        needed: needAssembly,
        items: needAssembly ? assemblyItems : null,
      },
    };

    const orderData = {
      lineNickname: calculationData.lineNickname,
      recipientName,
      address,
      phone,
      email, // 新增
      idNumber,
      taxId: taxId || null, // 新增（選填）
      calculationResult: calculationData.calculationResult,
      additionalServices,
      customerToken: customerToken, // 傳送會員 token 到後端
    };

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
      });

      if (!response.ok) {
        const errorResult = await response.json();
        throw new Error(errorResult.error || "伺服器回應錯誤，訂單提交失敗。");
      }

      const result = await response.json();
      console.log("訂單成功建立:", result);

      orderForm.style.display = "none";

      // 根據是否為會員顯示不同訊息
      if (customerToken) {
        let servicesNote = "";
        if (
          orderData.additionalServices.carryUpstairs.needed ||
          orderData.additionalServices.assembly.needed
        ) {
          servicesNote = `
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <strong>📦 您選擇的加值服務：</strong><br>
              ${
                orderData.additionalServices.carryUpstairs.needed
                  ? `• 搬運上樓服務（${
                      orderData.additionalServices.carryUpstairs.floor
                    }樓，${
                      orderData.additionalServices.carryUpstairs.hasElevator ===
                      "yes"
                        ? "有"
                        : "無"
                    }電梯）<br>
                  <small style="color: #856404;">費用需現場支付給司機</small><br>`
                  : ""
              }
              ${
                orderData.additionalServices.assembly.needed
                  ? `• 組裝服務（${orderData.additionalServices.assembly.items}）<br>
                  <small style="color: #856404;">請向客服索取師傅聯繫方式</small><br>`
                  : ""
              }
            </div>
          `;
        }

        // 發票資訊提醒
        let invoiceNote = "";
        if (taxId) {
          invoiceNote = `
            <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <strong>📧 電子發票資訊：</strong><br>
              • 統一編號：${taxId}<br>
              • 發票將寄送至：${email}
            </div>
          `;
        } else {
          invoiceNote = `
            <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <strong>📧 電子發票將寄送至：</strong>${email}
            </div>
          `;
        }

        formMessage.innerHTML = `
          <h2 style="color: green;">您的訂單已成功提交！</h2>
          <p>訂單編號：${result.id}</p>
          ${invoiceNote}
          ${servicesNote}
          <p>我們的客服人員將會透過您提供的 LINE 暱稱與您聯繫後續事宜。</p>
          <p>您可以在會員中心查看訂單狀態。</p>
          <p>感謝您的使用！</p>
          <div style="margin-top: 20px;">
            <a href="/customer.html" class="btn" style="margin-right: 10px;">前往會員中心</a>
            <a href="/" class="btn">返回首頁</a>
          </div>
        `;
      } else {
        let servicesNote = "";
        if (
          orderData.additionalServices.carryUpstairs.needed ||
          orderData.additionalServices.assembly.needed
        ) {
          servicesNote = `
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <strong>📦 您選擇的加值服務：</strong><br>
              ${
                orderData.additionalServices.carryUpstairs.needed
                  ? `• 搬運上樓服務（${
                      orderData.additionalServices.carryUpstairs.floor
                    }樓，${
                      orderData.additionalServices.carryUpstairs.hasElevator ===
                      "yes"
                        ? "有"
                        : "無"
                    }電梯）<br>
                  <small style="color: #856404;">費用需現場支付給司機</small><br>`
                  : ""
              }
              ${
                orderData.additionalServices.assembly.needed
                  ? `• 組裝服務（${orderData.additionalServices.assembly.items}）<br>
                  <small style="color: #856404;">請向客服索取師傅聯繫方式</small><br>`
                  : ""
              }
            </div>
          `;
        }

        // 發票資訊提醒
        let invoiceNote = "";
        if (taxId) {
          invoiceNote = `
            <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <strong>📧 電子發票資訊：</strong><br>
              • 統一編號：${taxId}<br>
              • 發票將寄送至：${email}
            </div>
          `;
        } else {
          invoiceNote = `
            <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 15px 0;">
              <strong>📧 電子發票將寄送至：</strong>${email}
            </div>
          `;
        }

        formMessage.innerHTML = `
          <h2 style="color: green;">您的訂單已成功提交！</h2>
          <p>訂單編號：${result.id}</p>
          ${invoiceNote}
          ${servicesNote}
          <p>我們的客服人員將會透過您提供的 LINE 暱稱與您聯繫後續事宜。</p>
          <p>感謝您的使用！</p>
          <div style="margin-top: 20px;">
            <a href="/" class="btn">返回首頁</a>
          </div>
        `;
      }

      // 清除本地儲存的資料
      localStorage.removeItem("calculationData");
      localStorage.removeItem("draftItems");
    } catch (error) {
      console.error("提交訂單時發生錯誤:", error);
      formMessage.textContent = `提交失敗，請稍後再試或直接聯繫客服。錯誤訊息: ${error.message}`;
      formMessage.style.color = "red";
      submitButton.disabled = false;
      submitButton.innerHTML = originalBtnText;
    }
  });

  // 新增樣式
  const style = document.createElement("style");
  style.textContent = `
    .spinner {
      display: inline-block;
      width: 18px;
      height: 18px;
      border: 3px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 1s ease-in-out infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
});
