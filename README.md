# Zink

Zink 是一个无数据库短链接工具：Cloudflare Worker 负责页面、权限校验、GitHub 查询和跳转；GitHub Actions 负责把映射记录提交回仓库。短链映射文件存放在 `List/`，短码不存在或已过期时显示 `404` 页面。

## 使用方式

首次打开会提示选择访问模式：

- **访客模式**：可以跳过密码。短码由 Worker 随机生成，不能自定义。
- **管理员模式**：输入 Cloudflare Worker Secret `ADMIN_KEY` 后可以自定义短码，支持中文及任意可打印字符，最多 64 个 Unicode 字符、180 个 UTF-8 字节。密码只保存在当前标签页会话中。

提交后，页面每 0.5 秒同步本次 GitHub Action 的排队、运行和完成状态，直到 Action 完成或失败。目标网址最长 300 个字符；可选设置本地时间失效日期。

界面支持简体中文和英语，会优先跟随浏览器语言，也可以通过顶部语言菜单切换；语言选择会保存在当前浏览器。亮色和暗色通过单个太阳/月亮按钮切换，并带有平滑过渡。

创建请求受理后会打开构建弹窗，显示 60 秒倒计时圆环和 Action 状态。倒计时归零后状态仍会持续同步；构建成功时倒计时数字会平滑变为绿色勾号。

Action 将每条短链写成 `List/{短码}` 文件，内容为 JSON：

```json
{
  "code": "我的链接",
  "url": "https://example.com/",
  "ip": "203.0.113.10",
  "uploadedAt": "2026-10-31T04:20:00.000Z",
  "expiresAt": null
}
```

IP 来自 Cloudflare 的 `CF-Connecting-IP` 请求头；上传时间由 GitHub Action 写入。简单短码（字母、数字、`_`、`-`）、中文和兼容 Windows 文件名的标点以短码作为文件名。包含文件名禁用字符、结尾点/空格、Windows 设备名或保留前缀 `~` 的短码会映射成安全的 Base64URL 文件名，原短码仍记录在 JSON 内容中。

## 部署

完整部署、首次推送、GitHub 权限、Cloudflare 配置、验证与故障排查步骤见 [Deployment.md](Deployment.md)。

Cloudflare 网页仪表盘连接 GitHub 并自动部署的详细步骤见 [部署指南第 5 节](Deployment.md#5-通过-cloudflare-网页仪表盘部署workers-builds)。

GitHub 仓库：[wzh090824/Zink](https://github.com/wzh090824/Zink)

快速概览：

1. 在 GitHub 建立仓库并推送项目。
2. 创建仅授予目标仓库 `Contents: Read and write`、`Actions: Read-only`、`Metadata: Read-only` 权限的 Fine-grained token。
3. 在 `wrangler.toml` 设置仓库所有者、仓库名和分支；使用 `wrangler secret put` 保存 `GITHUB_TOKEN` 与管理员访问密码 `ADMIN_KEY`。
4. 运行 `npx wrangler deploy`。

## 项目结构与命名

自有代码目录和文件采用首字母大写：`Src/Worker.js`、`Public/Assets/App.js`、`Public/Assets/Styles.css`、`Tests/Worker.test.mjs`。`List/` 存储 Action 创建的映射文件。`README.md`、`wrangler.toml`、`.gitignore`、Cloudflare 首页 `index.html`、`404.html` 以及 GitHub Actions 保留的 `.github/workflows/` 路径采用工具要求的标准名称。

运行 Worker 回归测试：

```sh
node --test Tests/*.test.mjs
```

## 隐私

短码文件包含创建请求的来源 IP 和 Action 写入时间。GitHub 仓库设为公开时，这些数据和提交历史对所有人可见。若不希望公开 IP，请使用私有仓库并确认 Cloudflare/GitHub 的访问权限符合预期；并按服务适用的隐私告知要求处理访客 IP。
