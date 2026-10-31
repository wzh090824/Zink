# Zink 部署与维护指南

本文以 Fork Zink 项目作为常用部署流程，说明如何配置 GitHub 和 Cloudflare。项目使用 Cloudflare Workers Static Assets，无需单独构建前端，也不依赖数据库。

## 1. 前置要求

- 一个 GitHub 账号，以及一个可启用 GitHub Actions 的仓库。
- 一个 Cloudflare 账号。
- Node.js 20 或更新版本、npm 和 Git 仅在本地开发或使用 Wrangler 命令行部署时需要；Fork 加 Cloudflare 网页仪表盘部署不要求安装这些工具。
- 仓库的 GitHub Actions 设置允许运行工作流。

## 2. Fork Zink

打开 [Zink 仓库](https://github.com/wzh090824/Zink)，点击 **Fork → Create a new fork**，将仓库 Fork 到自己的 GitHub 账号。保留默认仓库名 `Zink` 和分支 `main` 即可。Worker 会把短链写进你的 Fork，因此后续 Cloudflare 设置要指向这个 Fork，而不是上游仓库。若 Fork 是公开的，请先确认第 9 节所述 IP 记录和目标网址会公开可见。

GitHub 通常会暂停 Fork 中的 Actions。若仓库 **Actions** 页面显示工作流未启用，点击启用即可；第一次运行时若 GitHub 要求审核工作流，也在该页面批准。

## 3. 创建 GitHub Fine-grained token

1. 在 GitHub 进入 **Settings → Developer settings → Personal access tokens → Fine-grained tokens**。
2. 创建新 token，Repository access 选择 **Only select repositories**，只选你刚 Fork 的 `Zink` 仓库，不要选择上游 `wzh090824/Zink`。
3. Repository permissions 设置：
   - **Contents: Read and write**：Worker 查询映射、Action 写入文件。
   - **Actions: Read-only**：Worker 读取本次 Action 的实时状态。
   - **Metadata: Read-only**：GitHub API 要求的仓库元数据权限。
4. 创建后复制 token。它只用于下一节保存到 Cloudflare Secret，不要写入源代码、`wrangler.toml`、README 或 GitHub Actions 文件。

Fine-grained token 的有效期应按自己的凭据轮换策略设置。Token 到期后，短链查询、创建和 Action 状态读取都会受到影响。

## 4. Cloudflare 网页部署

1. 完成 Fork 和 Token 创建后，打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages → Create application → Workers → Connect to Git**，授权 Cloudflare 并选择自己的 `Zink` Fork 和 `main` 分支。
2. 构建设置使用仓库根目录；**Build command** 留空，**Deploy command** 用默认的 `npx wrangler deploy`。不要选 Pages。点击部署，Cloudflare 会按仓库的 `wrangler.toml` 发布 Worker 和 `Public/` 页面。
3. 在 Worker 的 **Settings → Variables and Secrets** 添加以下 **Production** 配置，然后点击 **Save and deploy**：

   | 类型     | 名称            | 值                         |
   | -------- | --------------- | -------------------------- |
   | Variable | `GITHUB_OWNER`  | 你的 GitHub 用户名         |
   | Variable | `GITHUB_REPO`   | `Zink`                     |
   | Variable | `GITHUB_BRANCH` | `main`                     |
   | Secret   | `GITHUB_TOKEN`  | 上一节创建的 Fine-grained token |
   | Secret   | `ADMIN_KEY`     | 管理员访问密码（可选）     |

   `GITHUB_OWNER` 是 Worker 定位你 Fork 所必需的设置，只需在仪表盘填一次，无需改源码。`wrangler.toml` 的 `keep_vars = true` 会保留这些变量。
4. 在 **Settings → Build → Build watch paths** 将 **Include paths** 设为 `*`、**Exclude paths** 设为 `List/*`，避免每次创建短链时都重新部署。然后在 **Settings → Domains & Routes** 启用 `workers.dev` 或添加自己的域名。
5. 打开 Worker 地址，确认服务已连接并创建一条测试短链。后续推送源码到 `main` 会自动重新部署；Action 只更新 `List/` 时会被路径过滤忽略。

完整配置说明见 [Workers Builds 文档](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/) 和 [Build watch paths 文档](https://developers.cloudflare.com/workers/ci-cd/builds/build-watch-paths/)。

## 5. Wrangler 命令行部署（可选）

网页部署不需要本机工具。若要在本地使用 Wrangler，安装并登录后部署：

```sh
npm install --save-dev wrangler
npx wrangler login
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_KEY
npx wrangler deploy
```

`GITHUB_OWNER`、`GITHUB_REPO` 和 `GITHUB_BRANCH` 仍在 Cloudflare 的 **Settings → Variables and Secrets** 设置，`keep_vars = true` 会在 Wrangler 发布时保留它们。`ADMIN_KEY` 可选；不设置时访客模式仍可创建随机短码。真实密码不要提交到仓库。

## 6. GitHub Actions 配置

文件 [`Create-Short-Link.yml`](.github/workflows/Create-Short-Link.yml) 监听 `repository_dispatch` 事件 `create_short_link`。Worker 发出的 payload 含请求编号、短码、目标网址、可选过期时间、Cloudflare 提供的来源 IP 和目标分支。

工作流会校验短码长度、目标网址和过期时间，确认短码不存在后，通过 Git Data API 在一个 commit 中创建 `List/{短码}`。更新分支引用时采用非强制更新，并对并发提交进行重试；短码已被其他请求占用时工作流失败且不覆盖已有文件。

每个 Action 的运行名称包含唯一请求编号。工作台据此查询 GitHub Actions Runs API，每 0.5 秒更新等待、排队、执行、成功或失败状态，直到 Action 结束。

## 7. 首次验证

1. 打开 Worker 地址，应显示创建表单和访问模式对话框。
2. 选择跳过后提交目标网址。工作台应返回随机短码并开始同步 Action 状态。
3. Action 成功后，在仓库 `List/` 中检查新文件，确认 JSON 内包含 `code`、`url`、`ip`、`uploadedAt`、`expiresAt`。
4. 打开返回的短链，应跳转至目标网址。不存在或已过期的短码应返回自定义 404 页面。
5. 重新加载页面，输入 `ADMIN_KEY` 进入管理员模式，再用中文或含标点的短码创建另一条链接。
6. 可通过语言菜单选择简体中文或英语；语言偏好会保存在浏览器，并应用到 404 页面和 Worker API 消息。太阳/月亮按钮切换亮暗主题。
7. 创建请求受理后会打开构建弹窗，圆环倒计时 60 秒；若 Action 仍在运行，页面会持续同步。成功时数字会动画变为绿色勾号。

## 8. 本地开发

创建本地文件 `.dev.vars`（该文件已加入 `.gitignore`）：

```dotenv
GITHUB_OWNER=你的 GitHub 用户名或组织名
GITHUB_REPO=Zink
GITHUB_BRANCH=main
GITHUB_TOKEN=你的 Fine-grained token
ADMIN_KEY=你的管理员访问密码
```

启动本地 Worker：

```sh
npx wrangler dev
```

打开 Wrangler 输出的本地地址。调用 GitHub 时，本地请求没有 `CF-Connecting-IP`，因此记录中的 IP 可能为空；线上 Cloudflare 请求会填入该头。

## 9. IP 与公开仓库

Action 将创建请求中的来源 IP 写入 `List/{短码}`。线上 IP 取自 Cloudflare 的 `CF-Connecting-IP`，而不是访客可自行设置的普通 `X-Forwarded-For`。Action 同时写入 UTC 格式的 `uploadedAt` 时间。

如果目标仓库是公开仓库，映射 JSON、来源 IP、目标网址、上传时间和 Git 提交历史均对公众可见。改为私有仓库不会清除已公开过的 Git 历史。部署者应提前告知访客并确认相应隐私要求；如需避免公开 IP，应使用私有仓库。

访客模式允许任何人触发 GitHub Action。若公开提供服务，可在 Cloudflare 为创建 API 路由 `/__api/links` 配置速率限制规则，并监控 GitHub Actions 使用量。

## 10. 故障排查

| 现象                        | 检查项                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 页面显示“等待部署配置”      | 检查 `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH` 和 `GITHUB_TOKEN` Secret。                              |
| 管理员密码无法验证          | 用 `npx wrangler secret put ADMIN_KEY` 更新 Secret，再重新部署或等待 Secret 生效。                          |
| 创建返回 GitHub 配置错误    | 检查仓库拼写、分支名、Token 有效期与 `Contents: Read and write` 权限。                                      |
| Action 无法启动或状态不可见 | 检查 GitHub Actions 是否启用，以及 token 的 `Actions: Read-only` 权限。                                     |
| Action 因短码重复失败       | 该短码已经存在；选择另一个短码，不要直接覆盖映射文件。                                                      |
| 短链显示 404                | 确认 Action 成功，检查 `List/` 文件名和 JSON 的 `url` 字段；如果设了过期时间，确认还未到期。                |
| 部署后静态资源 404          | 确认 `wrangler.toml` 使用大小写敏感路径 `./Public`，且 HTML 引用 `/Assets/App.js` 和 `/Assets/Styles.css`。 |
| 创建短链后触发 Worker 部署  | 检查 Workers Builds 的 **Build watch paths** 是否把 `List/*` 加入 **Exclude paths**。                         |
| 仪表盘部署后显示未配置      | 检查 Secret 是否加在 Worker 的 **Production** 环境，而非只加在 Build environment；保存后重新部署。            |

## 11. 文件命名约定

项目自有源代码目录和文件使用首字母大写，例如 `Src/Worker.js`、`Public/Assets/App.js`、`Public/Assets/Styles.css`。Cloudflare 的首页 `index.html`、自定义错误页 `404.html`、Wrangler 的默认配置 `wrangler.toml`、GitHub Actions 的 `.github/workflows/` 路径以及 GitHub 识别的 `README.md` 保持各自平台约定的拼写。
