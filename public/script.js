// public/script.js - 優化版本，含詳細計算公式和超重超長費

document.addEventListener("DOMContentLoaded", () => {
  // --- 檢查會員登入狀態 ---
  const customerToken = localStorage.getItem("customerToken");
  let currentCustomer = null;

  if (customerToken) {
    // 驗證 token 並取得會員資料
    fetch("/api/customers/profile", {
      headers: {
        Authorization: `Bearer ${customerToken}`,
      },
    })
      .then((response) => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error("Token invalid");
        }
      })
      .then((customer) => {
        currentCustomer = customer;
        // 顯示會員歡迎訊息
        showCustomerInfo(customer);
        // 自動填入會員預設資料
        autoFillCustomerData(customer);
      })
      .catch((error) => {
        console.log("會員未登入或 token 無效");
        localStorage.removeItem("customerToken");
      });
  }

  // 顯示會員資訊
  function showCustomerInfo(customer) {
    const infoSection = document.querySelector(".info-section");
    if (infoSection) {
      const welcomeDiv = document.createElement("div");
      welcomeDiv.style.backgroundColor = "#e9f5ff";
      welcomeDiv.style.padding = "15px";
      welcomeDiv.style.borderRadius = "5px";
      welcomeDiv.style.marginBottom = "15px";
      welcomeDiv.innerHTML = `
        <p style="margin: 0; color: #1a73e8; font-weight: bold;">
          歡迎回來，${customer.name}！
          <a href="/customer.html" style="margin-left: 10px;">會員中心</a>
          <button onclick="customerLogout()" style="margin-left: 10px; padding: 5px 10px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer;">登出</button>
        </p>
      `;
      infoSection.insertBefore(welcomeDiv, infoSection.firstChild);
    }
  }

  // 自動填入會員預設資料
  function autoFillCustomerData(customer) {
    const lineNicknameInput = document.getElementById("lineNickname");
    if (lineNicknameInput && customer.lineNickname) {
      lineNicknameInput.value = customer.lineNickname;
    }
  }

  // 會員登出功能
  window.customerLogout = function () {
    if (confirm("確定要登出嗎？")) {
      localStorage.removeItem("customerToken");
      location.reload();
    }
  };

  // === 以下為原本的 script.js 內容 ===

  // --- 1. 資料定義 ---
  const rates = {
    general: { name: "一般家具", weightRate: 22, volumeRate: 125 },
    special_a: { name: "特殊家具A", weightRate: 32, volumeRate: 184 },
    special_b: { name: "特殊家具B", weightRate: 40, volumeRate: 224 },
    special_c: { name: "特殊家具C", weightRate: 50, volumeRate: 274 },
  };
  const MINIMUM_CHARGE = 2000;
  const VOLUME_DIVISOR = 28317;
  const CBM_TO_CAI_FACTOR = 35.3;
  const OVERSIZED_LIMIT = 300;
  const OVERWEIGHT_LIMIT = 100; // 新增：超重限制
  const OVERWEIGHT_FEE = 800; // 新增：超重費
  const OVERSIZED_FEE = 800; // 新增：超長費
  let itemCount = 0;

  // --- 2. 獲取 HTML 元素 ---
  const itemList = document.getElementById("itemList");
  const addItemBtn = document.getElementById("addItemBtn");
  const calculateBtn = document.getElementById("calculateBtn");
  const resultsContainer = document.getElementById("resultsContainer");
  const deliveryLocationSelect = document.getElementById("deliveryLocation");
  const lineNicknameInput = document.getElementById("lineNickname");
  const copyAddressBtn = document.getElementById("copyAddressBtn");
  const usageCountSpan = document.getElementById("usageCount");

  // --- 3. 核心功能函式 ---

  let saveTimeout;
  const saveItemsToLocalStorage = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const items = [];
      document.querySelectorAll(".item-group").forEach((group) => {
        const id = group.id.split("-")[1];
        if (!id) return;
        const itemData = {
          name: document.getElementById(`name-${id}`).value,
          calcMethod: group.querySelector(
            `input[name="calc-method-${id}"]:checked`
          ).value,
          length: document.getElementById(`length-${id}`).value,
          width: document.getElementById(`width-${id}`).value,
          height: document.getElementById(`height-${id}`).value,
          cbm: document.getElementById(`cbm-${id}`).value,
          weight: document.getElementById(`weight-${id}`).value,
          quantity: document.getElementById(`quantity-${id}`).value,
          type: document.getElementById(`type-${id}`).value,
        };
        items.push(itemData);
      });
      localStorage.setItem("draftItems", JSON.stringify(items));
    }, 500);
  };

  const loadItemsFromLocalStorage = () => {
    const draftItemsJSON = localStorage.getItem("draftItems");
    if (draftItemsJSON) {
      try {
        const draftItems = JSON.parse(draftItemsJSON);
        if (draftItems && Array.isArray(draftItems) && draftItems.length > 0) {
          itemList.innerHTML = "";
          itemCount = 0;
          draftItems.forEach((itemData) => {
            addNewItem();
            const id = itemCount;
            document.getElementById(`name-${id}`).value = itemData.name || "";
            document.getElementById(`length-${id}`).value =
              itemData.length || "";
            document.getElementById(`width-${id}`).value = itemData.width || "";
            document.getElementById(`height-${id}`).value =
              itemData.height || "";
            document.getElementById(`cbm-${id}`).value = itemData.cbm || "";
            document.getElementById(`weight-${id}`).value =
              itemData.weight || "";
            document.getElementById(`quantity-${id}`).value =
              itemData.quantity || "1";
            document.getElementById(`type-${id}`).value =
              itemData.type || "general";

            const radio = document.querySelector(
              `input[name="calc-method-${id}"][value="${itemData.calcMethod}"]`
            );
            if (radio) {
              radio.checked = true;
              const event = new Event("change", { bubbles: true });
              radio.dispatchEvent(event);
            }
          });
        }
      } catch (e) {
        console.error("無法解析草稿資料:", e);
        localStorage.removeItem("draftItems");
      }
    }
  };

  function initializeUsageCounter() {
    const baseCount = 5000;
    let currentCount = localStorage.getItem("usageCount");
    if (currentCount === null) {
      currentCount = baseCount + Math.floor(Math.random() * 50);
    } else {
      currentCount = parseInt(currentCount, 10);
    }
    currentCount += Math.floor(Math.random() * 3) + 1;
    localStorage.setItem("usageCount", currentCount);
    if (usageCountSpan) {
      usageCountSpan.textContent = currentCount.toLocaleString();
    }
  }

  function addNewItem() {
    itemCount++;
    const itemDiv = document.createElement("div");
    itemDiv.className = "item-group";
    itemDiv.id = `item-${itemCount}`;
    let optionsHtml = "";
    for (const key in rates) {
      optionsHtml += `<option value="${key}">${rates[key].name}</option>`;
    }
    itemDiv.innerHTML = `
            <input type="text" id="name-${itemCount}" class="item-name-input" placeholder="請輸入商品名稱 (例如: 客廳沙發)">
            <div class="calc-method-toggle">
                <label><input type="radio" name="calc-method-${itemCount}" value="dimensions" checked> 依尺寸 (長x寬x高)</label>
                <label><input type="radio" name="calc-method-${itemCount}" value="cbm"> 依體積 (立方米/方)</label>
            </div>
            <div class="dimensions-input-wrapper">
                <div class="input-row">
                    <div class="input-wrapper"><label for="length-${itemCount}">長 (cm)</label><input type="number" id="length-${itemCount}" placeholder="單件" min="0"><div class="validation-message">請輸入正數</div></div>
                    <div class="input-wrapper"><label for="width-${itemCount}">寬 (cm)</label><input type="number" id="width-${itemCount}" placeholder="單件" min="0"><div class="validation-message">請輸入正數</div></div>
                    <div class="input-wrapper"><label for="height-${itemCount}">高 (cm)</label><input type="number" id="height-${itemCount}" placeholder="單件" min="0"><div class="validation-message">請輸入正數</div></div>
                </div>
            </div>
            <div class="cbm-input-wrapper"> 
                <div class="input-row">
                    <div class="input-wrapper"><label for="cbm-${itemCount}">立方米 (方)</label><input type="number" id="cbm-${itemCount}" placeholder="單件" min="0"><div class="validation-message">請輸入正數</div></div>
                </div>
            </div>
            <div class="input-row">
                <div class="input-wrapper"><label for="weight-${itemCount}">重量 (kg)</label><input type="number" id="weight-${itemCount}" placeholder="單件" min="0"><div class="validation-message">請輸入正數</div></div>
                <div class="input-wrapper"><label for="quantity-${itemCount}">數量</label><input type="number" id="quantity-${itemCount}" value="1" min="1"><div class="validation-message">數量至少為 1</div></div>
            </div>
            
            <div class="input-row">
                <div class="input-wrapper"><label for="type-${itemCount}">家具種類</label><select id="type-${itemCount}">${optionsHtml}</select></div>
            </div>
            ${
              itemCount > 1
                ? '<button class="btn-remove" title="移除此項">X</button>'
                : ""
            }
        `;
    itemList.appendChild(itemDiv);
    const radioButtons = itemDiv.querySelectorAll(
      `input[name="calc-method-${itemCount}"]`
    );
    const dimensionsWrapper = itemDiv.querySelector(
      ".dimensions-input-wrapper"
    );
    const cbmWrapper = itemDiv.querySelector(".cbm-input-wrapper");
    radioButtons.forEach((radio) => {
      radio.addEventListener("change", (event) => {
        dimensionsWrapper.style.display =
          event.target.value === "dimensions" ? "block" : "none";
        cbmWrapper.style.display =
          event.target.value === "cbm" ? "block" : "none";
      });
    });
  }

  const validateInput = (input) => {
    const value = parseFloat(input.value);
    const min = parseFloat(input.getAttribute("min"));
    const wrapper = input.parentElement;
    const messageDiv = wrapper.querySelector(".validation-message");
    if (!messageDiv) return true;
    let isValid = !isNaN(value) && value >= min;
    if (input.value.trim() === "" && input.offsetParent !== null) {
      isValid = false;
    }
    if (isValid) {
      input.classList.remove("invalid");
      messageDiv.style.display = "none";
    } else {
      input.classList.add("invalid");
      messageDiv.style.display = "block";
    }
    return isValid;
  };

  function calculateTotal() {
    const originalBtnText = calculateBtn.textContent;
    calculateBtn.disabled = true;
    calculateBtn.innerHTML = `<span class="spinner"></span> 計算中...`;

    setTimeout(() => {
      try {
        resultsContainer.innerHTML = "";

        if (deliveryLocationSelect.value === "") {
          alert("請務必選擇一個配送地區！");
          throw new Error("Validation failed: delivery location not selected.");
        }

        let allFormsAreValid = true;
        document
          .querySelectorAll('.item-group input[type="number"]')
          .forEach((input) => {
            if (input.offsetParent !== null) {
              if (!validateInput(input)) {
                allFormsAreValid = false;
              }
            }
          });

        if (!allFormsAreValid) {
          alert("部分欄位資料有誤，請檢查紅色提示的欄位。");
          throw new Error("Validation failed: invalid fields.");
        }

        const allItemsData = Array.from(
          document.querySelectorAll(".item-group")
        )
          .map((itemEl, index) => {
            const id = itemEl.id.split("-")[1];
            const name =
              document.getElementById(`name-${id}`).value.trim() ||
              `貨物 ${index + 1}`;
            const quantity =
              parseInt(document.getElementById(`quantity-${id}`).value, 10) ||
              1;
            const singleWeight = parseFloat(
              document.getElementById(`weight-${id}`).value
            );
            const type = document.getElementById(`type-${id}`).value;
            const calcMethod = itemEl.querySelector(
              `input[name="calc-method-${id}"]:checked`
            ).value;
            let singleVolume = 0,
              length = 0,
              width = 0,
              height = 0,
              cbm = 0;
            let hasOversizedItemOnThisItem = false;
            let isOverweight = false;

            if (calcMethod === "dimensions") {
              length = parseFloat(
                document.getElementById(`length-${id}`).value
              );
              width = parseFloat(document.getElementById(`width-${id}`).value);
              height = parseFloat(
                document.getElementById(`height-${id}`).value
              );
              if (
                isNaN(length) ||
                isNaN(width) ||
                isNaN(height) ||
                isNaN(singleWeight)
              )
                return null;
              singleVolume = Math.ceil(
                (length * width * height) / VOLUME_DIVISOR
              );
              if (
                length > OVERSIZED_LIMIT ||
                width > OVERSIZED_LIMIT ||
                height > OVERSIZED_LIMIT
              ) {
                hasOversizedItemOnThisItem = true;
              }
            } else {
              cbm = parseFloat(document.getElementById(`cbm-${id}`).value);
              if (isNaN(cbm) || isNaN(singleWeight)) return null;
              singleVolume = Math.ceil(cbm * CBM_TO_CAI_FACTOR);
            }

            // 檢查是否超重
            if (singleWeight > OVERWEIGHT_LIMIT) {
              isOverweight = true;
            }

            return {
              id: index + 1,
              name,
              quantity,
              singleWeight,
              type,
              singleVolume,
              cbm,
              calcMethod,
              length,
              width,
              height,
              hasOversizedItem: hasOversizedItemOnThisItem,
              isOverweight: isOverweight,
            };
          })
          .filter((item) => item !== null);

        if (allItemsData.length === 0) {
          throw new Error("No valid items to calculate.");
        }

        let initialSeaFreightCost = 0;
        let totalShipmentVolume = 0;
        let hasOversizedItem = false;
        let totalOverweightFee = 0;
        let totalOversizedFee = 0;

        allItemsData.forEach((item) => {
          if (item.hasOversizedItem) {
            hasOversizedItem = true;
            item.oversizedFee = OVERSIZED_FEE * item.quantity;
            totalOversizedFee += item.oversizedFee;
          }
          if (item.isOverweight) {
            item.overweightFee = OVERWEIGHT_FEE * item.quantity;
            totalOverweightFee += item.overweightFee;
          }

          const rateInfo = rates[item.type];
          item.rateInfo = rateInfo;
          const totalItemWeight = item.singleWeight * item.quantity;
          const totalItemVolume = item.singleVolume * item.quantity;
          item.totalWeight = totalItemWeight;
          item.totalVolume = totalItemVolume;
          const itemWeightCost = totalItemWeight * rateInfo.weightRate;
          const itemVolumeCost = totalItemVolume * rateInfo.volumeRate;
          const itemFinalCost = Math.max(itemWeightCost, itemVolumeCost);
          item.itemWeightCost = itemWeightCost;
          item.itemVolumeCost = itemVolumeCost;
          item.itemFinalCost = itemFinalCost;
          initialSeaFreightCost += itemFinalCost;
          totalShipmentVolume += totalItemVolume;
        });

        const finalSeaFreightCost = Math.max(
          initialSeaFreightCost,
          MINIMUM_CHARGE
        );
        const remoteAreaRate = parseFloat(deliveryLocationSelect.value);
        let remoteFee = 0;
        let totalCbm = totalShipmentVolume / CBM_TO_CAI_FACTOR;
        if (remoteAreaRate > 0) {
          remoteFee = totalCbm * remoteAreaRate;
        }
        const finalTotal =
          finalSeaFreightCost +
          remoteFee +
          totalOverweightFee +
          totalOversizedFee;

        const calculationResultData = {
          allItemsData,
          totalShipmentVolume,
          totalCbm,
          initialSeaFreightCost,
          finalSeaFreightCost,
          remoteAreaRate,
          remoteFee,
          hasOversizedItem,
          totalOverweightFee,
          totalOversizedFee,
          finalTotal,
        };

        displayResults(calculationResultData);

        const resultsActions = document.createElement("div");
        resultsActions.className = "controls";
        resultsActions.style.marginTop = "20px";

        const shareButton = document.createElement("button");
        shareButton.textContent = "複製估價連結分享";
        shareButton.className = "btn";
        shareButton.style.backgroundColor = "#f39c12";
        shareButton.style.color = "white";
        shareButton.onclick = () =>
          shareQuote(shareButton, calculationResultData);

        const proceedButton = document.createElement("button");
        proceedButton.textContent = "我要寄送 (下一步)";
        proceedButton.className = "btn btn-proceed";
        proceedButton.onclick = () => {
          const dataToStore = {
            lineNickname: lineNicknameInput.value,
            calculationResult: calculationResultData,
            customerToken: customerToken, // 儲存會員 token
          };
          localStorage.setItem("calculationData", JSON.stringify(dataToStore));

          // 如果是會員，可以直接跳到訂單頁面並自動填入資料
          if (currentCustomer) {
            window.location.href = "order.html?prefill=true";
          } else {
            window.location.href = "order.html";
          }
        };

        resultsActions.appendChild(shareButton);
        resultsActions.appendChild(proceedButton);
        resultsContainer.appendChild(resultsActions);
      } catch (error) {
        console.error("計算時發生錯誤:", error);
        if (!error.message.startsWith("Validation failed")) {
          alert(
            "計算過程中發生預期外的錯誤，請檢查所有欄位或刷新頁面後再試一次。"
          );
        }
      } finally {
        calculateBtn.disabled = false;
        calculateBtn.innerHTML = originalBtnText;
      }
    }, 50);
  }

  function displayResults(data) {
    const {
      allItemsData,
      totalShipmentVolume,
      totalCbm,
      initialSeaFreightCost,
      finalSeaFreightCost,
      remoteAreaRate,
      remoteFee,
      hasOversizedItem,
      totalOverweightFee,
      totalOversizedFee,
      finalTotal,
    } = data;

    let resultsHTML = '<div class="result-section">';
    resultsHTML += `<h4>--- 費用計算明細 (逐筆) ---</h4>`;

    allItemsData.forEach((item) => {
      resultsHTML += `<div style="background-color: #f9f9f9; padding: 10px; margin-bottom: 15px; border-radius: 5px;">`;
      resultsHTML += `<p><strong style="font-size: 16px;">[${item.name} × ${item.quantity} 件 - ${item.rateInfo.name}]</strong></p>`;

      // 材積計算公式
      if (item.calcMethod === "cbm" && item.cbm > 0) {
        resultsHTML += `<div style="background-color: #fff; padding: 8px; margin: 5px 0; border-left: 3px solid #3498db;">`;
        resultsHTML += `<small style="color:#555;"><strong>體積換算：</strong></small><br>`;
        resultsHTML += `<small style="color:#555;">單件立方米: ${item.cbm} 方 × ${CBM_TO_CAI_FACTOR} = ${item.singleVolume} 材</small>`;
        resultsHTML += `</div>`;
      } else if (item.calcMethod === "dimensions") {
        resultsHTML += `<div style="background-color: #fff; padding: 8px; margin: 5px 0; border-left: 3px solid #3498db;">`;
        resultsHTML += `<small style="color:#555;"><strong>材積計算：</strong></small><br>`;
        resultsHTML += `<small style="color:#555;">(${item.length}cm × ${item.width}cm × ${item.height}cm) ÷ ${VOLUME_DIVISOR} = ${item.singleVolume} 材/件</small>`;
        resultsHTML += `</div>`;
      }

      // 總材積與總重量
      resultsHTML += `<div style="background-color: #fff; padding: 8px; margin: 5px 0; border-left: 3px solid #9b59b6;">`;
      resultsHTML += `<small style="color:#555;"><strong>數量計算：</strong></small><br>`;
      resultsHTML += `<small style="color:#555;">總材積: ${item.singleVolume} 材/件 × ${item.quantity} 件 = ${item.totalVolume} 材</small><br>`;
      resultsHTML += `<small style="color:#555;">總重量: ${item.singleWeight} kg/件 × ${item.quantity} 件 = ${item.totalWeight} kg</small>`;
      resultsHTML += `</div>`;

      // 費用計算
      resultsHTML += `<div style="background-color: #fff; padding: 8px; margin: 5px 0; border-left: 3px solid #27ae60;">`;
      resultsHTML += `<small style="color:#555;"><strong>運費計算：</strong></small><br>`;
      resultsHTML += `材積費用: ${item.totalVolume} 材 × ${
        item.rateInfo.volumeRate
      } 元/材 = <span style="color: #e74c3c; font-weight: bold;">${Math.round(
        item.itemVolumeCost
      ).toLocaleString()} 台幣</span><br>`;
      resultsHTML += `重量費用: ${item.totalWeight} kg × ${
        item.rateInfo.weightRate
      } 元/kg = <span style="color: #e74c3c; font-weight: bold;">${Math.round(
        item.itemWeightCost
      ).toLocaleString()} 台幣</span><br>`;
      resultsHTML += `→ 基本運費(取較高者): <strong style="color: #e74c3c; font-size: 15px;">${Math.round(
        item.itemFinalCost
      ).toLocaleString()} 台幣</strong>`;
      resultsHTML += `</div>`;

      // 額外費用
      if (item.isOverweight || item.hasOversizedItem) {
        resultsHTML += `<div style="background-color: #fff3cd; padding: 8px; margin: 5px 0; border-left: 3px solid #ffc107;">`;
        resultsHTML += `<small style="color:#856404;"><strong>額外費用：</strong></small><br>`;
        if (item.isOverweight) {
          resultsHTML += `<small style="color:#856404;">⚠ 單件超重 (>${OVERWEIGHT_LIMIT}kg): ${OVERWEIGHT_FEE} 元/件 × ${
            item.quantity
          } 件 = <span style="color: #e74c3c; font-weight: bold;">${item.overweightFee.toLocaleString()} 台幣</span></small><br>`;
        }
        if (item.hasOversizedItem) {
          resultsHTML += `<small style="color:#856404;">⚠ 單邊超長 (>${OVERSIZED_LIMIT}cm): ${OVERSIZED_FEE} 元/件 × ${
            item.quantity
          } 件 = <span style="color: #e74c3c; font-weight: bold;">${item.oversizedFee.toLocaleString()} 台幣</span></small><br>`;
        }
        resultsHTML += `</div>`;
      }

      resultsHTML += `</div>`;
    });

    resultsHTML += `<hr>`;

    // 費用彙總
    resultsHTML += `<div style="background-color: #e8f4f8; padding: 15px; border-radius: 5px; margin: 10px 0;">`;
    resultsHTML += `<p><strong>初步海運費 (所有項目加總): <span style="color: #e74c3c;">${Math.round(
      initialSeaFreightCost
    ).toLocaleString()} 台幣</span></strong></p>`;

    if (initialSeaFreightCost < MINIMUM_CHARGE) {
      resultsHTML += `<p style="color: #e74c3c;">↳ 未達最低消費 ${MINIMUM_CHARGE} 元，故海運費以低消計: <strong>${finalSeaFreightCost.toLocaleString()} 台幣</strong></p>`;
    } else {
      resultsHTML += `<p style="color: green;">↳ 已超過最低消費，海運費為: <strong>${finalSeaFreightCost.toLocaleString()} 台幣</strong></p>`;
    }

    if (totalOverweightFee > 0) {
      resultsHTML += `<p><strong>總超重費: <span style="color: #e74c3c;">${totalOverweightFee.toLocaleString()} 台幣</span></strong></p>`;
    }

    if (totalOversizedFee > 0) {
      resultsHTML += `<p><strong>總超長費: <span style="color: #e74c3c;">${totalOversizedFee.toLocaleString()} 台幣</span></strong></p>`;
    }

    // ========== 修改偏遠地區費用顯示部分 ==========
    if (remoteAreaRate > 0) {
      // 取得選擇的地區名稱
      const selectedOption =
        deliveryLocationSelect.options[deliveryLocationSelect.selectedIndex];
      const areaName = selectedOption.textContent;

      // 檢查是否為東部需要客服確認的地區
      const needCustomerService =
        remoteAreaRate === 4500 &&
        (areaName.includes("宜蘭其他地區") ||
          areaName.includes("花蓮全區") ||
          areaName.includes("台東全區"));

      resultsHTML += `<hr>`;
      resultsHTML += `<div style="background-color: #fff; padding: 10px; border-left: 3px solid #e67e22;">`;
      resultsHTML += `<p><strong>偏遠地區附加費計算：</strong></p>`;
      resultsHTML += `<p>配送地區：<strong style="color: #e67e22;">${areaName}</strong></p>`;
      resultsHTML += `<p>(總材積 ${totalShipmentVolume} 材 ÷ ${CBM_TO_CAI_FACTOR} = ${totalCbm.toFixed(
        2
      )} 方) × ${remoteAreaRate.toLocaleString()} 元/方</p>`;
      resultsHTML += `<p>→ 偏遠費用: <strong style="color: #e74c3c;">${Math.round(
        remoteFee
      ).toLocaleString()} 台幣${
        needCustomerService ? " (起)" : ""
      }</strong></p>`;

      // 如果是東部地區，加上提醒
      if (needCustomerService) {
        resultsHTML += `
          <div style="background: #fff3cd; padding: 10px; margin-top: 10px; border-radius: 5px; border: 1px solid #ffc107;">
            <strong style="color: #ff6b6b;">⚠️ 東部地區重要提醒：</strong>
            <p style="margin: 8px 0 5px 0; color: #856404; font-size: 14px;">
              您選擇的是<strong>${areaName
                .replace("⚠️", "")
                .trim()}</strong>，此地區運輸路線較為特殊。
            </p>
            <p style="margin: 5px 0; color: #856404; font-size: 14px;">
              顯示金額 <strong>NT$ ${Math.round(
                remoteFee
              ).toLocaleString()}</strong> 為<strong>起始價格</strong>，
              實際運費可能會根據：
            </p>
            <ul style="margin: 5px 0 10px 20px; color: #856404; font-size: 13px;">
              <li>具體配送地址的偏遠程度</li>
              <li>貨物特性（易碎、特殊形狀等）</li>
              <li>當時的運輸路況與季節因素</li>
            </ul>
            <p style="margin: 10px 0 5px 0; color: #856404; font-size: 14px;">
              <strong>建議您聯繫客服獲取準確報價：</strong>
            </p>
            <a href="https://lin.ee/eK6HptX" target="_blank" 
               style="display: inline-block; margin-top: 10px; padding: 10px 25px; 
                      background: #00c300; color: white; text-decoration: none; 
                      border-radius: 20px; font-weight: bold; font-size: 15px;
                      box-shadow: 0 2px 5px rgba(0,195,0,0.3);">
              📞 立即聯繫 LINE 客服
            </a>
          </div>
        `;
      }

      resultsHTML += `</div>`;
    }
    // ========== 修改結束 ==========

    resultsHTML += `</div>`;

    resultsHTML += `</div>`;

    // 最終總計
    resultsHTML += `
      <div class="result-section" style="text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px;">
        <h2 style="color: white;">最終總計費用</h2>
        <div class="total-cost" style="font-size: 36px; font-weight: bold; margin: 15px 0;">${Math.round(
          finalTotal
        ).toLocaleString()} 台幣</div>
        <small style="color: #f0f0f0;">
          (海運費 ${Math.round(finalSeaFreightCost).toLocaleString()} 
          + 偏遠費 ${Math.round(remoteFee).toLocaleString()}
          ${
            totalOverweightFee > 0
              ? ` + 超重費 ${totalOverweightFee.toLocaleString()}`
              : ""
          }
          ${
            totalOversizedFee > 0
              ? ` + 超長費 ${totalOversizedFee.toLocaleString()}`
              : ""
          })
        </small>
      </div>
    `;

    resultsHTML += `<div class="final-disclaimer">此試算表僅適用於小跑豬傢俱專線，試算費用僅供參考，最終金額以實際入庫丈量為準。</div>`;
    resultsContainer.innerHTML = resultsHTML;
  }

  async function shareQuote(button, calculationResultData) {
    const originalBtnText = button.textContent;
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> 產生連結中...`;

    const oldFallback = document.getElementById("share-fallback");
    if (oldFallback) oldFallback.remove();

    try {
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calculationResult: calculationResultData }),
      });

      if (!response.ok) throw new Error("無法建立分享連結");

      const { id } = await response.json();
      const shareUrl = `${window.location.origin}/quote.html?id=${id}`;

      try {
        await navigator.clipboard.writeText(shareUrl);
        button.textContent = "連結已複製！";
        button.style.backgroundColor = "#27ae60";
      } catch (copyError) {
        console.warn("自動複製失敗:", copyError);
        button.textContent = "產生成功！";
        button.style.backgroundColor = "#27ae60";
        const fallbackWrapper = document.createElement("div");
        fallbackWrapper.id = "share-fallback";
        fallbackWrapper.className = "share-fallback-wrapper";
        fallbackWrapper.innerHTML = `
                    <p>自動複製失敗！請手動複製以下連結：</p>
                    <input type="text" readonly class="share-fallback-input" value="${shareUrl}">
                `;
        button.parentElement.insertAdjacentElement("afterend", fallbackWrapper);
        fallbackWrapper.querySelector("input").select();
      }
    } catch (error) {
      console.error(error);
      button.textContent = "產生失敗";
      button.style.backgroundColor = "#e74c3c";
    } finally {
      setTimeout(() => {
        button.disabled = false;
        button.innerHTML = originalBtnText;
        button.style.backgroundColor = "#f39c12";
      }, 5000);
    }
  }

  function copyWarehouseAddress() {
    const addressBox = document.getElementById("warehouseAddressBox");
    const textToCopy = addressBox.innerText
      .replace(/\[您的姓名\]/g, "(請填上您的姓名)")
      .replace(/\[您的電話末三碼\]/g, "(請填上您的電話末三碼)")
      .trim();

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        const originalText = copyAddressBtn.textContent;
        copyAddressBtn.textContent = "複製成功！";
        copyAddressBtn.style.backgroundColor = "#27ae60";
        setTimeout(() => {
          copyAddressBtn.textContent = originalText;
          copyAddressBtn.style.backgroundColor = "";
        }, 2000);
      })
      .catch((err) => {
        console.error("複製失敗: ", err);
        alert("複製失敗，請手動複製。");
      });
  }

  // --- 4. 綁定事件監聽 ---
  addItemBtn.addEventListener("click", () => {
    addNewItem();
    saveItemsToLocalStorage();
  });
  calculateBtn.addEventListener("click", calculateTotal);
  copyAddressBtn.addEventListener("click", copyWarehouseAddress);

  itemList.addEventListener("input", (e) => {
    if (e.target.tagName === "INPUT") {
      if (e.target.type === "number") {
        validateInput(e.target);
      }
      saveItemsToLocalStorage();
    }
  });
  itemList.addEventListener("change", saveItemsToLocalStorage);
  itemList.addEventListener("click", (e) => {
    if (e.target.classList.contains("btn-remove")) {
      e.target.closest(".item-group").remove();
      saveItemsToLocalStorage();
    }
  });

  // --- 5. 初始載入 ---
  loadItemsFromLocalStorage();
  if (itemList.children.length === 0) {
    addNewItem();
  }
  initializeUsageCounter();

  // --- 6. 修改：將會員登入/註冊連結移到 LINE 暱稱輸入框旁邊 ---
  const infoSection = document.querySelector(".info-section");
  const lineNicknameLabel = document.querySelector('label[for="lineNickname"]');

  if (infoSection && lineNicknameLabel && !customerToken) {
    // 未登入狀態：在 LINE 暱稱 label 旁加入會員登入連結
    const memberLinkContainer = document.createElement("span");
    memberLinkContainer.style.cssText = "float: right;";

    const customerLink = document.createElement("a");
    customerLink.href = "/customer.html";
    customerLink.textContent = "會員登入/註冊";
    customerLink.style.cssText = `
      color: #1a73e8;
      text-decoration: none;
      font-weight: bold;
      font-size: 14px;
    `;
    customerLink.onmouseover = function () {
      this.style.textDecoration = "underline";
    };
    customerLink.onmouseout = function () {
      this.style.textDecoration = "none";
    };

    memberLinkContainer.appendChild(customerLink);
    lineNicknameLabel.appendChild(memberLinkContainer);
  } else if (
    infoSection &&
    lineNicknameLabel &&
    customerToken &&
    currentCustomer
  ) {
    // 已登入狀態：在 LINE 暱稱 label 旁顯示會員資訊
    const memberInfoContainer = document.createElement("span");
    memberInfoContainer.style.cssText = "float: right;";

    const welcomeLink = document.createElement("a");
    welcomeLink.href = "/customer.html";
    welcomeLink.textContent = `已登入: ${currentCustomer.name}`;
    welcomeLink.style.cssText = `
      color: #27ae60;
      text-decoration: none;
      font-weight: bold;
      font-size: 14px;
    `;
    welcomeLink.onmouseover = function () {
      this.style.textDecoration = "underline";
    };
    welcomeLink.onmouseout = function () {
      this.style.textDecoration = "none";
    };

    memberInfoContainer.appendChild(welcomeLink);
    lineNicknameLabel.appendChild(memberInfoContainer);
  }
});
