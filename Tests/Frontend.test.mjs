import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const translationSource = await readFile(
  new URL("../Public/Assets/Translations.js", import.meta.url),
  "utf8",
);
const { supportedLanguages, translations, translate } = await import(
  `data:text/javascript;base64,${Buffer.from(translationSource).toString("base64")}`
);
const pageHtml = await readFile(
  new URL("../Public/index.html", import.meta.url),
  "utf8",
);
const notFoundHtml = await readFile(
  new URL("../Public/404.html", import.meta.url),
  "utf8",
);

test("Chinese and English translations cover both pages", () => {
  assert.deepEqual(supportedLanguages, ["zh-CN", "en"]);
  const keys = new Set(
    [...`${pageHtml}\n${notFoundHtml}`.matchAll(/data-i18n(?:-placeholder|-aria-label|-title)?="([^"]+)"/g)].map(
      (match) => match[1],
    ),
  );
  for (const key of [
    "adminSignIn",
    "themeToDark",
    "themeToLight",
    "languageSwitch",
    "errorExpiryIncomplete",
    "errorExpiryInvalid",
    "footerSettings",
    "footerSettingsEyebrow",
    "footerSettingsTitle",
    "footerSettingsDescription",
    "registrationNumber",
    "registrationNumberPlaceholder",
    "policeRegistrationNumber",
    "policeRegistrationNumberPlaceholder",
    "closeDialog",
    "cancel",
    "saveSettings",
    "errorRegistrationLength",
    "settingsBuildFailureTitle",
    "settingsStatusWaiting",
    "settingsStatusQueued",
    "settingsStatusRunning",
    "settingsStatusSuccess",
    "settingsStatusFailure",
    "settingsBuildTitle",
    "settingsBuildSuccessTitle",
    "settingsUpdatedAt",
    "githubProject",
    "adminFormNote",
    "guestFormNote",
    "statusWaiting",
    "statusQueued",
    "statusRunning",
    "statusSuccess",
    "statusFailure",
    "statusRetry",
  ]) {
    keys.add(key);
  }
  for (const language of supportedLanguages) {
    for (const key of keys) {
      assert.ok(Object.hasOwn(translations[language], key), `${language}: ${key}`);
      assert.notEqual(translate(language, key), key, `${language}: ${key}`);
    }
  }
  assert.equal(translate("en", "pageTitle"), "Zink | Create a short link");
  assert.equal(translate("zh-CN", "pageTitle"), "Zink | 创建短链");
  assert.equal(translate("zh-CN", "serviceReady"), "Zink");
  assert.match(pageHtml, /<p class="site-label">Zink<\/p>/);
  assert.match(notFoundHtml, /<title>Zink \| 短链不存在<\/title>/);
  assert.match(pageHtml, /id="service-status"[^>]*data-i18n="serviceChecking"/);
  assert.match(pageHtml, /href="https:\/\/github\.com\/wzh090824\/Zink"/);
  assert.match(notFoundHtml, /href="https:\/\/github\.com\/wzh090824\/Zink"/);
  assert.match(pageHtml, /<button\b(?=[^>]*\bid="language-toggle")(?=[^>]*\bclass="language-toggle")[^>]*>/);
  assert.match(pageHtml, /<button\b(?=[^>]*\bid="access-language-toggle")(?=[^>]*\bclass="language-toggle")[^>]*>/);
  assert.match(notFoundHtml, /<button\b(?=[^>]*\bid="language-toggle")(?=[^>]*\bclass="language-toggle")[^>]*>/);
  assert.doesNotMatch(`${pageHtml}\n${notFoundHtml}`, /language-select|access-language-select/);
  assert.match(pageHtml, /id="expiry-year"[\s\S]*id="expiry-month"[\s\S]*id="expiry-day"/);
  assert.match(pageHtml, /id="expiry-preset"/);
  assert.match(pageHtml, /data-i18n="beijingOptional"/);
  assert.doesNotMatch(pageHtml.match(/id="target-url"[\s\S]*?\/>/)?.[0] || "", /maxlength=/);
  assert.doesNotMatch(`${translationSource}\n${pageHtml}\n${notFoundHtml}`, /300 characters|300 个字符/);
  assert.match(pageHtml, /id="footer-settings-button"[^>]*hidden/);
  assert.match(pageHtml, /id="registration-number" hidden/);
  assert.match(pageHtml, /id="police-registration-number" hidden/);
  assert.match(pageHtml, /id="site-settings-form"/);
  assert.match(pageHtml, /id="site-settings-dialog"/);
  assert.match(pageHtml, /id="site-settings-language-toggle"/);
  assert.equal(
    translate("en", "uploadedAt", { time: "12:30" }),
    "Uploaded: 12:30 (Beijing time)",
  );
});

test("build status is displayed without GitHub Action links", () => {
  assert.doesNotMatch(pageHtml, /id="action-link"|id="run-link"/);
  assert.doesNotMatch(pageHtml, /href="https:\/\/github\.com\/(?!wzh090824\/Zink)/);
  assert.doesNotMatch(pageHtml, /countdown-value|countdown-number/);
});
