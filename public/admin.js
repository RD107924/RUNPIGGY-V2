// public/admin.js - 完整優化版管理後台（含 email、taxId 和加值服務管理）
document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  const fetchOptions = { headers, cache: "no-cache" };

  // DOM Elements
  const ordersTableBody = document.getElementById("ordersTableBody");
  const logoutBtn = document.getElementById("logoutBtn");
  const filterStatus = document.getElementById("filter-status");
  const filterUser = document.getElementById("filter-user");
  const searchInput = document.getElementById("search-input");
  const filterHasServices = document.getElementById("filter-has-services");
  const modal = document.getElementById("order-detail-modal");
  const modalBody = document.getElementById("modal-body");
  const closeModalBtn = document.querySelector(".modal-close-btn");

  let allOrders = [];
  let allUsers = [];

  const statusMap = {
    NEEDS_PURCHASE: "需採購清單",
    PURCHASED: "已採購",
    IN_WAREHOUSE: "已入庫",
    NOT_IN_WAREHOUSE: "未入庫",
    SHIPPED: "已發貨",
    IN_CUSTOMS: "清關中",
    DELIVERY_COMPLETE: "派送完成",
  };

  // 初始化狀態選項
  Object.entries(statusMap).forEach(([key, value]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = value;
    filterStatus.appendChild(option);
  });

  // 事件監聽器
  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("authToken");
    window.location.href = "/login.html";
  });

  closeModalBtn.addEventListener("click", () => (modal.style.display = "none"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  // 解析加值服務資訊
  const parseAdditionalServices = (servicesJson) => {
    if (!servicesJson) return null;
    try {
      return typeof servicesJson === "string"
        ? JSON.parse(servicesJson)
        : servicesJson;
    } catch (e) {
      console.error("解析加值服務失敗:", e);
      return null;
    }
  };

  // 格式化加值服務顯示
  const formatServiceDisplay = (services) => {
    if (!services) return "";

    const items = [];
    if (services.carryUpstairs?.needed) {
      items.push(`搬運${services.carryUpstairs.floor}樓`);
    }
    if (services.assembly?.needed) {
      items.push("組裝");
    }

    return items.length > 0
      ? `<span class="service-badge">${items.join("、")}</span>`
      : "-";
  };

  // 渲染訂單列表
  const renderOrders = (orders, users) => {
    // 過濾加值服務
    let filteredOrders = orders;
    if (filterHasServices.checked) {
      filteredOrders = orders.filter((order) => {
        const services = parseAdditionalServices(order.additionalServices);
        return (
          services &&
          (services.carryUpstairs?.needed || services.assembly?.needed)
        );
      });
    }

    ordersTableBody.innerHTML = filteredOrders
      .map((order) => {
        let calculationResult = order.calculationResult;
        if (typeof calculationResult === "string") {
          try {
            calculationResult = JSON.parse(calculationResult);
          } catch (e) {
            console.error("解析 JSON 失敗:", e);
            calculationResult = {};
          }
        }

        const services = parseAdditionalServices(order.additionalServices);
        const hasServices =
          services &&
          (services.carryUpstairs?.needed || services.assembly?.needed);
        const serviceDisplay = formatServiceDisplay(services);

        // 檢查是否已報價
        const quotedDisplay = order.serviceQuoted
          ? `<span class="quoted-badge">已報價: NT$ ${
              order.serviceQuoteAmount?.toLocaleString() || 0
            }</span>`
          : "";

        // 顯示發票類型
        const invoiceType = order.taxId
          ? `<span title="統編: ${order.taxId}" style="color: #0066cc;">公司</span>`
          : `<span style="color: #666;">個人</span>`;

        return `
            <tr ${hasServices ? 'style="background-color: #fffbf0;"' : ""}>
                <td data-label="操作">
                    <button class="btn-view-detail" data-order-id="${
                      order.id
                    }">查看</button>
                </td>
                <td data-label="訂單時間">${new Date(order.createdAt)
                  .toLocaleString("sv")
                  .replace(" ", "<br>")}</td>
                <td data-label="收件人">${order.recipientName}<br>
                    <small style="color: #666;">${order.phone}</small>
                </td>
                <td data-label="發票">${invoiceType}<br>
                    <small style="color: #666; word-break: break-all;">${
                      order.email || "-"
                    }</small>
                </td>
                <td data-label="總金額">${
                  calculationResult?.finalTotal?.toLocaleString() || "N/A"
                } 台幣</td>
                <td data-label="加值服務">
                    ${serviceDisplay}
                    ${quotedDisplay}
                </td>
                <td data-label="進度">
                    <select class="status-select" data-order-id="${order.id}">
                        ${Object.entries(statusMap)
                          .map(
                            ([key, value]) =>
                              `<option value="${key}" ${
                                order.status === key ? "selected" : ""
                              }>${value}</option>`
                          )
                          .join("")}
                    </select>
                </td>
                <td data-label="負責人">
                    <select class="assign-select" data-order-id="${order.id}">
                        <option value="">-- 未指派 --</option>
                        ${users
                          .map(
                            (user) =>
                              `<option value="${user.id}" ${
                                order.assignedToId === user.id ? "selected" : ""
                              }>${user.username}</option>`
                          )
                          .join("")}
                    </select>
                </td>
            </tr>
        `;
      })
      .join("");
  };

  // 顯示訂單詳情（含 email 和 taxId）
  const showOrderDetail = (orderId) => {
    const order = allOrders.find((o) => o.id === orderId);
    if (!order) return;

    let calculationResult = order.calculationResult;
    if (typeof calculationResult === "string") {
      try {
        calculationResult = JSON.parse(calculationResult);
      } catch (e) {
        console.error("解析 JSON 失敗:", e);
        calculationResult = {};
      }
    }

    const services = parseAdditionalServices(order.additionalServices);

    // 產生商品列表 HTML
    let itemsHtml = "";
    if (
      calculationResult?.allItemsData &&
      Array.isArray(calculationResult.allItemsData)
    ) {
      itemsHtml = calculationResult.allItemsData
        .map(
          (item) => `
            <div class="item-detail" style="background-color: #f8f9fa; padding: 10px; margin: 10px 0; border-radius: 5px;">
                <strong>${item.name || "未命名商品"} × ${
            item.quantity || 0
          }</strong> (${item.rateInfo?.name || "一般家具"})
                <ul style="margin: 5px 0;">
                    <li>單件重量: ${item.singleWeight || 0}kg, 單件材積: ${
            item.singleVolume || 0
          }材</li>
                    <li>總重量: ${item.totalWeight || 0}kg, 總材積: ${
            item.totalVolume || 0
          }材</li>
                    <li>重量費用: ${(
                      item.itemWeightCost || 0
                    ).toLocaleString()} 台幣</li>
                    <li>材積費用: ${(
                      item.itemVolumeCost || 0
                    ).toLocaleString()} 台幣</li>
                    <li><strong>此筆費用: ${(
                      item.itemFinalCost || 0
                    ).toLocaleString()} 台幣</strong></li>
                </ul>
            </div>
        `
        )
        .join("");
    } else {
      itemsHtml = '<p style="color: #999;">無商品資料</p>';
    }

    // 產生加值服務 HTML
    let servicesHtml = "";
    if (
      services &&
      (services.carryUpstairs?.needed || services.assembly?.needed)
    ) {
      servicesHtml = `
        <div class="service-details" style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <h4 style="color: #856404;">📦 加值服務需求</h4>
          ${
            services.carryUpstairs?.needed
              ? `
            <div class="service-item">
              <strong>搬運上樓服務：</strong>
              <ul style="margin: 5px 0 0 20px;">
                <li>樓層：${services.carryUpstairs.floor} 樓</li>
                <li>電梯：${
                  services.carryUpstairs.hasElevator === "yes"
                    ? "有電梯"
                    : "無電梯"
                }</li>
              </ul>
              <p style="color: #856404; font-size: 0.9em; margin: 5px 0 0 20px;">
                ⚠️ 費用由客戶現場支付給司機
              </p>
            </div>
          `
              : ""
          }
          ${
            services.assembly?.needed
              ? `
            <div class="service-item" style="margin-top: 10px;">
              <strong>組裝服務：</strong>
              <p style="margin: 5px 0 0 20px;">${
                services.assembly.items || "未說明"
              }</p>
              <p style="color: #856404; font-size: 0.9em; margin: 5px 0 0 20px;">
                📞 請提供師傅聯繫方式給客戶
              </p>
            </div>
          `
              : ""
          }
          
          <div class="quote-section" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ffc107;">
            <h5>加值服務報價（參考用）</h5>
            ${
              order.serviceQuoted
                ? `
              <p style="color: green;">
                ✅ 已報價：NT$ ${
                  order.serviceQuoteAmount?.toLocaleString() || 0
                }
              </p>
              <div class="quote-input" style="display: flex; gap: 10px; margin-top: 10px;">
                <input type="number" id="update-quote-${orderId}" 
                       value="${order.serviceQuoteAmount || 0}" 
                       placeholder="修改報價金額"
                       style="flex: 1; padding: 5px;">
                <button class="btn-quote" onclick="updateServiceQuote('${orderId}')"
                        style="padding: 5px 15px; background: #ffc107; border: none; border-radius: 3px; cursor: pointer;">
                  更新報價
                </button>
              </div>
            `
                : `
              <p style="color: orange;">⚠️ 尚未報價</p>
              <div class="quote-input" style="display: flex; gap: 10px; margin-top: 10px;">
                <input type="number" id="service-quote-${orderId}" 
                       placeholder="輸入報價金額 (台幣)"
                       style="flex: 1; padding: 5px;">
                <button class="btn-quote" onclick="submitServiceQuote('${orderId}')"
                        style="padding: 5px 15px; background: #28a745; color: white; border: none; border-radius: 3px; cursor: pointer;">
                  提交報價
                </button>
              </div>
            `
            }
          </div>
        </div>
      `;
    } else {
      servicesHtml = `
        <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
          <p style="color: #666; text-align: center;">此訂單無加值服務需求</p>
        </div>
      `;
    }

    // 顯示詳細資訊（包含 email 和 taxId）
    modalBody.innerHTML = `
            <h3 style="color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 10px;">訂單詳細資訊</h3>
            
            <div style="background-color: #e9f5ff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h4 style="color: #1a73e8; margin-top: 0;">客戶資訊</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <p><strong>LINE 暱稱:</strong> ${
                      order.lineNickname || "未提供"
                    }</p>
                    <p><strong>收件人:</strong> ${order.recipientName}</p>
                    <p><strong>電話:</strong> ${order.phone}</p>
                    <p><strong>Email:</strong> ${order.email || "未提供"}</p>
                    <p><strong>地址:</strong> ${order.address}</p>
                    <p><strong>身分證號:</strong> ${
                      order.idNumber || "未提供"
                    }</p>
                    ${
                      order.taxId
                        ? `<p><strong>統一編號:</strong> ${order.taxId}</p>`
                        : '<p><strong>統一編號:</strong> <span style="color: #999;">無（個人）</span></p>'
                    }
                    <p><strong>訂單時間:</strong> ${new Date(
                      order.createdAt
                    ).toLocaleString()}</p>
                </div>
            </div>
            
            <!-- 發票資訊 -->
            <div style="background-color: #d1ecf1; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h4 style="color: #0c5460; margin-top: 0;">📧 電子發票資訊</h4>
                <p><strong>發票類型:</strong> ${
                  order.taxId ? "公司發票" : "個人發票"
                }</p>
                <p><strong>發票寄送信箱:</strong> ${order.email}</p>
                ${
                  order.taxId
                    ? `<p><strong>統一編號:</strong> ${order.taxId}</p>`
                    : ""
                }
            </div>
            
            ${servicesHtml}
            
            <div style="background-color: #f0f8ff; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h4 style="color: #1a73e8; margin-top: 0;">費用詳情</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>初步海運費:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${(
                          calculationResult?.initialSeaFreightCost || 0
                        ).toLocaleString()} 台幣</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>最終海運費(含低消):</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${(
                          calculationResult?.finalSeaFreightCost || 0
                        ).toLocaleString()} 台幣</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>偏遠地區費:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${(
                          calculationResult?.remoteFee || 0
                        ).toLocaleString()} 台幣</td>
                    </tr>
                    ${
                      order.serviceQuoted
                        ? `
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>加值服務費（參考）:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${(
                          order.serviceQuoteAmount || 0
                        ).toLocaleString()} 台幣</td>
                    </tr>
                    `
                        : ""
                    }
                    <tr style="background-color: #fffacd;">
                        <td style="padding: 12px; font-size: 1.2em;"><strong>運費總計:</strong></td>
                        <td style="padding: 12px; text-align: right; font-size: 1.2em; color: #e74c3c;">
                            <strong>${(
                              calculationResult?.finalTotal || 0
                            ).toLocaleString()} 台幣</strong>
                        </td>
                    </tr>
                    ${
                      order.serviceQuoted
                        ? `
                    <tr style="background-color: #e8f5e9;">
                        <td style="padding: 12px; font-size: 1.3em;"><strong>含加值服務總計（參考）:</strong></td>
                        <td style="padding: 12px; text-align: right; font-size: 1.3em; color: #2e7d32;">
                            <strong>${(
                              (calculationResult?.finalTotal || 0) +
                              (order.serviceQuoteAmount || 0)
                            ).toLocaleString()} 台幣</strong>
                        </td>
                    </tr>
                    `
                        : ""
                    }
                </table>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h4 style="color: #1a73e8; margin-top: 0;">商品列表</h4>
                ${itemsHtml}
            </div>
        `;
    modal.style.display = "flex";
  };

  // 提交加值服務報價
  window.submitServiceQuote = async (orderId) => {
    const quoteInput = document.getElementById(`service-quote-${orderId}`);
    const amount = parseFloat(quoteInput.value);

    if (isNaN(amount) || amount <= 0) {
      alert("請輸入有效的報價金額");
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/orders/${orderId}/service-quote`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            serviceQuoteAmount: amount,
            serviceQuoted: true,
          }),
        }
      );

      if (response.ok) {
        alert("報價成功！");
        await fetchAndRender(); // 重新載入資料
        modal.style.display = "none";
      } else {
        alert("報價失敗，請稍後再試");
      }
    } catch (error) {
      console.error("報價失敗:", error);
      alert("系統錯誤，請稍後再試");
    }
  };

  // 更新加值服務報價
  window.updateServiceQuote = async (orderId) => {
    const quoteInput = document.getElementById(`update-quote-${orderId}`);
    const amount = parseFloat(quoteInput.value);

    if (isNaN(amount) || amount <= 0) {
      alert("請輸入有效的報價金額");
      return;
    }

    try {
      const response = await fetch(
        `/api/admin/orders/${orderId}/service-quote`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            serviceQuoteAmount: amount,
            serviceQuoted: true,
          }),
        }
      );

      if (response.ok) {
        alert("報價更新成功！");
        await fetchAndRender(); // 重新載入資料
        modal.style.display = "none";
      } else {
        alert("更新失敗，請稍後再試");
      }
    } catch (error) {
      console.error("更新失敗:", error);
      alert("系統錯誤，請稍後再試");
    }
  };

  // 取得並渲染資料
  const fetchAndRender = async () => {
    try {
      const params = new URLSearchParams({
        status: filterStatus.value,
        assignedToId: filterUser.value,
        search: searchInput.value,
      }).toString();

      const [usersResponse, ordersResponse, statsResponse] = await Promise.all([
        fetch("/api/admin/users", fetchOptions),
        fetch(`/api/admin/orders?${params}`, fetchOptions),
        fetch("/api/admin/stats", fetchOptions),
      ]);

      if (ordersResponse.status === 401) {
        localStorage.removeItem("authToken");
        window.location.href = "/login.html";
        return;
      }

      const users = await usersResponse.json();
      const orders = await ordersResponse.json();
      const stats = await statsResponse.json();

      allUsers = users;
      allOrders = orders.map((order) => {
        if (typeof order.calculationResult === "string") {
          try {
            order.calculationResult = JSON.parse(order.calculationResult);
          } catch (e) {
            console.error("解析訂單 JSON 失敗:", e);
            order.calculationResult = {};
          }
        }
        return order;
      });

      // 計算待報價服務數量
      const pendingServiceQuotes = allOrders.filter((order) => {
        const services = parseAdditionalServices(order.additionalServices);
        return (
          services &&
          (services.carryUpstairs?.needed || services.assembly?.needed) &&
          !order.serviceQuoted
        );
      }).length;

      // 更新統計數據
      document.getElementById("stats-today").textContent =
        stats.newOrdersToday || 0;
      document.getElementById("stats-pending").textContent =
        stats.pendingOrders || 0;
      document.getElementById("stats-month").textContent =
        stats.totalOrdersThisMonth || 0;
      document.getElementById("stats-services").textContent =
        pendingServiceQuotes;

      // 更新負責人選單
      if (filterUser.options.length <= 1) {
        users.forEach((user) => {
          const option = document.createElement("option");
          option.value = user.id;
          option.textContent = user.username;
          filterUser.appendChild(option);
        });
      }

      renderOrders(allOrders, allUsers);
    } catch (error) {
      console.error("載入後台資料失敗:", error);
      alert("無法載入後台資料，請重新登入或聯繫管理員。");
    }
  };

  // 事件委派
  ordersTableBody.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-view-detail")) {
      showOrderDetail(e.target.dataset.orderId);
    }
  });

  ordersTableBody.addEventListener("change", async (e) => {
    const target = e.target;
    const orderId = target.dataset.orderId;

    const updateHeaders = { ...headers, cache: "no-cache" };

    if (target.classList.contains("status-select")) {
      await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "PUT",
        headers: updateHeaders,
        body: JSON.stringify({ status: target.value }),
      });
    }
    if (target.classList.contains("assign-select")) {
      await fetch(`/api/admin/orders/${orderId}/assign`, {
        method: "PUT",
        headers: updateHeaders,
        body: JSON.stringify({ userId: target.value || null }),
      });
    }
  });

  // 篩選事件
  filterStatus.addEventListener("change", fetchAndRender);
  filterUser.addEventListener("change", fetchAndRender);
  searchInput.addEventListener("input", fetchAndRender);
  filterHasServices.addEventListener("change", () => {
    renderOrders(allOrders, allUsers);
  });

  // 初始載入
  fetchAndRender();

  // 每 30 秒自動更新（檢查新訂單）
  setInterval(fetchAndRender, 30000);
});
