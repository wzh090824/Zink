import { supportedLanguages, translate } from "./Translations.js";

const languageToggle = document.querySelector("#language-toggle");
const themeToggle = document.querySelector("#theme-toggle");
const githubLink = document.querySelector("#github-link");
let locale = preferredLanguage();

function preferredLanguage() {
  try {
    const saved = localStorage.getItem("shortlink-language");
    if (supportedLanguages.includes(saved)) return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function t(key) {
  return translate(locale, key);
}

function applyLanguage(language) {
  locale = supportedLanguages.includes(language) ? language : "zh-CN";
  document.documentElement.lang = locale;
  document.title = t("notFoundTitle");
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  languageToggle.setAttribute("aria-label", t("languageSwitch"));
  languageToggle.title = t("languageSwitch");
  githubLink.setAttribute("aria-label", t("githubProject"));
  githubLink.title = t("githubProject");
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
languageToggle.addEventListener("click", () =>
  applyLanguage(locale === "zh-CN" ? "en" : "zh-CN"),
);
themeToggle.addEventListener("click", () =>
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"),
);
