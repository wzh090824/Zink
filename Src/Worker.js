const API = "/__api";
const MAX_CODE_POINTS = 64;
const MAX_CODE_BYTES = 180;
const REQUEST_ID_PATTERN = /^[0-9a-f-]{36}$/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === `${API}/health` && request.method === "GET") {
      const repositoryConfigured = hasRepository(env);
      return jsonResponse({
        ready: Boolean(repositoryConfigured && env.GITHUB_TOKEN),
        adminEnabled: Boolean(env.ADMIN_KEY),
        repository: repositoryConfigured
          ? `${env.GITHUB_OWNER}/${env.GITHUB_REPO}`
          : "",
        repositoryUrl: repositoryConfigured
          ? `https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`
          : "https://github.com",
        branch: env.GITHUB_BRANCH || "default",
      });
    }
    if (url.pathname === `${API}/access` && request.method === "POST")
      return verifyAdminAccess(request, env);
    if (url.pathname === `${API}/links` && request.method === "POST")
      return createLink(request, env);
    if (url.pathname === `${API}/actions` && request.method === "GET")
      return getActionStatus(request, url, env);
    if (url.pathname.startsWith(`${API}/`))
      return jsonResponse(
        { error: localized(request, "未找到该接口。", "API endpoint not found.") },
        404,
      );

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }
    if (
      url.pathname === "/" ||
      url.pathname === "/404.html" ||
      url.pathname.startsWith("/Assets/")
    ) {
      return env.ASSETS.fetch(request);
    }

    let code;
    try {
      code = decodeRouteCode(url.pathname.slice(1));
    } catch {
      return notFound(request, env);
    }
    if (!validCode(code)) return notFound(request, env);
    return redirectForCode(code, request, env);
  },
};

async function verifyAdminAccess(request, env) {
  if (!env.ADMIN_KEY)
    return jsonResponse(
      {
        error: localized(
          request,
          "管理员访问密码尚未配置。",
          "The admin password is not configured.",
        ),
      },
      503,
    );
  const key = request.headers.get("X-Admin-Key") || "";
  if (!constantTimeEqual(key, env.ADMIN_KEY))
    return jsonResponse(
      { error: localized(request, "访问密码不正确。", "Incorrect access password.") },
      401,
    );
  return jsonResponse({ authenticated: true });
}

