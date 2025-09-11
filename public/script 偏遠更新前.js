// 常數定義
const VOLUME_DIVISOR = 1000000; // 材積除數
const CBM_TO_CAI_FACTOR = 35.315; // 立方米轉材係數
const MINIMUM_CHARGE = 2000; // 最低運費
const OVERWEIGHT_LIMIT = 100; // 超重限制 (kg)
const OVERWEIGHT_FEE = 600; // 超重費用
const OVERSIZED_LIMIT = 300; // 超長限制 (cm)
const OVERSIZED_FEE = 800; // 超長費用

// 費率定義
const rates = {
  一般家具: { weightRate: 22, volumeRate: 125 },
  "特殊家具 A": { weightRate: 32, volumeRate: 184 },
  "特殊家具 B": { weightRate: 40, volumeRate: 224 },
  "特殊家具 C": { weightRate: 50, volumeRate: 274 },
};

// 偏遠地區資料庫（用於搜尋功能）
const remoteAreasDatabase = {
  1800: [
    "東勢區",
    "新社區",
    "石岡區",
    "和平區",
    "大雪山",
    "穀關",
    "水里鄉",
    "伸港鄉",
    "線西鄉",
    "秀水鄉",
    "芬園鄉",
    "芳苑鄉",
    "大村鄉",
    "大城鄉",
    "竹塘鄉",
    "北斗鎮",
    "溪州鄉",
  ],
  2000: [
    "三芝",
    "石門",
    "烏來",
    "坪林",
    "石碇區",
    "深坑區",
    "萬里",
    "平溪",
    "雙溪",
    "福隆",
    "貢寮",
    "三峽區",
    "淡水竹圍",
    "復興鄉",
    "新埔鎮",
    "關西鎮",
    "橫山鄉",
    "北埔鄉",
    "尖石鄉",
    "五峰鄉",
    "寶山鎮",
    "香山區",
    "造橋鎮",
    "峨嵋鄉",
    "三灣鄉",
    "芎林鄉",
    "頭屋鄉",
    "銅鑼鄉",
    "三義鄉",
    "通霄鎮",
    "苑裡鎮",
    "大湖鄉",
    "卓蘭鎮",
    "泰安鄉",
    "公館鄉",
    "竹南鎮",
  ],
  2500: [
    "名間鄉",
    "四湖鄉",
    "東勢鄉",
    "台西鄉",
    "古坑鄉",
    "口湖鄉",
    "崙背鄉",
    "麥寮鄉",
    "東石鄉",
    "六腳鄉",
    "竹崎鄉",
    "白河區",
    "東山區",
    "大內區",
    "玉井區",
    "山上區",
    "龍崎區",
    "後壁區",
    "左鎮區",
    "燕巢",
    "內門區",
    "大樹",
    "茄萣",
    "林園",
    "旗津",
    "杉林",
    "美濃",
    "永安",
    "阿蓮",
    "田寮",
    "旗山",
  ],
  3000: ["布袋鎮", "北門區", "將軍區", "七股區", "楠西區", "南化區"],
  4000: [
    "南莊鄉",
    "獅潭鄉",
    "竹山鎮",
    "鹿谷鄉",
    "集集鎮",
    "中寮鄉",
    "國姓鄉",
    "仁愛鄉",
    "信義鄉",
    "梨山",
    "奧萬大",
    "埔里",
  ],
  4500: [
    "陽明山",
    "金山",
    "魚池鄉",
    "那瑪夏區",
    "桃源區",
    "茂林",
    "甲仙",
    "六龜",
    "屏東縣",
    "花蓮",
    "台東",
  ],
  5000: ["阿里山", "梅山鄉", "番路", "中埔鄉", "大埔鄉"],
  7000: [
    "車城",
    "滿洲",
    "小琉球",
    "琉球鄉",
    "牡丹",
    "獅子",
    "枋山",
    "春日",
    "枋寮",
    "佳冬",
    "來義",
    "泰武",
    "瑪家",
    "霧臺",
    "三地門",
    "恆春",
    "墾丁",
    "鵝鑾鼻",
    "南澳",
    "釣魚臺",
  ],
};

let itemCount = 0;
let itemsData = [];

