// public/quote.js - 優化版，含詳細計算公式和超重超長費
document.addEventListener("DOMContentLoaded", async () => {
  const quoteResultContainer = document.getElementById("quoteResultContainer");
  const params = new URLSearchParams(window.location.search);
  const quoteId = params.get("id");

  // 常數定義
  const VOLUME_DIVISOR = 28317;
  const CBM_TO_CAI_FACTOR = 35.3;
  const OVERWEIGHT_LIMIT = 100;
  const OVERWEIGHT_FEE = 800;
  const OVERSIZED_LIMIT = 300;
  const OVERSIZED_FEE = 800;
  const MINIMUM_CHARGE = 2000;

  if (!quoteId) {
    quoteResultContainer.innerHTML = `<p style="color:red; text-align:center;">無效的估價單連結。</p>`;
    return;
  }

  try {
    quoteResultContainer.innerHTML = `<p style="text-align:center;">正在載入估價單...</p>`;
    const response = await fetch(`/api/quotes/${quoteId}`);

    if (!response.ok) {
      throw new Error("找不到估價單或載入失敗。");
    }

    const quote = await response.json();
    const data = quote.calculationResult;

    // 複製 script.js 中的 displayResults 邏輯來顯示結果
    let resultsHTML = '<div class="result-section">';
    resultsHTML += `<h4>--- 費用計算明細 (逐筆) ---</h4>`;

    // 計算額外費用總和
    let totalOverweightFee = 0;
    let totalOversizedFee = 0;

    data.allItemsData.forEach((item) => {
      resultsHTML += `<div style="background-color: #f9f9f9; padding: 10px; margin-bottom: 15px; border-radius: 5px;">`;
      resultsHTML += `<p><strong style="font-size: 16px;">[${item.name} × ${item.quantity} 件 - ${item.rateInfo.name}]</strong></p>`;

      // 材積計算公式
      if (item.calcMethod === "cbm" && item.cbm > 0) {
        resultsHTML += `<div style="background-color: #fff; padding: 8px; margin: 5px 0; border-left: 3px solid #3498db;">`;
        resultsHTML += `<small style="color:#555;"><strong>體積換算：</strong></small><br>`;
        resultsHTML += `<small style="color:#555;">單件立方米: ${item.cbm} 方 × ${CBM_TO_CAI_FACTOR} = ${item.singleVolume} 材</small>`;
        resultsHTML += `</div>`;
      } else if (
        item.calcMethod === "dimensions" &&
        item.length &&
        item.width &&
        item.height
      ) {
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

      // 檢查並計算額外費用
      let itemOverweightFee = 0;
      let itemOversizedFee = 0;

      // 檢查超重（如果有 isOverweight 標記或單件重量超過限制）
      if (item.isOverweight || item.singleWeight > OVERWEIGHT_LIMIT) {
        itemOverweightFee = OVERWEIGHT_FEE * item.quantity;
        totalOverweightFee += itemOverweightFee;
      }

      // 檢查超長（如果有 hasOversizedItem 標記或任一邊超過限制）
      if (
        item.hasOversizedItem ||
        (item.length &&
          (item.length > OVERSIZED_LIMIT ||
            item.width > OVERSIZED_LIMIT ||
            item.height > OVERSIZED_LIMIT))
      ) {
        itemOversizedFee = OVERSIZED_FEE * item.quantity;
        totalOversizedFee += itemOversizedFee;
      }

      // 顯示額外費用
      if (itemOverweightFee > 0 || itemOversizedFee > 0) {
        resultsHTML += `<div style="background-color: #fff3cd; padding: 8px; margin: 5px 0; border-left: 3px solid #ffc107;">`;
        resultsHTML += `<small style="color:#856404;"><strong>額外費用：</strong></small><br>`;
        if (itemOverweightFee > 0) {
          resultsHTML += `<small style="color:#856404;">⚠ 單件超重 (>${OVERWEIGHT_LIMIT}kg): ${OVERWEIGHT_FEE} 元/件 × ${
            item.quantity
          } 件 = <span style="color: #e74c3c; font-weight: bold;">${itemOverweightFee.toLocaleString()} 台幣</span></small><br>`;
        }
        if (itemOversizedFee > 0) {
          resultsHTML += `<small style="color:#856404;">⚠ 單邊超長 (>${OVERSIZED_LIMIT}cm): ${OVERSIZED_FEE} 元/件 × ${
            item.quantity
          } 件 = <span style="color: #e74c3c; font-weight: bold;">${itemOversizedFee.toLocaleString()} 台幣</span></small><br>`;
        }
        resultsHTML += `</div>`;
      }

      resultsHTML += `</div>`;
    });

    resultsHTML += `<hr>`;

    // 費用彙總
    resultsHTML += `<div style="background-color: #e8f4f8; padding: 15px; border-radius: 5px; margin: 10px 0;">`;
    resultsHTML += `<p><strong>初步海運費 (所有項目加總): <span style="color: #e74c3c;">${Math.round(
      data.initialSeaFreightCost
    ).toLocaleString()} 台幣</span></strong></p>`;

    if (data.initialSeaFreightCost < MINIMUM_CHARGE) {
      resultsHTML += `<p style="color: #e74c3c;">↳ 未達最低消費 ${MINIMUM_CHARGE} 元，故海運費以低消計: <strong>${data.finalSeaFreightCost.toLocaleString()} 台幣</strong></p>`;
    } else {
      resultsHTML += `<p style="color: green;">↳ 已超過最低消費，海運費為: <strong>${data.finalSeaFreightCost.toLocaleString()} 台幣</strong></p>`;
    }

    // 如果數據中有額外費用則使用，否則使用計算值
    const displayOverweightFee = data.totalOverweightFee || totalOverweightFee;
    const displayOversizedFee = data.totalOversizedFee || totalOversizedFee;

    if (displayOverweightFee > 0) {
      resultsHTML += `<p><strong>總超重費: <span style="color: #e74c3c;">${displayOverweightFee.toLocaleString()} 台幣</span></strong></p>`;
    }

    if (displayOversizedFee > 0) {
      resultsHTML += `<p><strong>總超長費: <span style="color: #e74c3c;">${displayOversizedFee.toLocaleString()} 台幣</span></strong></p>`;
    }

    if (data.remoteAreaRate > 0) {
      resultsHTML += `<hr>`;
      resultsHTML += `<div style="background-color: #fff; padding: 10px; border-left: 3px solid #e67e22;">`;
      resultsHTML += `<p><strong>偏遠地區附加費計算：</strong></p>`;
      resultsHTML += `<p>(總材積 ${
        data.totalShipmentVolume
      } 材 ÷ ${CBM_TO_CAI_FACTOR} = ${data.totalCbm.toFixed(
        2
      )} 方) × ${data.remoteAreaRate.toLocaleString()} 元/方</p>`;
      resultsHTML += `<p>→ 偏遠費用: <strong style="color: #e74c3c;">${Math.round(
        data.remoteFee
      ).toLocaleString()} 台幣</strong></p>`;
      resultsHTML += `</div>`;
    }
    resultsHTML += `</div>`;

    resultsHTML += `</div>`;

    // 重新計算最終總計（如果需要）
    let finalTotal = data.finalTotal;
    // 如果原始數據沒有包含額外費用，則加上
    if (!data.totalOverweightFee && !data.totalOversizedFee) {
      finalTotal =
        data.finalSeaFreightCost +
        data.remoteFee +
        displayOverweightFee +
        displayOversizedFee;
    }

    // 最終總計
    resultsHTML += `
      <div class="result-section" style="text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px;">
        <h2 style="color: white;">最終總計費用</h2>
        <div class="total-cost" style="font-size: 36px; font-weight: bold; margin: 15px 0;">${Math.round(
          finalTotal
        ).toLocaleString()} 台幣</div>
        <small style="color: #f0f0f0;">
          (海運費 ${Math.round(data.finalSeaFreightCost).toLocaleString()} 
          + 偏遠費 ${Math.round(data.remoteFee).toLocaleString()}
          ${
            displayOverweightFee > 0
              ? ` + 超重費 ${displayOverweightFee.toLocaleString()}`
              : ""
          }
          ${
            displayOversizedFee > 0
              ? ` + 超長費 ${displayOversizedFee.toLocaleString()}`
              : ""
          })
        </small>
      </div>
    `;

    // 如果有超長物品的警告（向後兼容）
    if (data.hasOversizedItem && !displayOversizedFee) {
      resultsHTML += `<div class="final-disclaimer" style="background-color: #fff3cd; padding: 10px; margin: 10px 0; border-left: 3px solid #ffc107;"><strong>提醒：</strong>您的貨物中有單邊超過 300 公分的品項，將會產生超長費 (800元/件)，實際費用以入庫報價為準。</div>`;
    }

    resultsHTML += `<div class="final-disclaimer">此試算表僅適用於小跑豬傢俱專線，試算費用僅供參考，最終金額以實際入庫丈量為準。</div>`;

    quoteResultContainer.innerHTML = resultsHTML;
  } catch (error) {
    quoteResultContainer.innerHTML = `<p style="color:red; text-align:center;">${error.message}</p>`;
  }
});
