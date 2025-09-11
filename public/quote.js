// quote.js - 報價顯示頁面專用腳本
// 用於從 URL 參數讀取計算結果並顯示

// 常數定義（與 script.js 保持一致）
const VOLUME_DIVISOR = 1000000; // 材積除數
const CBM_TO_CAI_FACTOR = 35.315; // 立方米轉材係數
const MINIMUM_CHARGE = 2000; // 最低運費
const OVERWEIGHT_LIMIT = 100; // 超重限制 (kg)
const OVERWEIGHT_FEE = 600; // 超重費用
const OVERSIZED_LIMIT = 300; // 超長限制 (cm)
const OVERSIZED_FEE = 800; // 超長費用

// 費率定義（與 script.js 保持一致）
const rates = {
  一般家具: { weightRate: 22, volumeRate: 125 },
  "特殊家具 A": { weightRate: 32, volumeRate: 184 },
  "特殊家具 B": { weightRate: 40, volumeRate: 224 },
  "特殊家具 C": { weightRate: 50, volumeRate: 274 },
};

// 偏遠地區名稱對照表
const remoteAreaNames = {
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
    "屏東縣全區",
    "花蓮全區",
    "台東全區",
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

// 當頁面載入時執行
document.addEventListener("DOMContentLoaded", function () {
  // 從 URL 取得參數
  const urlParams = new URLSearchParams(window.location.search);
  const dataParam = urlParams.get("data");

  if (dataParam) {
    try {
      // 解碼並解析資料
      const data = JSON.parse(decodeURIComponent(dataParam));
      displayQuoteResults(data);
    } catch (error) {
      console.error("解析資料失敗:", error);
      displayError("資料解析失敗，請重新計算");
    }
  } else {
    displayError("沒有找到報價資料");
  }

  // 綁定列印按鈕事件
  const printBtn = document.getElementById("printQuoteBtn");
  if (printBtn) {
    printBtn.addEventListener("click", printQuote);
  }

  // 綁定返回按鈕事件
  const backBtn = document.getElementById("backToCalculatorBtn");
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      window.location.href = "/";
    });
  }

  // 綁定下載 PDF 按鈕事件
  const downloadPdfBtn = document.getElementById("downloadPdfBtn");
  if (downloadPdfBtn) {
    downloadPdfBtn.addEventListener("click", downloadAsPdf);
  }

  // 綁定分享按鈕事件
  const shareBtn = document.getElementById("shareQuoteBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", shareQuote);
  }
});

