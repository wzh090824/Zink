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
    [...`${pageHtml}\n${notFoundHtml}`.matchAll(/data-i18n(?:-placeholder)?="([^"]+)"/g)].map(
      (match) => match[1],
    ),
  );
  for (const key of [
    "adminSignIn",
    "themeToDark",
    "themeToLight",
    "adminFormNote",
    "guestFormNote",
    "statusWaiting",
    "statusQueued",
    "statusRunning",
    "statusSuccess",
    "statusFailure",
    "statusRetry",
    "statusLongWait",
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
  assert.match(pageHtml, /<p class="site-label">Zink<\/p>/);
  assert.match(notFoundHtml, /<title>Zink \| 短链不存在<\/title>/);
  assert.equal(translate("en", "uploadedAt", { time: "12:30" }), "Uploaded: 12:30");
});

test("build status is displayed without GitHub Action links", () => {
  assert.doesNotMatch(pageHtml, /id="action-link"|id="run-link"/);
  assert.doesNotMatch(pageHtml, /href="https:\/\/github\.com/);
});
