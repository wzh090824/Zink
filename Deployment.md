# 部署与维护指南

本文从空仓库开始说明 GitHub 和 Cloudflare 配置。当前项目使用 Cloudflare Workers Static Assets，无需单独构建前端，也不依赖数据库。

## 1. 前置要求

- 一个 GitHub 账号，以及一个可启用 GitHub Actions 的仓库。
- 一个 Cloudflare 账号。
- Node.js 20 或更新版本，npm，以及 Git。
- 仓库的 GitHub Actions 设置允许运行工作流。

## 2. 创建 GitHub 仓库并推送

1. 在 GitHub 创建仓库。若使用公开仓库，请先确认第 8 节所述 IP 记录会公开可见。
2. 首次推送时设置远程地址和分支。将 URL 换成自己的仓库地址：

   ```sh
   git remote add origin https://github.com/wzh090824/cloudflare-github-shortlink.git
   git branch -M main
   git add .gitignore README.md Deployment.md wrangler.toml Src Public Tests .github/workflows/Create-Short-Link.yml
   git commit -m "Build Cloudflare GitHub short link service"
   git push -u origin main
   ```

   GitHub Actions 工作流目录 `.github/workflows/` 必须保持小写，这是 GitHub 的约定。第一次 Action 成功后，仓库根目录会自动出现 `List/` 和第一条映射文件。

3. 确认 GitHub 仓库的默认分支为 `main`。若使用其他分支，后续也要同步修改 `wrangler.toml` 的 `GITHUB_BRANCH`。

## 3. 创建 GitHub Fine-grained token

1. 在 GitHub 进入 **Settings → Developer settings → Personal access tokens → Fine-grained tokens**。
2. 创建新 token，Repository access 选择 **Only select repositories**，只选短链仓库。
3. Repository permissions 设置：
   - **Contents: Read and write**：Worker 查询映射、Action 写入文件。
   - **Actions: Read-only**：Worker 读取本次 Action 的实时状态。
   - **Metadata: Read-only**：GitHub API 要求的仓库元数据权限。
4. 创建后复制 token。它只用于下一节保存到 Cloudflare Secret，不要写入源代码、`wrangler.toml`、README 或 GitHub Actions 文件。

Fine-grained token 的有效期应按自己的凭据轮换策略设置。Token 到期后，短链查询、创建和 Action 状态读取都会受到影响。

## 4. 配置 Cloudflare Worker

在项目根目录编辑 `wrangler.toml`：

```toml
name = "github-shortlink"
main = "Src/Worker.js"
compatibility_date = "2026-10-30"

[assets]
directory = "./Public"
binding = "ASSETS"

[vars]
GITHUB_OWNER = "wzh090824"
GITHUB_REPO = "cloudflare-github-shortlink"
GITHUB_BRANCH = "main"
```

安装 Wrangler 并登录：

```sh
npm install --save-dev wrangler
npx wrangler login
```

将 GitHub token 和管理员访问密码保存为 Cloudflare Worker Secrets：

```sh
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ADMIN_KEY
```

每条命令都会提示输入 Secret。`ADMIN_KEY` 应使用独立的高强度随机密码；访客可以跳过管理员密码，但必须通过密码验证才能创建自定义短码。不要将真实密码加入仓库。

部署：

```sh
npx wrangler deploy
```

首次部署会输出 `workers.dev` 地址。也可在 Cloudflare Dashboard 的 Worker 域名设置中绑定自己的域名；使用自定义短码时，链接会基于实际访问的域名生成。

## 5. GitHub Actions 配置

文件 [`Create-Short-Link.yml`](.github/workflows/Create-Short-Link.yml) 监听 `repository_dispatch` 事件 `create_short_link`。Worker 发出的 payload 含请求编号、短码、目标网址、可选过期时间、Cloudflare 提供的来源 IP 和目标分支。

工作流会校验短码长度、目标网址和过期时间，确认短码不存在后，通过 Git Data API 在一个 commit 中创建 `List/{短码}`。更新分支引用时采用非强制更新，并对并发提交进行重试；短码已被其他请求占用时工作流失败且不覆盖已有文件。

每个 Action 的运行名称包含唯一请求编号。工作台据此查询 GitHub Actions Runs API，每 2 秒更新等待、排队、执行、成功或失败状态，并可打开本次运行日志。