async function createLink(request, env) {
  if (!env.GITHUB_TOKEN || !hasRepository(env)) {
    return jsonResponse(
      {
        error: localized(
          request,
          "Cloudflare Worker 尚未完成 GitHub 配置。",
          "GitHub is not configured for this Cloudflare Worker.",
        ),
      },
      503,
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { error: localized(request, "请求内容必须是 JSON。", "Request body must be JSON.") },
      400,
    );
  }

  const suppliedKey = request.headers.get("X-Admin-Key") || "";
  const isAdmin = Boolean(suppliedKey);
  if (
    isAdmin &&
    (!env.ADMIN_KEY || !constantTimeEqual(suppliedKey, env.ADMIN_KEY))
  ) {
    return jsonResponse(
      {
        error: localized(
          request,
          "管理员访问密码不正确。",
          "Incorrect admin password.",
        ),
      },
      401,
    );
  }

  const target = typeof body.url === "string" ? body.url.trim() : "";
  const requestedCode =
    typeof body.code === "string" ? body.code.normalize("NFC") : "";
  const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : "";
  if (!validTarget(target))
    return jsonResponse(
      {
        error: localized(
          request,
          "目标网址必须是有效的 HTTP 或 HTTPS 网址，且不超过 300 个字符。",
          "Destination must be a valid HTTP or HTTPS URL no longer than 300 characters.",
        ),
      },
      400,
    );
  if (expiresAt && !validFutureTimestamp(expiresAt))
    return jsonResponse(
      {
        error: localized(
          request,
          "失效时间必须是未来的有效时间。",
          "Expiration must be a valid future time.",
        ),
      },
      400,
    );
  if (!isAdmin && requestedCode !== "")
    return jsonResponse(
      {
        error: localized(
          request,
          "访客模式只能使用系统生成的随机短码。",
          "Guest mode can only use a randomly generated code.",
        ),
      },
      403,
    );
  if (isAdmin && requestedCode !== "" && !validCode(requestedCode)) {
    return jsonResponse(
      {
        error: localized(
          request,
          "自定义短码不能为空白，最多 64 个字符。",
          "Custom code must contain 1 to 64 non-whitespace characters.",
        ),
      },
      400,
    );
  }

  let code = requestedCode;
  let collision;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!code) code = randomCode();
    collision = await getGithubFile(code, env);
    if (collision.kind === "missing") break;
    if (collision.kind === "error")
      return jsonResponse(
        {
          error: localized(
            request,
            "暂时无法查询 GitHub，请稍后重试。",
            "GitHub could not be queried. Please try again.",
          ),
        },
        502,
      );
    if (isAdmin)
      return jsonResponse(
        {
          error: localized(
            request,
            "这个短码已经存在，请换一个短码。",
            "This code already exists. Choose another code.",
          ),
        },
        409,
      );
    code = "";
  }
  if (!code || collision?.kind !== "missing")
    return jsonResponse(
      {
        error: localized(
          request,
          "暂时无法生成可用短码，请重试。",
          "A unique code could not be generated. Please try again.",
        ),
      },
      503,
    );

  const requestId = crypto.randomUUID();
  const headers = githubHeaders(env.GITHUB_TOKEN);
  const dispatchUrl = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/dispatches`;
  let dispatch;
  try {
    dispatch = await fetch(dispatchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event_type: "create_short_link",
        client_payload: {
          requestId,
          code,
          url: target,
          expiresAt: expiresAt || null,
          ip: request.headers.get("CF-Connecting-IP") || "",
          branch: env.GITHUB_BRANCH || "",
        },
      }),
    });
  } catch {
    return jsonResponse(
      {
        error: localized(
          request,
          "无法连接 GitHub，请检查 Worker 网络和仓库配置。",
          "Could not connect to GitHub. Check Worker network and repository settings.",
        ),
      },
      502,
    );
  }
  if ([401, 403, 404].includes(dispatch.status)) {
    return jsonResponse(
      {
        error: localized(
          request,
          "GitHub 仓库或 Token 配置无效，或 Token 缺少 Contents/Actions 权限。",
          "The GitHub repository or token is invalid, or the token lacks Contents/Actions permissions.",
        ),
      },
      502,
    );
  }
  if (!dispatch.ok)
    return jsonResponse(
      {
        error: localized(
          request,
          "GitHub 未能接受创建请求。",
          "GitHub did not accept the creation request.",
        ),
      },
      502,
    );

  return jsonResponse(
    {
      accepted: true,
      code,
      requestId,
      shortUrl: `${new URL(request.url).origin}/${routeSegmentForCode(code)}`,
      actionsUrl: `${repositoryUrl(env)}/actions`,
    },
    202,
  );
}

async function getActionStatus(request, url, env) {
  if (!env.GITHUB_TOKEN || !hasRepository(env))
    return jsonResponse(
      {
        error: localized(
          request,
          "GitHub 查询尚未配置。",
          "GitHub lookup is not configured.",
        ),
      },
      503,
    );
  const requestId = url.searchParams.get("requestId") || "";
  if (!REQUEST_ID_PATTERN.test(requestId))
    return jsonResponse(
      { error: localized(request, "请求编号无效。", "Invalid request ID.") },
      400,
    );

  const runsUrl = new URL(
    `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/runs`,
  );
  runsUrl.searchParams.set("event", "repository_dispatch");
  runsUrl.searchParams.set("per_page", "100");
  if (env.GITHUB_BRANCH) runsUrl.searchParams.set("branch", env.GITHUB_BRANCH);

  let response;
  try {
    response = await fetch(runsUrl, {
      headers: githubHeaders(env.GITHUB_TOKEN),
    });
  } catch {
    return jsonResponse(
      {
        error: localized(
          request,
          "无法读取 GitHub Action 状态。",
          "Could not read GitHub Action status.",
        ),
      },
      502,
    );
  }
  if (!response.ok)
    return jsonResponse(
      {
        error: localized(
          request,
          "无法读取 GitHub Action 状态，请确认 Token 具有 Actions 只读权限。",
          "Could not read Action status. Confirm the token has read-only Actions permission.",
        ),
      },
      502,
    );
  const data = await response.json();
  const run = (data.workflow_runs || []).find(
    (item) => item.display_title === `Short link ${requestId}`,
  );
  if (!run)
    return jsonResponse({
      state: "waiting",
      message: localized(
        request,
        "GitHub 已收到请求，正在启动 Action。",
        "GitHub received the request and is starting the Action.",
      ),
    });

  const status = {
    queued: {
      state: "queued",
      message: localized(
        request,
        "Action 已排队，等待 GitHub Runner。",
        "The Action is queued and waiting for a GitHub Runner.",
      ),
    },
    in_progress: {
      state: "running",
      message: localized(
        request,
        "Action 正在写入短链文件。",
        "The Action is writing the short-link file.",
      ),
    },
  }[run.status];
  const result = {
    ...(status || {
      state: "running",
      message: localized(request, "Action 正在处理。", "The Action is processing the request."),
    }),
    runId: run.id,
    runUrl: run.html_url,
  };
  if (run.status === "completed") {
    result.state = run.conclusion === "success" ? "success" : "failure";
    result.message =
      run.conclusion === "success"
        ? localized(request, "Action 已完成，短链现在可以访问。", "The Action completed. The short link is ready.")
        : localized(
            request,
            `Action 执行失败（${run.conclusion || "unknown"}），请打开日志查看原因。`,
            `The Action failed (${run.conclusion || "unknown"}). Open the log for details.`,
          );
    if (result.state === "success") {
      const code = url.searchParams.get("code") || "";
      if (validCode(code)) {
        const file = await getGithubFile(code, env);
        if (file.kind === "found" && file.uploadedAt)
          result.uploadedAt = file.uploadedAt;
      }
    }
  }
  return jsonResponse(result);
}

async function redirectForCode(code, request, env) {
  const result = await getGithubFile(code, env);
  if (result.kind === "missing") return notFound(request, env);
  if (result.kind === "error")
    return new Response("GitHub lookup failed", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  if (!validTarget(result.url)) return notFound(request, env);

  let expiresAt = result.expiresAt;
  if (!expiresAt) {
    const legacyExpiry = await getGithubFile(code, env, "Expiry");
    if (legacyExpiry.kind === "error")
      return new Response("GitHub lookup failed", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    if (legacyExpiry.kind === "found") expiresAt = legacyExpiry.raw;
  }
  if (expiresAt) {
    const expiryTime = Date.parse(expiresAt);
    if (!Number.isFinite(expiryTime) || Date.now() >= expiryTime)
      return notFound(request, env);
  }
  return Response.redirect(result.url, 302);
}

async function getGithubFile(code, env, directory = "List") {
  if (!hasRepository(env)) return { kind: "error" };
  const fileName = fileNameForCode(code);
  const filePath = `${directory}/${fileName}`
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const endpoint = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${filePath}${env.GITHUB_BRANCH ? `?ref=${encodeURIComponent(env.GITHUB_BRANCH)}` : ""}`;
  try {
    const response = await fetch(endpoint, {
      headers: githubHeaders(env.GITHUB_TOKEN),
    });
    if (response.status === 404) return { kind: "missing" };
    if (!response.ok) return { kind: "error" };
    const file = await response.json();
    if (
      file.type !== "file" ||
      typeof file.content !== "string" ||
      file.encoding !== "base64"
    )
      return { kind: "error" };
    const bytes = Uint8Array.from(
      atob(file.content.replace(/\s/g, "")),
      (char) => char.charCodeAt(0),
    );
    const raw = new TextDecoder().decode(bytes).trim();
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      record = null;
    }
    if (
      record &&
      typeof record === "object" &&
      typeof record.url === "string"
    ) {
      return {
        kind: "found",
        raw,
        url: record.url,
        code: typeof record.code === "string" ? record.code : code,
        ip: typeof record.ip === "string" ? record.ip : "",
        uploadedAt:
          typeof record.uploadedAt === "string" ? record.uploadedAt : "",
        expiresAt: typeof record.expiresAt === "string" ? record.expiresAt : "",
      };
    }
    return {
      kind: "found",
      raw,
      url: raw,
      code,
      ip: "",
      uploadedAt: "",
      expiresAt: "",
    };
  } catch {
    return { kind: "error" };
  }
}

