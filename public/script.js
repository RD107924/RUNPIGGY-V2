// public/script.js - 新增會員檢測部分
// 在原本的 script.js 開頭新增以下程式碼

document.addEventListener("DOMContentLoaded", () => {
  // --- 檢查會員登入狀態 ---
  const customerToken = localStorage.getItem('customerToken');
  let currentCustomer = null;
  
  if (customerToken) {
    // 驗證 token 並取得會員資料
    fetch('/api/customers/profile', {
      headers: {
        'Authorization': `Bearer ${customerToken}`
      }
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Token invalid');
      }
    })
    .then(customer => {
      currentCustomer = customer;
      // 顯示會員歡迎訊息
      showCustomerInfo(customer);
      // 自動填入會員預設資料
      autoFillCustomerData(customer);
    })
    .catch(error => {
      console.log('會員未登入或 token 無效');
      localStorage.removeItem('customerToken');
    });
  }
  
  // 顯示會員資訊
  function showCustomerInfo(customer) {
    const infoSection = document.querySelector('.info-section');
    if (infoSection) {
      const welcomeDiv = document.createElement('div');
      welcomeDiv.style.backgroundColor = '#e9f5ff';
      welcomeDiv.style.padding = '15px';
      welcomeDiv.style.borderRadius = '5px';
      welcomeDiv.style.marginBottom = '15px';
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
    const lineNicknameInput = document.getElementById('lineNickname');
    if (lineNicknameInput && customer.lineNickname) {
      lineNicknameInput.value = customer.lineNickname;
    }
  }
  
  // 會員登出功能
  window.customerLogout = function() {
    if (confirm('確定要登出嗎？')) {
      localStorage.removeItem('customerToken');
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
            return {
              id: index + 1,
              name,
              quantity,
              singleWeight,
              type,
              singleVolume,
              cbm,
              calcMethod,
              hasOversizedItem: hasOversizedItemOnThisItem,
            };
          })
          .filter((item) => item !== null);

        if (allItemsData.length === 0) {
          throw new Error("No valid items to calculate.");
        }

        let initialSeaFreightCost = 0;
        let totalShipmentVolume = 0;
        let hasOversizedItem = false;

        allItemsData.forEach((item) => {
          if (item.hasOversizedItem) hasOversizedItem = true;
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
        const finalTotal = finalSeaFreightCost + remoteFee;

        const calculationResultData = {
          allItemsData,
          totalShipmentVolume,
          totalCbm,
          initialSeaFreightCost,
          finalSeaFreightCost,
          remoteAreaRate,
          remoteFee,
          hasOversizedItem,
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
            customerToken: customerToken // 儲存會員 token
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
      finalTotal,
    } = data;
    let resultsHTML = '<div class="result-section">';
    resultsHTML += `<h4>--- 費用計算明細 (逐筆) ---</h4>`;
    allItemsData.forEach((item) => {
      resultsHTML += `<p><strong>[${item.name} × ${item.quantity} - ${item.rateInfo.name}]</strong><br>`;
      if (item.calcMethod === "cbm" && item.cbm > 0) {
        resultsHTML += `<small style="color:#555;">(單件以立方米輸入: ${item.cbm} 方 × ${CBM_TO_CAI_FACTOR} = ${item.singleVolume} 材)<br></small>`;
      }
      resultsHTML += `<small style="color:#555;">(總材積: ${item.singleVolume} 材/件 × ${item.quantity} = ${item.totalVolume} 材 | 總重量: ${item.singleWeight} kg/件 × ${item.quantity} = ${item.totalWeight} kg)<br></small>`;
      resultsHTML += `材積費用: ${item.totalVolume} 材 × ${
        item.rateInfo.volumeRate
      } = ${Math.round(item.itemVolumeCost).toLocaleString()} 台幣<br>`;
      resultsHTML += `重量費用: ${item.totalWeight} 公斤 × ${
        item.rateInfo.weightRate
      } = ${Math.round(item.itemWeightCost).toLocaleString()} 台幣<br>`;
      resultsHTML += `→ 此筆費用(取較高者): <strong>${Math.round(
        item.itemFinalCost
      ).toLocaleString()} 台幣</strong></p>`;
    });
    resultsHTML += `<hr>`;
    resultsHTML += `<p><strong>初步海運費 (所有項目加總): ${Math.round(
      initialSeaFreightCost
    ).toLocaleString()} 台幣</strong></p>`;
    if (initialSeaFreightCost < MINIMUM_CHARGE) {
      resultsHTML += `<p style="color: #e74c3c;">↳ 未達最低消費 ${MINIMUM_CHARGE} 元，故海運費以低消計: <strong>${finalSeaFreightCost.toLocaleString()} 台幣</strong></p>`;
    } else {
      resultsHTML += `<p style="color: green;">↳ 已超過最低消費，海運費為: <strong>${finalSeaFreightCost.toLocaleString()} 台幣</strong></p>`;
    }
    if (remoteAreaRate > 0) {
      resultsHTML += `<hr>`;
      resultsHTML += `<p><strong>偏遠地區附加費:</strong><br>`;
      resultsHTML += `(總材積 ${totalShipmentVolume} 材 ÷ ${CBM_TO_CAI_FACTOR} = ${totalCbm.toFixed(
        2
      )} 方) × ${remoteAreaRate.toLocaleString()} 元/方<br>`;
      resultsHTML += `→ 費用: <strong>${Math.round(
        remoteFee
      ).toLocaleString()} 台幣</strong></p>`;
    }
    resultsHTML += `</div>`;
    resultsHTML += `
            <div class="result-section" style="text-align: center;">
                <h2>最終總計費用</h2>
                <div class="total-cost">${Math.round(
                  finalTotal
                ).toLocaleString()} 台幣</div>
                <small>(海運費 ${Math.round(
                  finalSeaFreightCost
                ).toLocaleString()} + 偏遠費 ${Math.round(
      remoteFee
    ).toLocaleString()})</small>
            </div>
        `;
    if (hasOversizedItem) {
      resultsHTML += `<div class="final-disclaimer"><strong>提醒：</strong>您的貨物中有單邊超過 300 公分的品項，將會產生超長費 (600元/件 起)，實際費用以入庫報價為準。</div>`;
    }
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
  
  // --- 6. 新增會員快速登入連結 ---
  const adminLoginLink = document.querySelector('.admin-login-link');
  if (adminLoginLink && !customerToken) {
    const customerLink = document.createElement('a');
    customerLink.href = '/customer.html';
    customerLink.textContent = '會員登入/註冊';
    customerLink.style.marginRight = '15px';
    customerLink.style.color = '#1a73e8';
    adminLoginLink.insertBefore(customerLink, adminLoginLink.firstChild);
  }
});