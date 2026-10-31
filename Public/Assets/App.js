import { supportedLanguages, translate } from "./Translations.js";

const form = document.querySelector("#create-form");
const urlInput = document.querySelector("#target-url");
const codeInput = document.querySelector("#short-code");
const expiryInput = document.querySelector("#expires-at");
const errorBox = document.querySelector("#form-error");
const submitButton = document.querySelector("#submit-button");
const accessDialog = document.querySelector("#access-dialog");
const accessInput = document.querySelector("#access-password");
const accessError = document.querySelector("#access-error");
const adminAccessButton = document.querySelector("#admin-access-button");
const customCodeField = document.querySelector("#custom-code-field");
const guestCodeNote = document.querySelector("#guest-code-note");
const languageSelect = document.querySelector("#language-select");
const accessLanguageSelect = document.querySelector("#access-language-select");
const themeToggle = document.querySelector("#theme-toggle");
const buildDialog = document.querySelector("#build-dialog");
const buildDialogTitle = document.querySelector("#build-title");
const buildStatus = document.querySelector("#build-status");
const buildRing = document.querySelector("#build-ring");
const ringProgress = document.querySelector("#build-ring-progress");
const countdownValue = document.querySelector("#countdown-value");
const buildResultLink = document.querySelector("#build-result-link");
const uploadedAt = document.querySelector("#uploaded-at");
const copyButton = document.querySelector("#copy-link");
const ringCircumference = 2 * Math.PI * 52;
const countdownSeconds = 60;

let locale = preferredLanguage();
let accessMode = null;
let adminKey = "";
let actionPollToken = 0;
let countdownTimer = null;
let countdownRemaining = countdownSeconds;

function preferredLanguage() {
  try {
    const saved = localStorage.getItem("shortlink-language");
    if (supportedLanguages.includes(saved)) return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function t(key, values) {
  return translate(locale, key, values);
}

function applyLanguage(language) {
  locale = supportedLanguages.includes(language) ? language : "zh-CN";
  document.documentElement.lang = locale;
  document.title = t("pageTitle");
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });
  languageSelect.value = locale;
  accessLanguageSelect.value = locale;
  languageSelect.setAttribute("aria-label", t("language"));
  accessLanguageSelect.setAttribute("aria-label", t("language"));
  document.querySelector("#access-badge").textContent = t(
    accessMode ? (accessMode === "admin" ? "adminMode" : "guestMode") : "chooseAccess",
  );
  document.querySelector("#change-mode-label").textContent = t(
    accessMode === "admin"
      ? "changeAccess"
      : accessMode === "guest"
        ? "adminSignIn"
        : "accessSettings",
  );
  if (accessMode)
    document.querySelector("#form-note").textContent = t(
      accessMode === "admin" ? "adminFormNote" : "guestFormNote",
    );
  updateThemeLabel();
  try {
    localStorage.setItem("shortlink-language", locale);
  } catch {}
}

function updateThemeLabel() {
  const key =
    document.documentElement.dataset.theme === "dark"
      ? "themeToLight"
      : "themeToDark";
  themeToggle.setAttribute("aria-label", t(key));
  themeToggle.title = t(key);
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#09090b" : "#ffffff");
  updateThemeLabel();
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
applyLanguage(locale);
setTheme(initialTheme);
languageSelect.addEventListener("change", () =>
  applyLanguage(languageSelect.value),
);
accessLanguageSelect.addEventListener("change", () =>
  applyLanguage(accessLanguageSelect.value),
);
themeToggle.addEventListener("click", () =>
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"),
);

document.querySelector("#origin-prefix").textContent =
  `${window.location.host}/`;

function requestHeaders(headers = {}) {
  return { ...headers, "Accept-Language": locale };
}

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
  document.querySelector("#access-badge").textContent = t(
    isAdmin ? "adminMode" : "guestMode",
  );
  document.querySelector("#change-mode-label").textContent = t(
    isAdmin ? "changeAccess" : "adminSignIn",
  );
  document.querySelector("#form-note").textContent = t(
    isAdmin ? "adminFormNote" : "guestFormNote",
  );
  if (accessDialog.open) accessDialog.close();
}

function openAccessDialog() {
  accessError.hidden = true;
  accessInput.value = "";
  accessDialog.showModal();
  accessInput.focus();
}

