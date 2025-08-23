// test-customer-order.js - 測試會員訂單關聯
require('dotenv').config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function testCustomerOrders() {
  try {
    console.log("=== 測試會員訂單關聯 ===\n");
    
    // 1. 列出所有會員
    console.log("1. 所有會員:");
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        email: true,
        name: true
      }
    });
    customers.forEach(c => {
      console.log(`   - ${c.name} (${c.email}) - ID: ${c.id}`);
    });
    
    // 2. 列出所有訂單
    console.log("\n2. 所有訂單:");
    const orders = await prisma.shipmentOrder.findMany({
      select: {
        id: true,
        recipientName: true,
        customerId: true,
        createdAt: true
      }
    });
    orders.forEach(o => {
      console.log(`   - 訂單 ${o.id.substring(0, 8)}... 收件人: ${o.recipientName}, 會員ID: ${o.customerId || '無'}, 時間: ${o.createdAt.toLocaleString()}`);
    });
    
    // 3. 檢查每個會員的訂單
    console.log("\n3. 每個會員的訂單數量:");
    for (const customer of customers) {
      const orderCount = await prisma.shipmentOrder.count({
        where: { customerId: customer.id }
      });
      console.log(`   - ${customer.name}: ${orderCount} 筆訂單`);
    }
    
    // 4. 檢查沒有關聯到會員的訂單
    console.log("\n4. 非會員訂單:");
    const nonCustomerOrders = await prisma.shipmentOrder.findMany({
      where: { customerId: null },
      select: {
        id: true,
        recipientName: true
      }
    });
    console.log(`   找到 ${nonCustomerOrders.length} 筆非會員訂單`);
    
  } catch (error) {
    console.error("測試失敗:", error);
  } finally {
    await prisma.$disconnect();
  }
}

// 執行測試
testCustomerOrders();