// 初始化
document.addEventListener("DOMContentLoaded", function () {
  // 更新使用人數
  updateUsageCount();

  // 綁定事件
  document.getElementById("addItemBtn").addEventListener("click", addItem);
  document
    .getElementById("calculateBtn")
    .addEventListener("click", calculateTotal);
  document
    .getElementById("copyAddressBtn")
    .addEventListener("click", copyWarehouseAddress);

  // 初始加入一個項目
  addItem();

  // 初始化偏遠地區選擇監聽
  initRemoteAreaListeners();
});

// 更新使用人數
function updateUsageCount() {
  const baseCount = 5000;
  const currentDate = new Date();
  const startDate = new Date("2024-01-01");
  const daysPassed = Math.floor(
    (currentDate - startDate) / (1000 * 60 * 60 * 24)
  );
  const additionalCount = daysPassed * 3;
  const totalCount = baseCount + additionalCount;

  const countElement = document.getElementById("usageCount");
  if (countElement) {
    countElement.textContent = totalCount.toLocaleString();
  }
}

// 複製倉庫地址
function copyWarehouseAddress() {
  const addressText = `收件地址: 广东省东莞市虎门镇龙眼工业路28号139铺+小跑猪+[您的姓名]
收件人: 小跑豬+[您的姓名]
手機號碼: 13652554906
郵遞區號: 523920`;

  navigator.clipboard.writeText(addressText).then(
    function () {
      const btn = document.getElementById("copyAddressBtn");
      const originalText = btn.textContent;
      btn.textContent = "✓ 已複製成功！";
      btn.style.backgroundColor = "#27ae60";

      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.backgroundColor = "";
      }, 2000);
    },
    function (err) {
      alert("複製失敗，請手動選取複製");
      console.error("複製失敗:", err);
    }
  );
}

