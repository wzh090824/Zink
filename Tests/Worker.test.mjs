import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerSource = await readFile(
  new URL("../Src/Worker.js", import.meta.url),
  "utf8",
);
const { default: worker } = await import(
  `data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`
);

test("Worker configuration avoids reserved GITHUB_ environment names", () => {
  assert.doesNotMatch(workerSource, /env\.GITHUB_[A-Z_]+/);
});

function mappingFileName(code) {
  const safe =
    code !== "." &&
    code !== ".." &&
    !code.startsWith("~") &&
    !/[<>:"/\\|?*\u0000-\u001f\u007f]/u.test(code) &&
    !/[. ]$/u.test(code) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(code);
  return safe ? code : `~${Buffer.from(code).toString("base64url")}`;
}

test("access modes, Unicode short codes, Action status, and expiration", async (t) => {
  const records = new Map();
  const env = {
    GH_OWNER: "owner",
    GH_REPO: "links",
    GH_BRANCH: "main",
    GH_TOKEN: "test-token",
    ADMIN_KEY: "test-admin-key",
    ASSETS: {
      fetch: async (request) =>
        new Response(
          request.url.endsWith("/404.html") ? "custom 404 page" : "asset",
          {
            headers: { "Content-Type": "text/html" },
          },
        ),
    },
  };
  let runStatus = "waiting";
  let lastDispatch;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/dispatches")) {
      lastDispatch = JSON.parse(init.body).client_payload;
      return new Response(null, { status: 204 });
    }
    if (url.pathname.endsWith("/actions/runs")) {
      const workflowRuns =
        runStatus === "waiting"
          ? []
          : [
              {
                display_title: `Short-${lastDispatch.code}`,
                status: runStatus,
                conclusion: runStatus === "completed" ? "success" : null,
              },
            ];
      return Response.json({ workflow_runs: workflowRuns });
    }
    if (url.pathname.includes("/contents/")) {
      const [, path] = url.pathname.split("/contents/");
      const filePath = decodeURIComponent(path);
      const record = records.get(filePath);
      if (!record) return new Response("", { status: 404 });
      const content =
        typeof record === "string" ? record : JSON.stringify(record);
      return Response.json({
        type: "file",
        encoding: "base64",
        content: Buffer.from(content).toString("base64"),
      });
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const request = (path, init = {}) =>
    worker.fetch(new Request(`https://sho.rt${path}`, init), env);
  const create = (body, headers = {}) =>
    request("/__api/links", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  const health = await request("/__api/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ready, true);

  const acceptedPassword = await request("/__api/access", {
    method: "POST",
    headers: { "X-Admin-Key": "test-admin-key" },
  });
  const rejectedPassword = await request("/__api/access", {
    method: "POST",
    headers: { "X-Admin-Key": "wrong" },
  });
  assert.equal(acceptedPassword.status, 200);
  assert.equal(rejectedPassword.status, 401);
  const rejectedPasswordEnglish = await request("/__api/access", {
    method: "POST",
    headers: { "X-Admin-Key": "wrong", "Accept-Language": "en" },
  });
  assert.equal(
    (await rejectedPasswordEnglish.json()).error,
    "Incorrect access password.",
  );

  const guestCustomCode = await create({
    code: "custom",
    url: "https://example.com",
  });
  assert.equal(guestCustomCode.status, 403);

  const guestCreate = await create(
    { code: "", url: "https://example.com/guest" },
    { "CF-Connecting-IP": "203.0.113.8" },
  );
  const guest = await guestCreate.json();
  assert.equal(guestCreate.status, 202);
  assert.match(guest.code, /^[a-z2-9]{9}$/);
  assert.equal(lastDispatch.ip, "203.0.113.8");
  assert.equal(lastDispatch.code, guest.code);
  assert.equal(
    (
      await request(
        `/__api/actions?requestId=${guest.requestId}&code=${encodeURIComponent(guest.code)}`,
      )
    ).status,
    200,
  );
  const waiting = await (
    await request(
      `/__api/actions?requestId=${guest.requestId}&code=${encodeURIComponent(guest.code)}`,
    )
  ).json();
  assert.equal(waiting.state, "waiting");
  const waitingEnglish = await request(
    `/__api/actions?requestId=${guest.requestId}&code=${encodeURIComponent(guest.code)}`,
    { headers: { "Accept-Language": "en" } },
  );
  assert.equal(
    (await waitingEnglish.json()).message,
    "GitHub received the request and is starting the Action.",
  );

  const code = "我的/短链? #";
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const adminCreate = await create(
    { code, url: "https://example.org/path", expiresAt },
    { "X-Admin-Key": "test-admin-key", "CF-Connecting-IP": "2001:db8::8" },
  );
  const admin = await adminCreate.json();
  assert.equal(adminCreate.status, 202);
  assert.equal(admin.code, code);
  assert.equal(Object.hasOwn(admin, "actionsUrl"), false);
  assert.equal(lastDispatch.ip, "2001:db8::8");
  assert.equal(lastDispatch.expiresAt, expiresAt);

  const uploadedAt = new Date().toISOString();
  records.set(`List/${mappingFileName(code)}`, {
    code,
    url: "https://example.org/path",
    ip: "2001:db8::8",
    uploadedAt,
    expiresAt,
  });
  const shortPath = `/${encodeURIComponent(code)}`;
  const redirect = await request(shortPath);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get("Location"), "https://example.org/path");

  runStatus = "queued";
  const queued = await (
    await request(
      `/__api/actions?requestId=${admin.requestId}&code=${encodeURIComponent(code)}`,
    )
  ).json();
  assert.equal(queued.state, "queued");
  runStatus = "in_progress";
  const running = await (
    await request(
      `/__api/actions?requestId=${admin.requestId}&code=${encodeURIComponent(code)}`,
    )
  ).json();
  assert.equal(running.state, "running");
  runStatus = "completed";
  const completed = await (
    await request(
      `/__api/actions?requestId=${admin.requestId}&code=${encodeURIComponent(code)}`,
    )
  ).json();
  assert.equal(completed.state, "success");
  assert.equal(completed.uploadedAt, uploadedAt);
  assert.equal(Object.hasOwn(completed, "runUrl"), false);

  records.set("List/expired", {
    code: "expired",
    url: "https://example.net/old",
    ip: "",
    uploadedAt,
    expiresAt: "2020-01-01T00:00:00.000Z",
  });
  const expired = await request("/expired");
  assert.equal(expired.status, 404);
  assert.equal(await expired.text(), "custom 404 page");

  const dotCode = `~_${Buffer.from("..").toString("base64url")}`;
  records.set(`List/${mappingFileName("..")}`, {
    code: "..",
    url: "https://example.net/dot-code",
    ip: "",
    uploadedAt,
    expiresAt: null,
  });
  const dotRedirect = await request(`/${dotCode}`);
  assert.equal(dotRedirect.status, 302);
  assert.equal(
    dotRedirect.headers.get("Location"),
    "https://example.net/dot-code",
  );

  const invalidActionId = await request("/__api/actions?requestId=invalid");
  assert.equal(invalidActionId.status, 400);
});
