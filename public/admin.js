// public/admin.js (修正訂單詳情顯示)
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
  const modal = document.getElementById("order-detail-modal");
  const modalBody = document.getElementById("modal-body");
  const closeModalBtn = document.querySelector(".modal-close-btn");

  let allOrders = [];

  const statusMap = {
    NEEDS_PURCHASE: "需採購清單",
    PURCHASED: "已採購",
    IN_WAREHOUSE: "已入庫",
    NOT_IN_WAREHOUSE: "未入庫",
    SHIPPED: "已發貨",
    IN_CUSTOMS: "清關中",
    DELIVERY_COMPLETE: "派送完成",
  };

  Object.entries(statusMap).forEach(([key, value]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = value;
    filterStatus.appendChild(option);
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("authToken");
    window.location.href = "/login.html";
  });

  closeModalBtn.addEventListener("click", () => (modal.style.display = "none"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  const renderOrders = (orders, users) => {
    ordersTableBody.innerHTML = orders
      .map((order) => {
        // 解析 JSON 字串（如果需要）
        let calculationResult = order.calculationResult;
        if (typeof calculationResult === "string") {
          try {
            calculationResult = JSON.parse(calculationResult);
          } catch (e) {
            console.error("解析 JSON 失敗:", e);
            calculationResult = {};
          }
        }

        return `
            <tr>
                <td data-label="操作"><button class="btn-view-detail" data-order-id="${
                  order.id
                }">查看</button></td>
                <td data-label="訂單時間">${new Date(order.createdAt)
                  .toLocaleString("sv")
                  .replace(" ", "<br>")}</td>
                <td data-label="收件人">${order.recipientName}</td>
                <td data-label="聯絡電話">${order.phone}</td>
                <td data-label="總金額">${
                  calculationResult?.finalTotal?.toLocaleString() || "N/A"
                } 台幣</td>
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

      // 解析每個訂單的 calculationResult（如果是字串）
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

      if (filterUser.options.length <= 1) {
        users.forEach((user) => {
          const option = document.createElement("option");
          option.value = user.id;
          option.textContent = user.username;
          filterUser.appendChild(option);
        });
      }

      document.getElementById("stats-today").textContent =
        stats.newOrdersToday || 0;
      document.getElementById("stats-pending").textContent =
        stats.pendingOrders || 0;
      document.getElementById("stats-month").textContent =
        stats.totalOrdersThisMonth || 0;
      document.getElementById("stats-users").textContent = stats.userCount || 0;

      renderOrders(allOrders, users);
    } catch (error) {
      console.error("載入後台資料失敗:", error);
      alert("無法載入後台資料，請重新登入或聯繫管理員。");
    }
  };

  const showOrderDetail = (orderId) => {
    const order = allOrders.find((o) => o.id === orderId);
    if (!order) return;

    // 確保 calculationResult 是物件
    let calculationResult = order.calculationResult;
    if (typeof calculationResult === "string") {
      try {
        calculationResult = JSON.parse(calculationResult);
      } catch (e) {
        console.error("解析 JSON 失敗:", e);
        calculationResult = {};
      }
    }

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

    // 顯示詳細資訊
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
                    <p><strong>地址:</strong> ${order.address}</p>
                    <p><strong>身分證號:</strong> ${
                      order.idNumber || "未提供"
                    }</p>
                    <p><strong>訂單時間:</strong> ${new Date(
                      order.createdAt
                    ).toLocaleString()}</p>
                </div>
            </div>
            
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
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>偏遠地區費率:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${
                          calculationResult?.remoteAreaRate || 0
                        } 元/方</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>偏遠地區費:</strong></td>
                        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${(
                          calculationResult?.remoteFee || 0
                        ).toLocaleString()} 台幣</td>
                    </tr>
                    <tr style="background-color: #fffacd;">
                        <td style="padding: 12px; font-size: 1.2em;"><strong>總金額:</strong></td>
                        <td style="padding: 12px; text-align: right; font-size: 1.2em; color: #e74c3c;"><strong>${(
                          calculationResult?.finalTotal || 0
                        ).toLocaleString()} 台幣</strong></td>
                    </tr>
                </table>
            </div>
            
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h4 style="color: #1a73e8; margin-top: 0;">商品列表</h4>
                ${itemsHtml}
            </div>
            
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <h4 style="color: #856404; margin-top: 0;">其他資訊</h4>
                <p><strong>總材積:</strong> ${(
                  calculationResult?.totalShipmentVolume || 0
                ).toLocaleString()} 材</p>
                <p><strong>總立方米:</strong> ${(
                  calculationResult?.totalCbm || 0
                ).toFixed(2)} 方</p>
                <p><strong>是否有超大件:</strong> ${
                  calculationResult?.hasOversizedItem ? "是" : "否"
                }</p>
                <p><strong>訂單狀態:</strong> <span style="padding: 5px 10px; background-color: #1a73e8; color: white; border-radius: 3px;">${
                  statusMap[order.status] || order.status
                }</span></p>
            </div>
        `;
    modal.style.display = "flex";
  };

  // Event Listeners
  filterStatus.addEventListener("change", fetchAndRender);
  filterUser.addEventListener("change", fetchAndRender);
  searchInput.addEventListener("input", fetchAndRender);

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

  // Initial Load
  fetchAndRender();
});
// === 密碼重設相關功能 ===

// 顯示密碼重設確認對話框
async function resetCustomerPassword(customerId, customerName, customerEmail) {
  // 確認對話框
  const confirmMessage = `
確定要重設會員的密碼嗎？

會員姓名：${customerName}
會員信箱：${customerEmail}

密碼將被重設為：88888888
會員登入後將被要求立即修改密碼
  `;

  if (!confirm(confirmMessage)) {
    return;
  }

  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch(
      `/api/admin/customers/${customerId}/reset-password`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = await response.json();

    if (response.ok) {
      // 成功訊息
      alert(`
密碼重設成功！

會員：${customerName} (${customerEmail})
預設密碼：${data.temporaryPassword}

請通知會員使用預設密碼登入，並建議立即修改密碼。
      `);

      // 可選：重新載入會員列表以更新狀態
      if (typeof fetchAndRender === "function") {
        fetchAndRender();
      }
    } else {
      alert(`密碼重設失敗：${data.error}`);
    }
  } catch (error) {
    console.error("密碼重設錯誤:", error);
    alert("網路錯誤，請稍後再試");
  }
}

// 在渲染訂單或會員列表時，加入重設密碼按鈕
// 修改原本的 renderOrders 函數，在會員資訊後面加入按鈕
// 找到顯示會員資訊的地方，加入以下按鈕：

function addResetPasswordButton(order) {
  // 只有當訂單有關聯會員時才顯示按鈕
  if (order.customer && order.customer.id) {
    return `
      <button 
        onclick="resetCustomerPassword('${order.customer.id}', '${order.customer.name}', '${order.customer.email}')"
        style="
          padding: 3px 8px;
          font-size: 12px;
          background-color: #e67e22;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          margin-left: 5px;
        "
        title="重設為預設密碼 88888888"
      >
        重設密碼
      </button>
    `;
  }
  return "";
}

// === 會員管理頁面功能（如果有獨立的會員管理頁面）===

// 載入會員列表（新增或修改現有函數）
async function loadCustomers() {
  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch("/api/admin/customers", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) throw new Error("載入會員失敗");

    const customers = await response.json();

    // 顯示會員列表
    const tableBody = document.getElementById("customersTableBody");
    if (tableBody) {
      tableBody.innerHTML = customers
        .map(
          (customer) => `
        <tr>
          <td>${customer.name}</td>
          <td>${customer.email}</td>
          <td>${customer.phone || "-"}</td>
          <td>${customer._count.orders} 筆</td>
          <td>
            <span style="
              padding: 3px 8px;
              border-radius: 3px;
              font-size: 12px;
              background-color: ${customer.isActive ? "#27ae60" : "#e74c3c"};
              color: white;
            ">
              ${customer.isActive ? "啟用" : "停用"}
            </span>
          </td>
          <td>
            ${
              customer.needPasswordChange
                ? '<span style="color: #e67e22; font-weight: bold;">需要修改</span>'
                : '<span style="color: #27ae60;">正常</span>'
            }
          </td>
          <td>
            <button 
              onclick="resetCustomerPassword('${customer.id}', '${
            customer.name
          }', '${customer.email}')"
              class="btn"
              style="
                padding: 5px 10px;
                font-size: 14px;
                background-color: #e67e22;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
              "
            >
              重設密碼
            </button>
          </td>
        </tr>
      `
        )
        .join("");
    }
  } catch (error) {
    console.error("載入會員列表失敗:", error);
  }
}

// 查看密碼重設歷史記錄
async function viewPasswordResetHistory(customerId) {
  try {
    const token = localStorage.getItem("authToken");
    const response = await fetch(
      `/api/admin/customers/${customerId}/password-reset-history`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const data = await response.json();

    if (data.resetHistory && data.resetHistory.length > 0) {
      const historyText = data.resetHistory
        .map(
          (record) =>
            `${new Date(record.resetAt).toLocaleString()} - 由 ${
              record.resetBy
            } 重設`
        )
        .join("\n");

      alert(`密碼重設記錄：\n\n${historyText}`);
    } else {
      alert("此會員沒有密碼重設記錄");
    }
  } catch (error) {
    console.error("查詢重設記錄失敗:", error);
  }
}