// 新增貨物項目
function addItem() {
  itemCount++;
  const itemList = document.getElementById("itemList");

  const itemDiv = document.createElement("div");
  itemDiv.className = "item";
  itemDiv.id = `item-${itemCount}`;
  itemDiv.innerHTML = `
    <div class="item-header">
      <h3>第 ${itemCount} 筆貨物</h3>
      <button class="btn btn-remove" onclick="removeItem(${itemCount})">✕ 刪除</button>
    </div>
    
    <div class="form-grid">
      <div class="form-group">
        <label>貨物類別</label>
        <select id="category-${itemCount}" class="input-wrapper">
          <option value="一般家具">一般家具 (沙發、床架、桌椅等)</option>
          <option value="特殊家具 A">特殊家具 A (大理石、岩板、床墊等)</option>
          <option value="特殊家具 B">特殊家具 B (門、磁磚、玻璃、建材等)</option>
          <option value="特殊家具 C">特殊家具 C (智能馬桶、冰箱、大家電)</option>
        </select>
      </div>
      
      <div class="form-group">
        <label>品名描述</label>
        <input type="text" id="description-${itemCount}" class="input-wrapper" 
               placeholder="例：三人座沙發">
      </div>
      
      <div class="form-group">
        <label>長度 (公分)</label>
        <input type="number" id="length-${itemCount}" class="input-wrapper" 
               placeholder="0" min="0" step="0.01">
      </div>
      
      <div class="form-group">
        <label>寬度 (公分)</label>
        <input type="number" id="width-${itemCount}" class="input-wrapper" 
               placeholder="0" min="0" step="0.01">
      </div>
      
      <div class="form-group">
        <label>高度 (公分)</label>
        <input type="number" id="height-${itemCount}" class="input-wrapper" 
               placeholder="0" min="0" step="0.01">
      </div>
      
      <div class="form-group">
        <label>單件重量 (公斤)</label>
        <input type="number" id="weight-${itemCount}" class="input-wrapper" 
               placeholder="0" min="0" step="0.01">
      </div>
      
      <div class="form-group">
        <label>數量</label>
        <input type="number" id="quantity-${itemCount}" class="input-wrapper" 
               value="1" min="1">
      </div>
    </div>
  `;

  itemList.appendChild(itemDiv);

  // 滾動到新增的項目
  setTimeout(() => {
    itemDiv.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 100);
}

// 刪除貨物項目
function removeItem(id) {
  const itemElement = document.getElementById(`item-${id}`);
  if (itemElement) {
    itemElement.style.animation = "fadeOut 0.3s";
    setTimeout(() => {
      itemElement.remove();
      // 重新編號
      renumberItems();
    }, 300);
  }
}

// 重新編號項目
function renumberItems() {
  const items = document.querySelectorAll(".item");
  items.forEach((item, index) => {
    const newNumber = index + 1;
    item.querySelector("h3").textContent = `第 ${newNumber} 筆貨物`;
  });
}

// 計算總運費
function calculateTotal() {
  const resultsContainer = document.getElementById("resultsContainer");
  const deliveryLocation = document.getElementById("deliveryLocation");

  // 檢查是否選擇配送地區
  if (!deliveryLocation.value) {
    resultsContainer.innerHTML = `
      <div style="background-color: #f8d7da; color: #721c24; padding: 15px; 
                  border-radius: 5px; margin-top: 20px; border-left: 4px solid #f5c6cb;">
        <strong>⚠️ 請選擇配送地區</strong><br>
        請先選擇您的配送地區，以便準確計算運費。
      </div>
    `;
    deliveryLocation.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  // 收集所有項目資料
  const items = document.querySelectorAll(".item");
  let allItemsData = [];
  let totalShipmentVolume = 0;
  let totalShipmentWeight = 0;
  let totalOverweightFee = 0;
  let totalOversizedFee = 0;
  let hasOversizedItem = false;

  items.forEach((item, index) => {
    const itemNumber = index + 1;
    const category =
      document.getElementById(`category-${itemNumber}`)?.value || "一般家具";
    const description =
      document.getElementById(`description-${itemNumber}`)?.value ||
      `項目 ${itemNumber}`;
    const length =
      parseFloat(document.getElementById(`length-${itemNumber}`)?.value) || 0;
    const width =
      parseFloat(document.getElementById(`width-${itemNumber}`)?.value) || 0;
    const height =
      parseFloat(document.getElementById(`height-${itemNumber}`)?.value) || 0;
    const weight =
      parseFloat(document.getElementById(`weight-${itemNumber}`)?.value) || 0;
    const quantity =
      parseInt(document.getElementById(`quantity-${itemNumber}`)?.value) || 1;

    // 計算單件材積
    const singleVolume = (length * width * height) / VOLUME_DIVISOR;
    const totalVolume = singleVolume * quantity;
    const totalWeight = weight * quantity;

    // 取得費率
    const rateInfo = rates[category];

    // 計算基本費用
    const itemVolumeCost = totalVolume * rateInfo.volumeRate;
    const itemWeightCost = totalWeight * rateInfo.weightRate;
    const itemFinalCost = Math.max(itemVolumeCost, itemWeightCost);

    // 檢查超重
    let overweightFee = 0;
    if (weight > OVERWEIGHT_LIMIT) {
      overweightFee = OVERWEIGHT_FEE * quantity;
      totalOverweightFee += overweightFee;
    }

    // 檢查超長
    let oversizedFee = 0;
    const maxDimension = Math.max(length, width, height);
    if (maxDimension > OVERSIZED_LIMIT) {
      oversizedFee = OVERSIZED_FEE * quantity;
      totalOversizedFee += oversizedFee;
      hasOversizedItem = true;
    }

    // 儲存項目資料
    allItemsData.push({
      itemNumber,
      category,
      description,
      length,
      width,
      height,
      singleWeight: weight,
      quantity,
      singleVolume: singleVolume.toFixed(4),
      totalVolume: totalVolume.toFixed(4),
      totalWeight,
      rateInfo,
      itemVolumeCost,
      itemWeightCost,
      itemFinalCost,
      isOverweight: weight > OVERWEIGHT_LIMIT,
      overweightFee,
      hasOversizedItem: maxDimension > OVERSIZED_LIMIT,
      oversizedFee,
    });

    totalShipmentVolume += totalVolume;
    totalShipmentWeight += totalWeight;
  });

  // 計算基本海運費
  const initialSeaFreightCost = allItemsData.reduce(
    (sum, item) => sum + item.itemFinalCost,
    0
  );
  const finalSeaFreightCost = Math.max(initialSeaFreightCost, MINIMUM_CHARGE);

  // 計算偏遠地區費用
  const remoteAreaRate = parseInt(deliveryLocation.value) || 0;
  const totalCbm = totalShipmentVolume / CBM_TO_CAI_FACTOR;
  const remoteFee = remoteAreaRate > 0 ? totalCbm * remoteAreaRate : 0;

  // 計算最終總費用
  const finalTotal =
    finalSeaFreightCost + remoteFee + totalOverweightFee + totalOversizedFee;

  // 顯示結果
  displayResults({
    allItemsData,
    totalShipmentVolume,
    totalShipmentWeight,
    totalCbm,
    initialSeaFreightCost,
    finalSeaFreightCost,
    remoteAreaRate,
    remoteFee,
    totalOverweightFee,
    totalOversizedFee,
    hasOversizedItem,
    finalTotal,
  });
}

// 顯示計算結果
function displayResults(data) {
  const resultsContainer = document.getElementById("resultsContainer");
  let resultsHTML = `<h2 style="color: #1a73e8; text-align: center;">📊 運費計算結果</h2>`;

  // 顯示每個項目的詳細計算
  resultsHTML += `<div class="calculation-details">`;
  resultsHTML += `<h3 style="color: #333; border-bottom: 2px solid #1a73e8; padding-bottom: 10px;">貨物明細</h3>`;

  data.allItemsData.forEach((item) => {
    resultsHTML += `
      <div style="background-color: #f8f9fa; padding: 15px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #1a73e8;">
        <h4 style="color: #1a73e8; margin-top: 0;">
          第 ${item.itemNumber} 筆：${item.description} 
          <span style="font-size: 14px; color: #666;">(${item.category})</span>
        </h4>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin: 10px 0;">
          <div>📏 尺寸：${item.length} × ${item.width} × ${item.height} cm</div>
          <div>⚖️ 單重：${item.singleWeight} kg</div>
          <div>📦 數量：${item.quantity} 件</div>
          <div>📐 單件材積：${item.singleVolume} 材</div>
        </div>
        
        <div style="background-color: #fff; padding: 10px; margin-top: 10px; border-radius: 5px;">
          <strong>運費計算：</strong><br>
          材積費用：${item.totalVolume} 材 × ${
      item.rateInfo.volumeRate
    } 元/材 = 
          <span style="color: #e74c3c; font-weight: bold;">
            ${Math.round(item.itemVolumeCost).toLocaleString()} 元
          </span><br>
          重量費用：${item.totalWeight} kg × ${
      item.rateInfo.weightRate
    } 元/kg = 
          <span style="color: #e74c3c; font-weight: bold;">
            ${Math.round(item.itemWeightCost).toLocaleString()} 元
          </span><br>
          → 基本運費（取較高者）：
          <strong style="color: #e74c3c; font-size: 16px;">
            ${Math.round(item.itemFinalCost).toLocaleString()} 元
          </strong>
        </div>
        
        ${
          item.isOverweight || item.hasOversizedItem
            ? `
          <div style="background-color: #fff3cd; padding: 10px; margin-top: 10px; border-radius: 5px; border-left: 3px solid #ffc107;">
            <strong style="color: #856404;">額外費用：</strong><br>
            ${
              item.isOverweight
                ? `
              ⚠️ 單件超重（>${OVERWEIGHT_LIMIT}kg）：${OVERWEIGHT_FEE} 元/件 × ${
                    item.quantity
                  } 件 = 
              <span style="color: #e74c3c; font-weight: bold;">
                ${item.overweightFee.toLocaleString()} 元
              </span><br>
            `
                : ""
            }
            ${
              item.hasOversizedItem
                ? `
              ⚠️ 單邊超長（>${OVERSIZED_LIMIT}cm）：${OVERSIZED_FEE} 元/件 × ${
                    item.quantity
                  } 件 = 
              <span style="color: #e74c3c; font-weight: bold;">
                ${item.oversizedFee.toLocaleString()} 元
              </span>
            `
                : ""
            }
          </div>
        `
            : ""
        }
      </div>
    `;
  });

  resultsHTML += `</div>`;
  resultsHTML += `<hr style="margin: 30px 0;">`;

  // 費用彙總
  resultsHTML += `
    <div style="background-color: #e8f4f8; padding: 20px; border-radius: 10px; margin: 20px 0;">
      <h3 style="color: #1a73e8; margin-top: 0;">💰 費用彙總</h3>
      
      <div style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
        <p style="margin: 5px 0;">
          <strong>初步海運費（所有項目加總）：</strong>
          <span style="color: #e74c3c; font-size: 18px; font-weight: bold;">
            ${Math.round(data.initialSeaFreightCost).toLocaleString()} 元
          </span>
        </p>
        
        ${
          data.initialSeaFreightCost < MINIMUM_CHARGE
            ? `
          <p style="color: #e74c3c; margin: 5px 0;">
            ↳ 未達最低消費 ${MINIMUM_CHARGE} 元，故海運費以低消計：
            <strong>${data.finalSeaFreightCost.toLocaleString()} 元</strong>
          </p>
        `
            : `
          <p style="color: green; margin: 5px 0;">
            ↳ 已超過最低消費，海運費為：
            <strong>${data.finalSeaFreightCost.toLocaleString()} 元</strong>
          </p>
        `
        }
        
        ${
          data.totalOverweightFee > 0
            ? `
          <p style="margin: 10px 0;">
            <strong>總超重費：</strong>
            <span style="color: #e74c3c; font-weight: bold;">
              ${data.totalOverweightFee.toLocaleString()} 元
            </span>
          </p>
        `
            : ""
        }
        
        ${
          data.totalOversizedFee > 0
            ? `
          <p style="margin: 10px 0;">
            <strong>總超長費：</strong>
            <span style="color: #e74c3c; font-weight: bold;">
              ${data.totalOversizedFee.toLocaleString()} 元
            </span>
          </p>
        `
            : ""
        }
      </div>
    </div>
  `;

  // 偏遠地區費用詳細顯示
  if (data.remoteAreaRate > 0) {
    const deliveryLocation = document.getElementById("deliveryLocation");
    const selectedOption =
      deliveryLocation.options[deliveryLocation.selectedIndex];
    const areaName = selectedOption.textContent
      .replace(/[⛰️🏝️🏖️⚠️]/g, "")
      .trim();

    // 判斷偏遠程度
    let remoteLevel = "";
    let levelColor = "";
    let levelBgColor = "";

    if (data.remoteAreaRate >= 7000) {
      remoteLevel = "特別偏遠地區";
      levelColor = "#dc3545";
      levelBgColor = "#f8d7da";
    } else if (data.remoteAreaRate >= 5000) {
      remoteLevel = "山區偏遠地區";
      levelColor = "#fd7e14";
      levelBgColor = "#ffe5d0";
    } else if (data.remoteAreaRate >= 4000) {
      remoteLevel = "偏遠山區";
      levelColor = "#e74c3c";
      levelBgColor = "#fff3cd";
    } else if (data.remoteAreaRate >= 2500) {
      remoteLevel = "一般偏遠地區";
      levelColor = "#856404";
      levelBgColor = "#fff3cd";
    } else {
      remoteLevel = "偏遠地區";
      levelColor = "#17a2b8";
      levelBgColor = "#d1ecf1";
    }

    resultsHTML += `
      <div style="background: linear-gradient(135deg, ${levelBgColor} 0%, #ffffff 100%); 
                  padding: 20px; margin: 20px 0; border-radius: 10px; 
                  border: 2px solid ${levelColor}; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h3 style="color: ${levelColor}; margin-top: 0; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 24px;">📍</span>
          偏遠地區配送費用
          <span style="background: ${levelColor}; color: white; padding: 3px 10px; 
                       border-radius: 20px; font-size: 14px;">
            ${remoteLevel}
          </span>
        </h3>
        
        <div style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
          <p style="margin: 5px 0;">
            <strong>配送地區：</strong>
            <span style="color: ${levelColor}; font-weight: bold; font-size: 18px;">
              ${areaName}
            </span>
          </p>
          
          <p style="margin: 10px 0;">
            <strong>偏遠地區費率：</strong>
            NT$ ${data.remoteAreaRate.toLocaleString()} /方
          </p>
          
          <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; 
                      font-family: monospace; font-size: 16px; text-align: center; margin: 15px 0;">
            <strong>計算公式：</strong><br>
            ${data.totalCbm.toFixed(
              2
            )} 方 × NT$ ${data.remoteAreaRate.toLocaleString()} = 
            <span style="color: #e74c3c; font-weight: bold; font-size: 20px;">
              NT$ ${Math.round(data.remoteFee).toLocaleString()}
            </span>
          </div>
          
          <div style="background: #e8f4f8; padding: 10px; border-left: 3px solid #17a2b8; 
                      border-radius: 3px; margin-top: 15px;">
            <small>
              💡 <strong>說明：</strong>
              ${remoteLevel}因運送距離較遠、道路條件特殊或需要特殊運輸安排，
              因此需額外收取配送費用。費用根據貨物總體積（立方米）計算。
            </small>
          </div>
        </div>
      </div>
    `;
  }

  // 最終總計
  resultsHTML += `
    <div class="result-section" style="text-align: center; 
         background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
         color: white; padding: 25px; border-radius: 10px; margin: 20px 0;
         box-shadow: 0 8px 16px rgba(0,0,0,0.2);">
      <h2 style="color: white; margin-top: 0;">🎯 最終總計費用</h2>
      <div style="font-size: 48px; font-weight: bold; margin: 20px 0; 
                  text-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
        NT$ ${Math.round(data.finalTotal).toLocaleString()}
      </div>
      <div style="background: rgba(255,255,255,0.2); padding: 15px; 
                  border-radius: 5px; margin-top: 15px;">
        <small style="color: #f0f0f0; font-size: 14px;">
          費用明細：海運費 ${Math.round(
            data.finalSeaFreightCost
          ).toLocaleString()} 
          ${
            data.remoteFee > 0
              ? `+ 偏遠費 ${Math.round(data.remoteFee).toLocaleString()}`
              : ""
          }
          ${
            data.totalOverweightFee > 0
              ? `+ 超重費 ${data.totalOverweightFee.toLocaleString()}`
              : ""
          }
          ${
            data.totalOversizedFee > 0
              ? `+ 超長費 ${data.totalOversizedFee.toLocaleString()}`
              : ""
          }
        </small>
      </div>
    </div>
  `;

  // 重要提醒
  resultsHTML += `
    <div style="background-color: #f0f0f0; padding: 15px; border-radius: 5px; 
                margin: 20px 0; text-align: center;">
      <strong>📌 重要提醒：</strong><br>
      此試算表僅適用於小跑豬傢俱專線，試算費用僅供參考，最終金額以實際入庫丈量為準。
    </div>
  `;

  resultsContainer.innerHTML = resultsHTML;

  // 滾動到結果區域
  resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 初始化偏遠地區相關功能
function initRemoteAreaListeners() {
  // 配送地區選擇變更監聽
  const deliveryLocation = document.getElementById("deliveryLocation");
  if (deliveryLocation) {
    deliveryLocation.addEventListener("change", handleDeliveryLocationChange);
  }

  // 搜尋功能監聽
  const areaSearch = document.getElementById("areaSearch");
  if (areaSearch) {
    areaSearch.addEventListener("input", handleAreaSearch);
  }

  // 點擊外部關閉搜尋結果
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".remote-area-search")) {
      const searchResults = document.getElementById("searchResults");
      if (searchResults) {
        searchResults.style.display = "none";
      }
    }
  });
}

