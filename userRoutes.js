// userRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const router = express.Router();

// 員工登入 API
router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) return res.status(400).json({ error: "帳號或密碼錯誤" });

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) return res.status(400).json({ error: "帳號或密碼錯誤" });

  // 登入成功，產生一個效期為 8 小時的 token
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
  res.json({ token });
});

module.exports = router;