function validCode(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const normalized = value.normalize("NFC");
  const codePoints = Array.from(normalized).length;
  return (
    codePoints <= MAX_CODE_POINTS &&
    new TextEncoder().encode(normalized).length <= MAX_CODE_BYTES
  );
}

function fileNameForCode(code) {
  if (isSafeFileName(code)) return code;
  return `~${base64UrlEncode(code)}`;
}

function isSafeFileName(code) {
  return (
    code !== "." &&
    code !== ".." &&
    !code.startsWith("~") &&
    !/[<>:"/\\|?*\u0000-\u001f\u007f]/u.test(code) &&
    !/[. ]$/u.test(code) &&
    !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(code)
  );
}

function routeSegmentForCode(code) {
  if (code === "." || code === ".." || code.startsWith("~_"))
    return `~_${base64UrlEncode(code)}`;
  return encodeURIComponent(code);
}

function decodeRouteCode(segment) {
  if (segment.startsWith("~_"))
    return base64UrlDecode(segment.slice(2)).normalize("NFC");
  return decodeURIComponent(segment).normalize("NFC");
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function randomCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function hasRepository(env) {
  return Boolean(
    env.GITHUB_OWNER &&
      env.GITHUB_REPO &&
      env.GITHUB_OWNER !== "YOUR_GITHUB_USERNAME" &&
      env.GITHUB_REPO !== "YOUR_REPOSITORY",
  );
}

function repositoryUrl(env) {
  return `https://github.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}`;
}

function githubHeaders(token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "cloudflare-github-shortlink",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function validTarget(value) {
  if (typeof value !== "string" || value.length > 300) return false;
  try {
    const target = new URL(value);
    return (
      (target.protocol === "http:" || target.protocol === "https:") &&
      !target.username &&
      !target.password
    );
  } catch {
    return false;
  }
}

function validFutureTimestamp(value) {
  try {
    return (
      new Date(value).toISOString() === value && Date.parse(value) > Date.now()
    );
  } catch {
    return false;
  }
}

function constantTimeEqual(left, right) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1)
    difference |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  return difference === 0;
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function localized(request, chinese, english) {
  const language = request.headers.get("Accept-Language") || "";
  return /^en(?:-|,|$)/i.test(language.trim()) ? english : chinese;
}

async function notFound(request, env) {
  const page = await env.ASSETS.fetch(
    new Request(new URL("/404.html", request.url), { method: request.method }),
  );
  const headers = new Headers(page.headers);
  headers.set("Cache-Control", "no-store");
  return new Response(page.body, {
    status: 404,
    statusText: "Not Found",
    headers,
  });
}