// 處理配送地區選擇變更
function handleDeliveryLocationChange() {
  const deliveryLocation = document.getElementById("deliveryLocation");
  const selectedOption =
    deliveryLocation.options[deliveryLocation.selectedIndex];
  const remoteAreaInfo = document.getElementById("remoteAreaInfo");
  const selectedAreaName = document.getElementById("selectedAreaName");
  const selectedAreaFee = document.getElementById("selectedAreaFee");

  if (!remoteAreaInfo || !selectedAreaName || !selectedAreaFee) return;

  if (deliveryLocation.value === "0") {
    // 一般地區
    remoteAreaInfo.style.display = "block";
    remoteAreaInfo.style.backgroundColor = "#d4edda";
    remoteAreaInfo.style.borderLeft = "4px solid #28a745";
    selectedAreaName.textContent = "一般地區";
    selectedAreaName.style.color = "#155724";
    selectedAreaFee.textContent = "無額外費用";
    selectedAreaFee.style.color = "#155724";
  } else if (deliveryLocation.value) {
    // 偏遠地區
    remoteAreaInfo.style.display = "block";

    const areaText = selectedOption.textContent
      .replace(/[⛰️🏝️🏖️⚠️]/g, "")
      .trim();
    const feeValue = parseInt(deliveryLocation.value);

    selectedAreaName.textContent = areaText;
    selectedAreaFee.textContent = `NT$ ${feeValue.toLocaleString()} /方起`;

    // 根據費率調整顯示樣式
    if (feeValue >= 5000) {
      remoteAreaInfo.style.backgroundColor = "#f8d7da";
      remoteAreaInfo.style.borderLeft = "4px solid #dc3545";
      selectedAreaName.style.color = "#721c24";
      selectedAreaFee.style.color = "#dc3545";
      selectedAreaFee.innerHTML = `⚠️ NT$ ${feeValue.toLocaleString()} /方起 (特別偏遠地區)`;
    } else if (feeValue >= 3000) {
      remoteAreaInfo.style.backgroundColor = "#fff3cd";
      remoteAreaInfo.style.borderLeft = "4px solid #ffc107";
      selectedAreaName.style.color = "#856404";
      selectedAreaFee.style.color = "#e74c3c";
    } else {
      remoteAreaInfo.style.backgroundColor = "#fff3cd";
      remoteAreaInfo.style.borderLeft = "4px solid #ffc107";
      selectedAreaName.style.color = "#856404";
      selectedAreaFee.style.color = "#e74c3c";
    }
  } else {
    remoteAreaInfo.style.display = "none";
  }
}

