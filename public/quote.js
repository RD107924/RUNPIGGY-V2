// public/quote.js
document.addEventListener("DOMContentLoaded", async () => {
  const quoteResultContainer = document.getElementById("quoteResultContainer");
  const params = new URLSearchParams(window.location.search);
  const quoteId = params.get("id");

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
    data.allItemsData.forEach((item) => {
      resultsHTML += `<p><strong>[${item.name} × ${item.quantity} - ${item.rateInfo.name}]</strong><br>`;
      if (item.calcMethod === "cbm" && item.cbm > 0) {
        resultsHTML += `<small style="color:#555;">(單件以立方米輸入: ${
          item.cbm
        } 方 × ${35.3} = ${item.singleVolume} 材)<br></small>`;
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
      data.initialSeaFreightCost
    ).toLocaleString()} 台幣</strong></p>`;
    if (data.initialSeaFreightCost < 2000) {
      resultsHTML += `<p style="color: #e74c3c;">↳ 未達最低消費 2000 元，故海運費以低消計: <strong>${data.finalSeaFreightCost.toLocaleString()} 台幣</strong></p>`;
    } else {
      resultsHTML += `<p style="color: green;">↳ 已超過最低消費，海運費為: <strong>${data.finalSeaFreightCost.toLocaleString()} 台幣</strong></p>`;
    }
    if (data.remoteAreaRate > 0) {
      resultsHTML += `<hr>`;
      resultsHTML += `<p><strong>偏遠地區附加費:</strong> ${data.remoteFee.toLocaleString()} 台幣</p>`;
    }
    resultsHTML += `</div>`;
    resultsHTML += `
            <div class="result-section" style="text-align: center;">
                <h2>最終總計費用</h2>
                <div class="total-cost">${Math.round(
                  data.finalTotal
                ).toLocaleString()} 台幣</div>
                <small>(海運費 ${Math.round(
                  data.finalSeaFreightCost
                ).toLocaleString()} + 偏遠費 ${Math.round(
      data.remoteFee
    ).toLocaleString()})</small>
            </div>
        `;
    if (data.hasOversizedItem) {
      resultsHTML += `<div class="final-disclaimer"><strong>提醒：</strong>您的貨物中有單邊超過 300 公分的品項，將會產生超長費 (600元/件 起)，實際費用以入庫報價為準。</div>`;
    }
    resultsHTML += `<div class="final-disclaimer">此試算表僅適用於小跑豬傢俱專線，試算費用僅供參考，最終金額以實際入庫丈量為準。</div>`;

    quoteResultContainer.innerHTML = resultsHTML;
  } catch (error) {
    quoteResultContainer.innerHTML = `<p style="color:red; text-align:center;">${error.message}</p>`;
  }
});
