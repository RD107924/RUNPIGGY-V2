// public/login.js
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const messageDiv = document.getElementById("loginMessage");

  try {
    const response = await fetch("/api/users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (response.ok) {
      const { token } = await response.json();
      localStorage.setItem("authToken", token); // 將 token 存儲起來
      window.location.href = "/admin"; // 成功後跳轉到後台主頁
    } else {
      const { error } = await response.json();
      messageDiv.textContent = error || "登入失敗";
    }
  } catch (error) {
    messageDiv.textContent = "無法連接到伺服器，請稍後再試。";
  }
});
