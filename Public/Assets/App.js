const form = document.querySelector("#create-form");
const urlInput = document.querySelector("#target-url");
const codeInput = document.querySelector("#short-code");
const expiryInput = document.querySelector("#expires-at");
const errorBox = document.querySelector("#form-error");
const submitButton = document.querySelector("#submit-button");
const resultPanel = document.querySelector("#result-panel");
const resultMessage = document.querySelector("#result-message");
const resultLink = document.querySelector("#result-link");
const accessDialog = document.querySelector("#access-dialog");
const accessInput = document.querySelector("#access-password");
const accessError = document.querySelector("#access-error");
const adminAccessButton = document.querySelector("#admin-access-button");
const customCodeField = document.querySelector("#custom-code-field");
const guestCodeNote = document.querySelector("#guest-code-note");

let accessMode = null;
let adminKey = "";
let actionPollToken = 0;

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.themeChoice === theme),
    );
  });
  try {
    localStorage.setItem("shortlink-theme", theme);
  } catch {}
}

let initialTheme = "light";
try {
  initialTheme =
    localStorage.getItem("shortlink-theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
} catch {
  initialTheme = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
setTheme(initialTheme);
document.querySelectorAll("[data-theme-choice]").forEach((button) => {
  button.addEventListener("click", () => setTheme(button.dataset.themeChoice));
});

document.querySelector("#origin-prefix").textContent =
  `${window.location.host}/`;

function randomCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function showAccessMode(mode, key = "") {
  accessMode = mode;
  adminKey = mode === "admin" ? key : "";
  try {
    sessionStorage.setItem("shortlink-access-mode", mode);
    if (adminKey) sessionStorage.setItem("shortlink-admin-key", adminKey);
    else sessionStorage.removeItem("shortlink-admin-key");
  } catch {}
  const isAdmin = mode === "admin";
  customCodeField.hidden = !isAdmin;
  guestCodeNote.hidden = isAdmin;
  document.querySelector("#access-badge").textContent = isAdmin
    ? "管理员模式"
    : "访客模式";
  document.querySelector("#change-mode").textContent = isAdmin
    ? "切换访问模式"
    : "管理员登录";
  document.querySelector("#form-note").textContent = isAdmin
    ? "管理员可指定短码；请求将由 GitHub Action 写入仓库。"
    : "访客短码随机生成；请求将由 GitHub Action 写入仓库。";
  if (accessDialog.open) accessDialog.close();
}

function openAccessDialog() {
  accessError.hidden = true;
  accessInput.value = "";
  accessDialog.showModal();
  accessInput.focus();
}

document
  .querySelector("#change-mode")
  .addEventListener("click", openAccessDialog);
document
  .querySelector("#guest-access-button")
  .addEventListener("click", () => showAccessMode("guest"));
accessDialog.addEventListener("cancel", (event) => event.preventDefault());

document
  .querySelector("#access-form")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    accessError.hidden = true;
    const key = accessInput.value;
    if (!key) {
      accessError.textContent = "请输入管理员访问密码，或选择访客模式。";
      accessError.hidden = false;
      return;
    }
    adminAccessButton.disabled = true;
    adminAccessButton.textContent = "验证中…";
    try {
      const response = await fetch("/__api/access", {
        method: "POST",
        headers: { "X-Admin-Key": key },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || `验证失败（${response.status}）`);
      showAccessMode("admin", key);
    } catch (error) {
      accessError.textContent = error.message || "访问密码验证失败。";
      accessError.hidden = false;
    } finally {
      adminAccessButton.disabled = false;
      adminAccessButton.textContent = "管理员进入";
    }
  });

function restoreAccessMode() {
  try {
    const mode = sessionStorage.getItem("shortlink-access-mode");
    if (mode === "admin") {
      const key = sessionStorage.getItem("shortlink-admin-key") || "";
      if (key) {
        showAccessMode("admin", key);
        return;
      }
    } else if (mode === "guest") {
      showAccessMode("guest");
      return;
    }
  } catch {}
  openAccessDialog();
}

async function loadServiceStatus() {
  const status = document.querySelector("#service-status");
  const dot = document.querySelector("#state-dot");
  const actionLink = document.querySelector("#action-link");
  try {
    const response = await fetch("/__api/health", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Worker unavailable");
    const data = await response.json();
    actionLink.href = data.repositoryUrl
      ? `${data.repositoryUrl}/actions`
      : "https://github.com";
    status.textContent = data.ready ? "服务已连接" : "等待部署配置";
    dot.className = data.ready ? "state-dot ready" : "state-dot offline";
  } catch {
    status.textContent = "服务未连接";
    dot.className = "state-dot offline";
    actionLink.href = "https://github.com";
  }
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function validUrl(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function setActionStatus(message, state) {
  document.querySelector("#action-status").textContent = message;
  document.querySelector("#action-status-dot").className =
    `action-status-dot ${state || ""}`;
}

async function watchAction(requestId, code, actionsUrl) {
  const token = ++actionPollToken;
  const runLink = document.querySelector("#run-link");
  runLink.href = actionsUrl;
  runLink.hidden = false;
  for (let attempt = 0; attempt < 150; attempt += 1) {
    if (token !== actionPollToken) return;
    if (attempt > 0)
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
    try {
      const query = new URLSearchParams({ requestId, code });
      const response = await fetch(`/__api/actions?${query}`, {
        headers: { Accept: "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "无法读取 Action 状态。");
      setActionStatus(
        data.message || "正在同步 GitHub Action 状态…",
        data.state,
      );
      if (data.runUrl) runLink.href = data.runUrl;
      if (data.state === "success") {
        resultMessage.textContent = "短链创建成功，现在可以访问。";
        if (data.uploadedAt) {
          const time = new Date(data.uploadedAt);
          const formatted = Number.isNaN(time.getTime())
            ? data.uploadedAt
            : time.toLocaleString();
          const uploadedAt = document.querySelector("#uploaded-at");
          uploadedAt.textContent = `上传时间：${formatted}`;
          uploadedAt.hidden = false;
        }
        return;
      }
      if (data.state === "failure") {
        resultMessage.textContent =
          "短链创建失败，请打开 Action 日志查看原因。";
        return;
      }
    } catch (error) {
      setActionStatus(
        error.message || "Action 状态暂时不可用，将继续重试。",
        "failure",
      );
    }
  }
  if (token === actionPollToken)
    setActionStatus(
      "等待超时；可以通过下方链接查看 GitHub Actions。",
      "failure",
    );
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;
  resultPanel.hidden = true;

  const url = urlInput.value.trim();
  const code = accessMode === "admin" ? codeInput.value.normalize("NFC") : "";
  if (!validUrl(url) || url.length > 300)
    return showError(
      "请输入有效的 HTTP 或 HTTPS 目标网址（最多 300 个字符）。",
    );
  if (accessMode !== "admin" && accessMode !== "guest")
    return showError("请先选择访问模式。");
  if (
    code &&
    (Array.from(code).length > 64 ||
      new TextEncoder().encode(code).length > 180)
  ) {
    return showError("自定义短码最多 64 个字符，UTF-8 编码后最多 180 字节。");
  }

  let expiresAt = null;
  if (expiryInput.value) {
    const date = new Date(expiryInput.value);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now())
      return showError("失效时间必须晚于当前时间。");
    expiresAt = date.toISOString();
  }

  submitButton.disabled = true;
  submitButton.textContent = "正在提交…";
  try {
    const headers = { "Content-Type": "application/json" };
    if (accessMode === "admin") headers["X-Admin-Key"] = adminKey;
    const response = await fetch("/__api/links", {
      method: "POST",
      headers,
      body: JSON.stringify({ url, code, expiresAt }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(data.error || `创建失败（${response.status}）`);

    resultLink.href = data.shortUrl;
    resultLink.textContent = data.shortUrl;
    resultMessage.textContent = "GitHub 已收到请求，正在启动 Action。";
    document.querySelector("#uploaded-at").hidden = true;
    setActionStatus("等待 Action 启动…", "waiting");
    resultPanel.hidden = false;
    codeInput.value = "";
    expiryInput.value = "";
    void watchAction(data.requestId, data.code, data.actionsUrl);
  } catch (error) {
    showError(error.message || "请求失败，请稍后重试。");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "创建短链";
  }
});

document
  .querySelector("#copy-link")
  .addEventListener("click", async (event) => {
    try {
      await navigator.clipboard.writeText(resultLink.href);
      event.currentTarget.textContent = "已复制";
      window.setTimeout(() => {
        event.currentTarget.textContent = "复制短链";
      }, 1600);
    } catch {
      showError("浏览器无法访问剪贴板，请手动复制短链。");
    }
  });

restoreAccessMode();
loadServiceStatus();
