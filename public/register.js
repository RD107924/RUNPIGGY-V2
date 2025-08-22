// public/register.js
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("authToken");
  if (!token) {
    window.location.href = "/login.html"; // 未登入則跳轉
    return;
  }

  document
    .getElementById("registerForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("username").value;
      const password = document.getElementById("password").value;
      const role = document.getElementById("role").value;
      const messageDiv = document.getElementById("registerMessage");

      try {
        const response = await fetch("/api/admin/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`, // 帶上 token 進行驗證
          },
          body: JSON.stringify({ username, password, role }),
        });

        const result = await response.json();

        if (response.ok) {
          messageDiv.textContent = `成功建立帳號: ${result.username} (${result.role})!`;
          messageDiv.style.color = "green";
          document.getElementById("registerForm").reset(); // 清空表單
        } else {
          messageDiv.textContent = `建立失敗: ${result.error}`;
          messageDiv.style.color = "red";
        }
      } catch (error) {
        messageDiv.textContent = "發生未知錯誤，請稍後再試。";
        messageDiv.style.color = "red";
      }
    });
});
