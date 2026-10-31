import { supportedLanguages, translate } from "./Translations.js";
import { beijingDateAfter, beijingExpiry, formatBeijingTime } from "./Dates.js";

const form = document.querySelector("#create-form");
const urlInput = document.querySelector("#target-url");
const codeInput = document.querySelector("#short-code");
const expiryPreset = document.querySelector("#expiry-preset");
const expiryYear = document.querySelector("#expiry-year");
const expiryMonth = document.querySelector("#expiry-month");
const expiryDay = document.querySelector("#expiry-day");
const expiryInputs = [expiryYear, expiryMonth, expiryDay];
const errorBox = document.querySelector("#form-error");
const submitButton = document.querySelector("#submit-button");
const accessDialog = document.querySelector("#access-dialog");
const accessInput = document.querySelector("#access-password");
const accessError = document.querySelector("#access-error");
const adminAccessButton = document.querySelector("#admin-access-button");
const customCodeField = document.querySelector("#custom-code-field");
const guestCodeNote = document.querySelector("#guest-code-note");
const footerSettingsButton = document.querySelector("#footer-settings-button");
const siteSettingsDialog = document.querySelector("#site-settings-dialog");
const siteSettingsForm = document.querySelector("#site-settings-form");
const siteSettingsError = document.querySelector("#site-settings-error");
const registrationNumberInput = document.querySelector("#registration-number-input");
const policeRegistrationNumberInput = document.querySelector("#police-registration-number-input");
const saveSiteSettingsButton = document.querySelector("#save-site-settings");
const registrationNumberOutput = document.querySelector("#registration-number");
const policeRegistrationNumberOutput = document.querySelector("#police-registration-number");
const languageButtons = document.querySelectorAll(".language-toggle");
const themeToggle = document.querySelector("#theme-toggle");
const githubLink = document.querySelector("#github-link");
const buildDialog = document.querySelector("#build-dialog");
const buildDialogTitle = document.querySelector("#build-title");
const buildStatus = document.querySelector("#build-status");
const buildRing = document.querySelector("#build-ring");
const ringProgress = document.querySelector("#build-ring-progress");
const buildResultLink = document.querySelector("#build-result-link");
const buildLinkBlock = document.querySelector(".build-link-block");
const buildDialogActions = document.querySelector(".build-dialog-actions");
const uploadedAt = document.querySelector("#uploaded-at");
const copyButton = document.querySelector("#copy-link");
const ringCircumference = 2 * Math.PI * 52;