document.querySelector("#change-mode").addEventListener("click", openAccessDialog);
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
      accessError.textContent = t("accessPasswordRequired");
      accessError.hidden = false;
      return;
    }
    adminAccessButton.disabled = true;
    adminAccessButton.textContent = t("validating");
    try {
      const response = await fetch("/__api/access", {
        method: "POST",
        headers: requestHeaders({ "X-Admin-Key": key }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || t("accessPasswordInvalid"));
      showAccessMode("admin", key);
    } catch (error) {
      accessError.textContent = error.message || t("accessPasswordInvalid");
      accessError.hidden = false;
    } finally {
      adminAccessButton.disabled = false;
      adminAccessButton.textContent = t("adminEnter");
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
  try {
    const response = await fetch("/__api/health", {
      headers: requestHeaders({ Accept: "application/json" }),
    });
    if (!response.ok) throw new Error("Worker unavailable");
    const data = await response.json();
    status.textContent = data.ready
      ? t("serviceReady")
      : t("serviceUnconfigured");
    dot.className = data.ready ? "state-dot ready" : "state-dot offline";
  } catch {
    status.textContent = t("serviceOffline");
    dot.className = "state-dot offline";
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

function stopCountdown() {
  if (countdownTimer) window.clearInterval(countdownTimer);
  countdownTimer = null;
}

function startCountdown() {
  stopCountdown();
  countdownRemaining = countdownSeconds;
  countdownValue.textContent = String(countdownRemaining);
  ringProgress.style.strokeDasharray = String(ringCircumference);
  ringProgress.style.strokeDashoffset = "0";
  buildDialog.dataset.state = "running";
  buildRing.dataset.state = "running";
  buildDialogTitle.textContent = t("buildTitle");
  buildStatus.textContent = t("statusWaiting");
  uploadedAt.hidden = true;
  if (!buildDialog.open) buildDialog.showModal();
  countdownTimer = window.setInterval(() => {
    if (countdownRemaining === 0) return;
    countdownRemaining -= 1;
    countdownValue.textContent = String(countdownRemaining);
    ringProgress.style.strokeDashoffset = String(
      ringCircumference * (1 - countdownRemaining / countdownSeconds),
    );
    if (countdownRemaining === 0) {
      buildStatus.textContent = t("statusLongWait");
      stopCountdown();
    }
  }, 1000);
}

function setBuildState(state, messageKey) {
  const messages = {
    waiting: "statusWaiting",
    queued: "statusQueued",
    running: "statusRunning",
    success: "statusSuccess",
    failure: "statusFailure",
  };
  const finished = state === "success" || state === "failure";
  buildDialog.dataset.state = finished ? state : "running";
  buildRing.dataset.state = finished ? state : "running";
  if (state === "success") ringProgress.style.strokeDashoffset = "0";
  buildDialogTitle.textContent = t(
    state === "success"
      ? "buildSuccessTitle"
      : state === "failure"
        ? "buildFailureTitle"
        : "buildTitle",
  );
  buildStatus.textContent = t(messageKey || messages[state] || "statusRunning");
  if (finished) stopCountdown();
}

document
  .querySelector("#close-build")
  .addEventListener("click", () => buildDialog.close());
buildDialog.addEventListener("close", stopCountdown);

async function watchAction(requestId, code) {
  const token = ++actionPollToken;
  let firstRequest = true;
  while (token === actionPollToken) {
    if (!firstRequest) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      if (token !== actionPollToken) return;
    }
    firstRequest = false;
    try {
      const query = new URLSearchParams({ requestId, code });
      const response = await fetch(`/__api/actions?${query}`, {
        headers: requestHeaders({ Accept: "application/json" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || t("statusRetry"));
      setBuildState(data.state);
      if (data.state === "success") {
        if (data.uploadedAt) {
          const time = new Date(data.uploadedAt);
          const formatted = Number.isNaN(time.getTime())
            ? data.uploadedAt
            : time.toLocaleString(locale);
          uploadedAt.textContent = t("uploadedAt", { time: formatted });
          uploadedAt.hidden = false;
        }
        return;
      }
      if (data.state === "failure") return;
    } catch {
      buildStatus.textContent = t("statusRetry");
    }
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const url = urlInput.value.trim();
  const code = accessMode === "admin" ? codeInput.value.normalize("NFC") : "";
  if (!validUrl(url) || url.length > 300) return showError(t("errorUrl"));
  if (accessMode !== "admin" && accessMode !== "guest")
    return showError(t("errorChooseAccess"));
  if (
    code &&
    (Array.from(code).length > 64 ||
      new TextEncoder().encode(code).length > 180)
  ) {
    return showError(t("errorCodeLength"));
  }

  let expiresAt = null;
  if (expiryInput.value) {
    const date = new Date(expiryInput.value);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now())
      return showError(t("errorExpiry"));
    expiresAt = date.toISOString();
  }

  submitButton.disabled = true;
  submitButton.textContent = t("submitting");
  try {
    const headers = requestHeaders({ "Content-Type": "application/json" });
    if (accessMode === "admin") headers["X-Admin-Key"] = adminKey;
    const response = await fetch("/__api/links", {
      method: "POST",
      headers,
      body: JSON.stringify({ url, code, expiresAt }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t("unknownError"));

    buildResultLink.href = data.shortUrl;
    buildResultLink.textContent = data.shortUrl;
    startCountdown();
    codeInput.value = "";
    expiryInput.value = "";
    void watchAction(data.requestId, data.code);
  } catch (error) {
    showError(error.message || t("unknownError"));
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = t("createLink");
  }
});

copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(buildResultLink.href);
    copyButton.textContent = t("copied");
    window.setTimeout(() => {
      copyButton.textContent = t("copyLink");
    }, 1600);
  } catch {
    showError(t("copyUnavailable"));
  }
});

restoreAccessMode();
loadServiceStatus();