// 顯示報價結果
function displayQuoteResults(data) {
  const quoteResultContainer = document.getElementById("quoteResultContainer");
  if (!quoteResultContainer) return;

  // 生成報價編號
  const quoteNumber = generateQuoteNumber();
  const currentDate = new Date().toLocaleDateString("zh-TW");

  let resultsHTML = `
    <div class="quote-header" style="text-align: center; padding: 20px; 
         background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
         color: white; border-radius: 10px; margin-bottom: 30px;">
      <h1 style="margin: 0; color: white;">小跑豬傢俱專線</h1>
      <h2 style="margin: 10px 0; color: white;">運費報價單</h2>
      <div style="margin-top: 15px;">
        <span style="margin: 0 10px;">報價編號：${quoteNumber}</span>
        <span style="margin: 0 10px;">報價日期：${currentDate}</span>
      </div>
    </div>
  `;

  // 客戶資訊（如果有）
  if (data.customerInfo) {
    resultsHTML += `
      <div class="customer-info" style="background: #f8f9fa; padding: 15px; 
           border-radius: 8px; margin-bottom: 20px;">
        <h3 style="color: #333; margin-top: 0;">客戶資訊</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">
          ${
            data.customerInfo.lineNickname
              ? `
            <div>LINE 暱稱：${data.customerInfo.lineNickname}</div>
          `
              : ""
          }
          ${
            data.customerInfo.recipientName
              ? `
            <div>收件人：${data.customerInfo.recipientName}</div>
          `
              : ""
          }
          ${
            data.customerInfo.phone
              ? `
            <div>聯絡電話：${data.customerInfo.phone}</div>
          `
              : ""
          }
          ${
            data.customerInfo.address
              ? `
            <div>配送地址：${data.customerInfo.address}</div>
          `
              : ""
          }
        </div>
      </div>
    `;
  }

  // 貨物明細
  resultsHTML += `
    <div class="items-detail" style="margin-bottom: 30px;">
      <h3 style="color: #1a73e8; border-bottom: 2px solid #1a73e8; padding-bottom: 10px;">
        📦 貨物明細
      </h3>
  `;

  // 顯示每個項目
  if (data.allItemsData && data.allItemsData.length > 0) {
    data.allItemsData.forEach((item, index) => {
      resultsHTML += `
        <div style="background: #ffffff; border: 1px solid #dee2e6; 
             padding: 15px; margin: 15px 0; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="flex: 1;">
              <h4 style="color: #495057; margin: 0 0 10px 0;">
                第 ${index + 1} 筆：${item.description || `項目 ${index + 1}`}
                <span style="background: #e7f3ff; color: #1a73e8; padding: 2px 8px; 
                     border-radius: 4px; font-size: 12px; margin-left: 10px;">
                  ${item.category}
                </span>
              </h4>
              
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
                   gap: 10px; font-size: 14px; color: #666;">
                <div>📏 尺寸：${item.length} × ${item.width} × ${
        item.height
      } cm</div>
                <div>⚖️ 單重：${item.singleWeight} kg</div>
                <div>📦 數量：${item.quantity} 件</div>
                <div>📐 材積：${item.totalVolume} 材</div>
              </div>
            </div>
            
            <div style="text-align: right; min-width: 150px;">
              <div style="font-size: 12px; color: #999; margin-bottom: 5px;">基本運費</div>
              <div style="font-size: 20px; color: #e74c3c; font-weight: bold;">
                NT$ ${Math.round(item.itemFinalCost).toLocaleString()}
              </div>
              
              ${
                item.overweightFee > 0 || item.oversizedFee > 0
                  ? `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #dee2e6;">
                  ${
                    item.overweightFee > 0
                      ? `
                    <div style="font-size: 12px; color: #dc3545;">
                      超重費：+${item.overweightFee.toLocaleString()}
                    </div>
                  `
                      : ""
                  }
                  ${
                    item.oversizedFee > 0
                      ? `
                    <div style="font-size: 12px; color: #dc3545;">
                      超長費：+${item.oversizedFee.toLocaleString()}
                    </div>
                  `
                      : ""
                  }
                </div>
              `
                  : ""
              }
            </div>
          </div>
        </div>
      `;
    });
  }

  resultsHTML += `</div>`;

  // 費用彙總
  resultsHTML += `
    <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
      <h3 style="color: #333; margin-top: 0;">💰 費用計算明細</h3>
      
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
          <tr style="border-bottom: 1px solid #dee2e6;">
            <td style="padding: 10px 0;">貨物總材積</td>
            <td style="text-align: right; padding: 10px 0;">
              ${
                data.totalShipmentVolume
                  ? data.totalShipmentVolume.toFixed(4)
                  : "0"
              } 材
              (${data.totalCbm ? data.totalCbm.toFixed(2) : "0"} 立方米)
            </td>
          </tr>
          
          <tr style="border-bottom: 1px solid #dee2e6;">
            <td style="padding: 10px 0;">初步海運費</td>
            <td style="text-align: right; padding: 10px 0;">
              NT$ ${Math.round(
                data.initialSeaFreightCost || 0
              ).toLocaleString()}
            </td>
          </tr>
          
          ${
            data.initialSeaFreightCost < MINIMUM_CHARGE
              ? `
            <tr style="border-bottom: 1px solid #dee2e6;">
              <td style="padding: 10px 0; color: #e74c3c;">
                最低消費調整
              </td>
              <td style="text-align: right; padding: 10px 0; color: #e74c3c;">
                調整至 NT$ ${MINIMUM_CHARGE.toLocaleString()}
              </td>
            </tr>
          `
              : ""
          }
          
          <tr style="border-bottom: 2px solid #333;">
            <td style="padding: 10px 0; font-weight: bold;">海運費小計</td>
            <td style="text-align: right; padding: 10px 0; font-weight: bold; color: #1a73e8;">
              NT$ ${Math.round(data.finalSeaFreightCost || 0).toLocaleString()}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // 額外費用明細
  const hasExtraFees =
    data.totalOverweightFee > 0 ||
    data.totalOversizedFee > 0 ||
    data.remoteFee > 0;

  if (hasExtraFees) {
    resultsHTML += `
      <div style="background: #fff3cd; padding: 20px; border-radius: 10px; 
           margin-bottom: 20px; border: 1px solid #ffc107;">
        <h3 style="color: #856404; margin-top: 0;">📋 額外費用明細</h3>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tbody>
    `;

    if (data.totalOverweightFee > 0) {
      resultsHTML += `
        <tr style="border-bottom: 1px solid #ffc107;">
          <td style="padding: 10px 0;">
            超重費用 (單件超過 ${OVERWEIGHT_LIMIT} kg)
          </td>
          <td style="text-align: right; padding: 10px 0; color: #e74c3c; font-weight: bold;">
            NT$ ${data.totalOverweightFee.toLocaleString()}
          </td>
        </tr>
      `;
    }

    if (data.totalOversizedFee > 0) {
      resultsHTML += `
        <tr style="border-bottom: 1px solid #ffc107;">
          <td style="padding: 10px 0;">
            超長費用 (單邊超過 ${OVERSIZED_LIMIT} cm)
          </td>
          <td style="text-align: right; padding: 10px 0; color: #e74c3c; font-weight: bold;">
            NT$ ${data.totalOversizedFee.toLocaleString()}
          </td>
        </tr>
      `;
    }

    if (data.remoteFee > 0) {
      // 取得偏遠地區名稱
      let remoteAreaName = "偏遠地區";
      if (data.selectedAreaName) {
        remoteAreaName = data.selectedAreaName;
      } else if (data.remoteAreaRate) {
        // 嘗試從費率反查地區名稱
        const rateStr = data.remoteAreaRate.toString();
        if (remoteAreaNames[rateStr] && remoteAreaNames[rateStr].length > 0) {
          remoteAreaName = `偏遠地區 (${rateStr}元/方)`;
        }
      }

      // 判斷偏遠程度
      let remoteLevel = "";
      let levelColor = "#856404";

      if (data.remoteAreaRate >= 7000) {
        remoteLevel = "特別偏遠地區";
        levelColor = "#dc3545";
      } else if (data.remoteAreaRate >= 5000) {
        remoteLevel = "山區偏遠地區";
        levelColor = "#fd7e14";
      } else if (data.remoteAreaRate >= 4000) {
        remoteLevel = "偏遠山區";
        levelColor = "#e74c3c";
      } else if (data.remoteAreaRate >= 2500) {
        remoteLevel = "一般偏遠地區";
        levelColor = "#856404";
      } else {
        remoteLevel = "偏遠地區";
        levelColor = "#17a2b8";
      }

      resultsHTML += `
        <tr style="border-bottom: 2px solid #ffc107;">
          <td style="padding: 10px 0;">
            <div>
              偏遠地區配送費
              <span style="background: ${levelColor}; color: white; padding: 2px 8px; 
                   border-radius: 4px; font-size: 12px; margin-left: 10px;">
                ${remoteLevel}
              </span>
            </div>
            <div style="font-size: 12px; color: #666; margin-top: 5px;">
              ${remoteAreaName} - ${data.totalCbm.toFixed(2)} 方 × NT$ ${
        data.remoteAreaRate
      }/方
            </div>
          </td>
          <td style="text-align: right; padding: 10px 0; color: #e74c3c; font-weight: bold;">
            NT$ ${Math.round(data.remoteFee).toLocaleString()}
          </td>
        </tr>
      `;
    }

    resultsHTML += `
          </tbody>
        </table>
      </div>
    `;
  }

  // 最終總計
  resultsHTML += `
    <div style="background: linear-gradient(135deg, #28a745 0%, #20c997 100%); 
         color: white; padding: 25px; border-radius: 10px; text-align: center;
         box-shadow: 0 5px 15px rgba(0,0,0,0.2);">
      <h2 style="margin: 0; color: white;">應付總額</h2>
      <div style="font-size: 48px; font-weight: bold; margin: 15px 0; 
           text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
        NT$ ${Math.round(data.finalTotal || 0).toLocaleString()}
      </div>
      <div style="font-size: 14px; opacity: 0.9;">
        ${generatePriceBreakdown(data)}
      </div>
    </div>
  `;

  // 加值服務（如果有）
  if (data.additionalServices) {
    resultsHTML += displayAdditionalServices(data.additionalServices);
  }

  // 重要提醒
  resultsHTML += `
    <div style="background: #e8f4f8; padding: 15px; border-radius: 8px; 
         margin-top: 20px; border-left: 4px solid #17a2b8;">
      <h4 style="color: #17a2b8; margin-top: 0;">📌 重要提醒</h4>
      <ul style="margin: 10px 0; padding-left: 20px; color: #666;">
        <li>此報價有效期限為 7 天</li>
        <li>最終費用以實際入庫丈量為準</li>
        <li>報價僅適用於小跑豬傢俱專線</li>
        <li>不包含目的地清關稅費</li>
        ${
          data.remoteFee > 0
            ? `
          <li style="color: #e74c3c;">
            您的配送地址位於偏遠地區，已包含偏遠地區配送費用
          </li>
        `
            : ""
        }
      </ul>
    </div>
  `;

  // 聯絡資訊
  resultsHTML += `
    <div style="text-align: center; margin-top: 30px; padding: 20px; 
         background: #f8f9fa; border-radius: 8px;">
      <h4 style="color: #333;">需要協助？</h4>
      <p style="color: #666;">
        LINE 客服：@xiaopiaozhu<br>
        服務時間：週一至週六 09:00-18:00<br>
        <a href="https://lin.ee/eK6HptX" target="_blank" 
           style="display: inline-block; margin-top: 10px; padding: 10px 30px; 
                  background: #00c300; color: white; text-decoration: none; 
                  border-radius: 25px;">
          立即聯繫 LINE 客服
        </a>
      </p>
    </div>
  `;

  quoteResultContainer.innerHTML = resultsHTML;
}

// 生成價格明細文字
function generatePriceBreakdown(data) {
  let breakdown = [];

  breakdown.push(
    `海運費 ${Math.round(data.finalSeaFreightCost || 0).toLocaleString()}`
  );

  if (data.remoteFee > 0) {
    breakdown.push(`偏遠費 ${Math.round(data.remoteFee).toLocaleString()}`);
  }

  if (data.totalOverweightFee > 0) {
    breakdown.push(`超重費 ${data.totalOverweightFee.toLocaleString()}`);
  }

  if (data.totalOversizedFee > 0) {
    breakdown.push(`超長費 ${data.totalOversizedFee.toLocaleString()}`);
  }

  return `( ${breakdown.join(" + ")} )`;
}

// 顯示加值服務
function displayAdditionalServices(services) {
  if (!services) return "";

  let html = `
    <div style="background: #f0f8ff; padding: 20px; border-radius: 10px; 
         margin-top: 20px; border: 1px solid #b8daff;">
      <h3 style="color: #004085; margin-top: 0;">🔧 加值服務</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>
  `;

  if (services.carryUpstairs && services.carryUpstairs.needed) {
    html += `
      <tr style="border-bottom: 1px solid #b8daff;">
        <td style="padding: 10px 0;">
          搬運上樓服務
          <span style="font-size: 12px; color: #666;">
            (${services.carryUpstairs.floor}樓，
            ${
              services.carryUpstairs.hasElevator === "yes" ? "有電梯" : "無電梯"
            })
          </span>
        </td>
        <td style="text-align: right; padding: 10px 0; color: #004085; font-weight: bold;">
          ${
            services.carryUpstairs.fee
              ? `NT$ ${services.carryUpstairs.fee.toLocaleString()}`
              : "另行報價"
          }
        </td>
      </tr>
    `;
  }

  if (services.assembly && services.assembly.needed) {
    html += `
      <tr style="border-bottom: 1px solid #b8daff;">
        <td style="padding: 10px 0;">
          組裝服務
          <span style="font-size: 12px; color: #666;">
            (${services.assembly.items || "詳見備註"})
          </span>
        </td>
        <td style="text-align: right; padding: 10px 0; color: #004085; font-weight: bold;">
          ${
            services.assembly.fee
              ? `NT$ ${services.assembly.fee.toLocaleString()}`
              : "另行報價"
          }
        </td>
      </tr>
    `;
  }

  html += `
        </tbody>
      </table>
      <p style="font-size: 12px; color: #666; margin: 10px 0 0 0;">
        * 加值服務費用將另行計算，不包含在上述運費總額中
      </p>
    </div>
  `;

  return html;
}

// 生成報價編號
function generateQuoteNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `XPZ${year}${month}${day}${random}`;
}

// 顯示錯誤訊息
function displayError(message) {
  const quoteResultContainer = document.getElementById("quoteResultContainer");
  if (!quoteResultContainer) return;

  quoteResultContainer.innerHTML = `
    <div style="background: #f8d7da; color: #721c24; padding: 20px; 
         border-radius: 10px; text-align: center; margin: 50px auto; max-width: 500px;">
      <h3 style="margin-top: 0;">⚠️ 錯誤</h3>
      <p>${message}</p>
      <button onclick="window.location.href='/'" 
              style="margin-top: 15px; padding: 10px 30px; background: #1a73e8; 
                     color: white; border: none; border-radius: 5px; cursor: pointer;">
        返回試算器
      </button>
    </div>
  `;
}

// 列印報價單
function printQuote() {
  // 儲存原始標題
  const originalTitle = document.title;

  // 設定列印標題
  document.title = `小跑豬運費報價單_${generateQuoteNumber()}`;

  // 執行列印
  window.print();

  // 恢復原始標題
  setTimeout(() => {
    document.title = originalTitle;
  }, 100);
}

// 下載為 PDF（需要額外的庫支援，這裡提供基本結構）
function downloadAsPdf() {
  // 如果有安裝 jsPDF 或其他 PDF 庫
  if (typeof jsPDF !== "undefined") {
    const doc = new jsPDF();
    // PDF 生成邏輯
    doc.save(`小跑豬運費報價單_${generateQuoteNumber()}.pdf`);
  } else {
    // 退而求其次，使用列印功能
    alert("PDF 下載功能準備中，請使用列印功能並選擇「另存為 PDF」");
    printQuote();
  }
}

// 分享報價
function shareQuote() {
  const currentUrl = window.location.href;

  // 檢查是否支援 Web Share API
  if (navigator.share) {
    navigator
      .share({
        title: "小跑豬運費報價單",
        text: "這是我的運費報價單",
        url: currentUrl,
      })
      .then(() => {
        console.log("分享成功");
      })
      .catch((error) => {
        console.log("分享失敗:", error);
        copyToClipboard(currentUrl);
      });
  } else {
    // 不支援 Web Share API，複製連結
    copyToClipboard(currentUrl);
  }
}

// 複製到剪貼板
function copyToClipboard(text) {
  navigator.clipboard
    .writeText(text)
    .then(() => {
      alert("報價連結已複製到剪貼板！");
    })
    .catch(() => {
      // 退而求其次的複製方法
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      alert("報價連結已複製到剪貼板！");
    });
}

// 新增樣式
const style = document.createElement("style");
style.textContent = `
  @media print {
    body * {
      visibility: hidden;
    }
    
    #quoteResultContainer, 
    #quoteResultContainer * {
      visibility: visible;
    }
    
    #quoteResultContainer {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
    }
    
    .no-print {
      display: none !important;
    }
    
    /* 調整列印時的樣式 */
    .quote-header {
      break-inside: avoid;
    }
    
    .items-detail > div {
      break-inside: avoid;
    }
    
    /* 移除背景色以節省墨水 */
    @media print and (color) {
      * {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  }
  
  /* 動畫效果 */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  #quoteResultContainer {
    animation: fadeIn 0.5s ease;
  }
  
  /* 按鈕樣式 */
  button {
    transition: all 0.3s ease;
  }
  
  button:hover {
    transform: translateY(-2px);
    box-shadow: 0 5px 15px rgba(0,0,0,0.2);
  }
  
  button:active {
    transform: translateY(0);
  }
  
  /* 表格樣式優化 */
  table {
    width: 100%;
    border-collapse: collapse;
  }
  
  table td {
    padding: 10px;
    vertical-align: middle;
  }
  
  /* 響應式設計 */
  @media (max-width: 768px) {
    .quote-header h1 {
      font-size: 24px;
    }
    
    .quote-header h2 {
      font-size: 18px;
    }
    
    div[style*="font-size: 48px"] {
      font-size: 36px !important;
    }
    
    div[style*="grid-template-columns"] {
      grid-template-columns: 1fr !important;
    }
  }
`;
document.head.appendChild(style);