let locale = preferredLanguage();
let accessMode = null;
let adminKey = "";
let actionPollToken = 0;
let lastUploadedAt = "";
let currentBuildKind = "short-link";
let siteSettings = { registrationNumber: "", policeRegistrationNumber: "" };

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
  document.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.title = t(element.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  languageButtons.forEach((button) => {
    button.setAttribute("aria-label", t("languageSwitch"));
    button.title = t("languageSwitch");
  });
  if (lastUploadedAt) {
    uploadedAt.textContent = t(
      currentBuildKind === "site-settings" ? "settingsUpdatedAt" : "uploadedAt",
      { time: formatBeijingTime(lastUploadedAt, locale) },
    );
  }
  githubLink.setAttribute("aria-label", t("githubProject"));
  githubLink.title = t("githubProject");
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
languageButtons.forEach((button) => {
  button.addEventListener("click", () =>
    applyLanguage(locale === "zh-CN" ? "en" : "zh-CN"),
  );
});
themeToggle.addEventListener("click", () =>
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"),
);

document.querySelector("#origin-prefix").textContent =
  `${window.location.host}/`;

function renderSiteSettings(settings) {
  siteSettings = {
    registrationNumber:
      typeof settings.registrationNumber === "string"
        ? settings.registrationNumber
        : "",
    policeRegistrationNumber:
      typeof settings.policeRegistrationNumber === "string"
        ? settings.policeRegistrationNumber
        : "",
  };
  registrationNumberOutput.textContent = siteSettings.registrationNumber;
  registrationNumberOutput.hidden = !siteSettings.registrationNumber;
  policeRegistrationNumberOutput.textContent = siteSettings.policeRegistrationNumber;
  policeRegistrationNumberOutput.hidden = !siteSettings.policeRegistrationNumber;
}

async function loadSiteSettings() {
  const response = await fetch("/__api/site-settings", {
    headers: requestHeaders({ Accept: "application/json" }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || t("unknownError"));
  renderSiteSettings(data);
}

footerSettingsButton.addEventListener("click", () => {
  if (accessMode !== "admin") return;
  siteSettingsError.hidden = true;
  registrationNumberInput.value = siteSettings.registrationNumber;
  policeRegistrationNumberInput.value = siteSettings.policeRegistrationNumber;
  siteSettingsDialog.showModal();
  registrationNumberInput.focus();
});
document
  .querySelector("#close-site-settings")
  .addEventListener("click", () => siteSettingsDialog.close());
document
  .querySelector("#cancel-site-settings")
  .addEventListener("click", () => siteSettingsDialog.close());
siteSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  siteSettingsError.hidden = true;
  if (accessMode !== "admin" || !adminKey) {
    siteSettingsError.textContent = t("accessPasswordInvalid");
    siteSettingsError.hidden = false;
    return;
  }

  saveSiteSettingsButton.disabled = true;
  saveSiteSettingsButton.textContent = t("submitting");
  try {
    const response = await fetch("/__api/site-settings", {
      method: "POST",
      headers: requestHeaders({
        "Content-Type": "application/json",
        "X-Admin-Key": adminKey,
      }),
      body: JSON.stringify({
        registrationNumber: registrationNumberInput.value,
        policeRegistrationNumber: policeRegistrationNumberInput.value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || t("unknownError"));
    siteSettingsDialog.close();
    startBuildAnimation("site-settings");
    void watchAction(data.requestId, "", data.requestedAt, "site-settings");
  } catch (error) {
    siteSettingsError.textContent = error.message || t("unknownError");
    siteSettingsError.hidden = false;
  } finally {
    saveSiteSettingsButton.disabled = false;
    saveSiteSettingsButton.textContent = t("saveSettings");
  }
});

expiryPreset.addEventListener("change", () => {
  errorBox.hidden = true;
  if (expiryPreset.value === "custom") {
    expiryYear.focus();
  } else if (!expiryPreset.value) {
    expiryInputs.forEach((input) => {
      input.value = "";
    });
  } else {
    const date = beijingDateAfter(Number(expiryPreset.value));
    expiryYear.value = date.year;
    expiryMonth.value = date.month;
    expiryDay.value = date.day;
  }
});
expiryInputs.forEach((input) => {
  input.addEventListener("input", () => {
    errorBox.hidden = true;
    expiryPreset.value = expiryInputs.some((field) => field.value.trim())
      ? "custom"
      : "";
  });
});
urlInput.addEventListener("input", () => {
  errorBox.hidden = true;
});
codeInput.addEventListener("input", () => {
  errorBox.hidden = true;
});

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
  footerSettingsButton.hidden = !isAdmin;
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

function startBuildAnimation(kind = "short-link") {
  currentBuildKind = kind;
  ringProgress.style.strokeDasharray = "90 327";
  ringProgress.style.strokeDashoffset = "0";
  buildDialog.dataset.state = "running";
  buildRing.dataset.state = "running";
  buildDialogTitle.textContent = t(
    kind === "site-settings" ? "settingsBuildTitle" : "buildTitle",
  );
  buildStatus.textContent = t(
    kind === "site-settings" ? "settingsStatusWaiting" : "statusWaiting",
  );
  uploadedAt.hidden = true;
  lastUploadedAt = "";
  buildLinkBlock.hidden = kind === "site-settings";
  buildDialogActions.hidden = kind === "site-settings";
  if (!buildDialog.open) buildDialog.showModal();
}

function setBuildState(state, messageKey) {
  const messages = {
    waiting:
      currentBuildKind === "site-settings" ? "settingsStatusWaiting" : "statusWaiting",
    queued:
      currentBuildKind === "site-settings" ? "settingsStatusQueued" : "statusQueued",
    running:
      currentBuildKind === "site-settings" ? "settingsStatusRunning" : "statusRunning",
    success:
      currentBuildKind === "site-settings" ? "settingsStatusSuccess" : "statusSuccess",
    failure:
      currentBuildKind === "site-settings" ? "settingsStatusFailure" : "statusFailure",
  };
  const finished = state === "success" || state === "failure";
  buildDialog.dataset.state = finished ? state : "running";
  buildRing.dataset.state = finished ? state : "running";
  if (finished) {
    ringProgress.style.strokeDasharray = String(ringCircumference);
    ringProgress.style.strokeDashoffset = "0";
  }
  buildDialogTitle.textContent = t(
    state === "success"
      ? currentBuildKind === "site-settings"
        ? "settingsBuildSuccessTitle"
        : "buildSuccessTitle"
      : state === "failure"
        ? currentBuildKind === "site-settings"
          ? "settingsBuildFailureTitle"
          : "buildFailureTitle"
        : currentBuildKind === "site-settings"
          ? "settingsBuildTitle"
          : "buildTitle",
  );
  buildStatus.textContent = t(messageKey || messages[state] || "statusRunning");
}

document
  .querySelector("#close-build")
  .addEventListener("click", () => buildDialog.close());

async function watchAction(requestId, code, requestedAt, kind = "short-link") {
  const token = ++actionPollToken;
  let firstRequest = true;
  while (token === actionPollToken) {
    if (!firstRequest) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      if (token !== actionPollToken) return;
    }
    firstRequest = false;
    try {
      const query = new URLSearchParams({ requestId, requestedAt, kind });
      if (code) query.set("code", code);
      const response = await fetch(`/__api/actions?${query}`, {
        headers: requestHeaders({ Accept: "application/json" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || t("statusRetry"));
      setBuildState(data.state);
      if (data.state === "success") {
        if (kind === "site-settings") await loadSiteSettings().catch(() => {});
        if (data.uploadedAt) {
          lastUploadedAt = data.uploadedAt;
          uploadedAt.textContent = t(
            kind === "site-settings" ? "settingsUpdatedAt" : "uploadedAt",
            { time: formatBeijingTime(lastUploadedAt, locale) },
          );
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
  if (!validUrl(url)) return showError(t("errorUrl"));
  if (accessMode !== "admin" && accessMode !== "guest")
    return showError(t("errorChooseAccess"));
  if (
    code &&
    (Array.from(code).length > 64 ||
      new TextEncoder().encode(code).length > 180)
  ) {
    return showError(t("errorCodeLength"));
  }

  let expiresAt;
  try {
    expiresAt = beijingExpiry(
      expiryYear.value,
      expiryMonth.value,
      expiryDay.value,
    );
  } catch (error) {
    const key =
      error.message === "incomplete"
        ? "errorExpiryIncomplete"
        : error.message === "past"
          ? "errorExpiry"
          : "errorExpiryInvalid";
    return showError(t(key));
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
    startBuildAnimation();
    codeInput.value = "";
    expiryPreset.value = "";
    expiryInputs.forEach((input) => {
      input.value = "";
    });
    void watchAction(data.requestId, data.code, data.requestedAt);
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
loadSiteSettings().catch(() => {});