// 處理地區搜尋
function handleAreaSearch(e) {
  const searchTerm = e.target.value.trim().toLowerCase();
  const searchResults = document.getElementById("searchResults");

  if (!searchResults) return;

  if (searchTerm.length < 2) {
    searchResults.style.display = "none";
    return;
  }

  let results = [];

  // 搜尋所有偏遠地區
  for (const [fee, areas] of Object.entries(remoteAreasDatabase)) {
    areas.forEach((area) => {
      if (area.toLowerCase().includes(searchTerm)) {
        results.push({
          area: area,
          fee: parseInt(fee),
        });
      }
    });
  }

  // 顯示搜尋結果
  if (results.length > 0) {
    searchResults.style.display = "block";
    searchResults.innerHTML = `
      <div style="background: white; border: 1px solid #ddd; border-radius: 5px; 
                  padding: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <strong>搜尋結果：</strong>
        ${results
          .map(
            (r) => `
          <div class="search-result-item" onclick="selectRemoteArea('${
            r.area
          }', ${r.fee})"
               style="padding: 8px; margin: 5px 0; background: #f8f9fa; 
                      border-radius: 3px; cursor: pointer;">
            📍 ${r.area} 
            <span style="color: #e74c3c; font-weight: bold; float: right;">
              NT$ ${r.fee.toLocaleString()}/方起
            </span>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  } else {
    searchResults.innerHTML = `
      <div style="background: #d4edda; border: 1px solid #c3e6cb; 
                  border-radius: 5px; padding: 10px; color: #155724;">
        ✅ 找不到 "${searchTerm}" 在偏遠地區列表中
        <br>
        <small>您的地區可能屬於一般配送區域（無額外費用）</small>
      </div>
    `;
    searchResults.style.display = "block";
  }
}