## 6. 首次验证

1. 打开 Worker 地址，应显示创建表单和访问模式对话框。
2. 选择跳过后提交目标网址。工作台应返回随机短码并开始同步 Action 状态。
3. Action 成功后，在仓库 `List/` 中检查新文件，确认 JSON 内包含 `code`、`url`、`ip`、`uploadedAt`、`expiresAt`。
4. 打开返回的短链，应跳转至目标网址。不存在或已过期的短码应返回自定义 404 页面。
5. 重新加载页面，输入 `ADMIN_KEY` 进入管理员模式，再用中文或含标点的短码创建另一条链接。
6. 可通过语言菜单选择简体中文或英语；语言偏好会保存在浏览器，并应用到 404 页面和 Worker API 消息。太阳/月亮按钮切换亮暗主题。
7. 创建请求受理后会打开构建弹窗，圆环倒计时 60 秒；若 Action 仍在运行，页面继续同步，最长等待 5 分钟。成功时数字会动画变为绿色勾号。

## 7. 本地开发

创建本地文件 `.dev.vars`（该文件已加入 `.gitignore`）：

```dotenv
GITHUB_OWNER=你的 GitHub 用户名或组织名
GITHUB_REPO=cloudflare-github-shortlink
GITHUB_BRANCH=main
GITHUB_TOKEN=你的 Fine-grained token
ADMIN_KEY=你的管理员访问密码
```

启动本地 Worker：

```sh
npx wrangler dev
```

打开 Wrangler 输出的本地地址。调用 GitHub 时，本地请求没有 `CF-Connecting-IP`，因此记录中的 IP 可能为空；线上 Cloudflare 请求会填入该头。

## 8. IP 与公开仓库

Action 将创建请求中的来源 IP 写入 `List/{短码}`。线上 IP 取自 Cloudflare 的 `CF-Connecting-IP`，而不是访客可自行设置的普通 `X-Forwarded-For`。Action 同时写入 UTC 格式的 `uploadedAt` 时间。

如果目标仓库是公开仓库，映射 JSON、来源 IP、目标网址、上传时间和 Git 提交历史均对公众可见。改为私有仓库不会清除已公开过的 Git 历史。部署者应提前告知访客并确认相应隐私要求；如需避免公开 IP，应使用私有仓库。

访客模式允许任何人触发 GitHub Action。若公开提供服务，可在 Cloudflare 为创建 API 路由 `/__api/links` 配置速率限制规则，并监控 GitHub Actions 使用量。

## 9. 故障排查

| 现象                        | 检查项                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 页面显示“等待部署配置”      | 检查 `GITHUB_OWNER`、`GITHUB_REPO`、`GITHUB_BRANCH` 和 `GITHUB_TOKEN` Secret。                              |
| 管理员密码无法验证          | 用 `npx wrangler secret put ADMIN_KEY` 更新 Secret，再重新部署或等待 Secret 生效。                          |
| 创建返回 GitHub 配置错误    | 检查仓库拼写、分支名、Token 有效期与 `Contents: Read and write` 权限。                                      |
| Action 无法启动或状态不可见 | 检查 GitHub Actions 是否启用，以及 token 的 `Actions: Read-only` 权限。                                     |
| Action 因短码重复失败       | 该短码已经存在；选择另一个短码，不要直接覆盖映射文件。                                                      |
| 短链显示 404                | 确认 Action 成功，检查 `List/` 文件名和 JSON 的 `url` 字段；如果设了过期时间，确认还未到期。                |
| 部署后静态资源 404          | 确认 `wrangler.toml` 使用大小写敏感路径 `./Public`，且 HTML 引用 `/Assets/App.js` 和 `/Assets/Styles.css`。 |

## 10. 文件命名约定

项目自有源代码目录和文件使用首字母大写，例如 `Src/Worker.js`、`Public/Assets/App.js`、`Public/Assets/Styles.css`。Cloudflare 的首页 `index.html`、自定义错误页 `404.html`、Wrangler 的默认配置 `wrangler.toml`、GitHub Actions 的 `.github/workflows/` 路径以及 GitHub 识别的 `README.md` 保持各自平台约定的拼写。
