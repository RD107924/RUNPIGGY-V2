// prisma/seed.js (使用 upsert 強制更新版本)
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

async function main() {
  console.log("開始建立/更新初始管理員帳號...");

  // --- 管理員帳號密碼 ---
  const adminUsername = "randy";
  const adminPassword = "randy1007";
  // -------------------------

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(adminPassword, salt);

  // 使用 upsert: 如果使用者存在則更新，不存在則建立
  const adminUser = await prisma.user.upsert({
    where: { username: adminUsername }, // 尋找條件
    update: {
      passwordHash: passwordHash, // 如果找到了，就更新密碼
      role: "ADMIN", // 確保角色是 ADMIN
    },
    create: {
      username: adminUsername,
      passwordHash: passwordHash,
      role: "ADMIN", // 如果沒找到，就用這些資料建立
    },
  });

  console.log(`成功確保管理員帳號存在並已更新: ${adminUser.username}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