// 選擇搜尋結果中的地區
function selectRemoteArea(areaName, fee) {
  const deliveryLocation = document.getElementById("deliveryLocation");

  // 尋找並選擇對應的選項
  for (let i = 0; i < deliveryLocation.options.length; i++) {
    const option = deliveryLocation.options[i];
    if (option.value === fee.toString()) {
      const optionText = option.textContent.replace(/[⛰️🏝️🏖️⚠️]/g, "").trim();
      if (optionText.includes(areaName)) {
        deliveryLocation.selectedIndex = i;
        deliveryLocation.dispatchEvent(new Event("change"));

        // 清空搜尋
        const areaSearch = document.getElementById("areaSearch");
        if (areaSearch) {
          areaSearch.value = "";
        }

        const searchResults = document.getElementById("searchResults");
        if (searchResults) {
          searchResults.style.display = "none";
        }

        // 捲動到選單位置
        deliveryLocation.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });

        break;
      }
    }
  }
}

// 新增 CSS 動畫樣式
const style = document.createElement("style");
style.textContent = `
  @keyframes fadeOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-20px); }
  }
  
  .search-result-item:hover {
    background-color: #e9ecef !important;
    transform: translateX(5px);
    transition: all 0.3s ease;
  }
  
  .btn:active {
    transform: scale(0.98);
  }
  
  .remote-area-info {
    animation: slideIn 0.3s ease;
  }
  
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;
document.head.appendChild(style);
