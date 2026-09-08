# 部署到 GitHub Pages（手机 PWA · 永久链接）

本目录 `deploy_workbench/` 已是一个完整的 PWA（manifest + service worker + iOS 全屏 meta 齐全），
可直接"添加到主屏幕"当 APP 用，且数据实时（SW 对 `/api/` 不缓存）。

唯一缺的是"永久稳定的链接"——CloudStudio 沙箱会被回收，GitHub Pages 免费、永久、自带域名。

## 为什么用 `<用户名>.github.io` 作为仓库名（重要）
前端所有数据请求都写的是绝对路径 `/api/reports/...`。
若仓库名为 `<用户名>.github.io`（用户页），站点根路径就是 `/`，绝对路径原样可用，**无需改任何 JS**。
若用普通仓库（如 `m2560-workbench`），URL 会变成 `/m2560-workbench/api/...`，前端会 404，需改代码，不推荐。

## 步骤（一次性）
1. 登录 GitHub，新建仓库，仓库名必须 exactly 为：`<你的GitHub用户名>.github.io`
   （例如用户名是 `zhaonn`，仓库名就是 `zhaonn.github.io`）。
   选 Public（GitHub Pages 免费版需公开），不要勾 Initialize with README。

2. 在本机 `deploy_workbench/` 目录执行（把 <用户名> 换成你的）：
   ```bash
   cd C:\wbtest\m2560\deploy_workbench
   git init
   git add -A
   git commit -m "initial PWA deploy"
   git branch -M main
   git remote add origin https://github.com/<用户名>/<用户名>.github.io.git
   git push -u origin main
   ```

3. 等 1~2 分钟，打开 `https://<用户名>.github.io/` 即可访问。
   手机 Safari/Chrome 打开 → 分享 → "添加到主屏幕" → 像 APP 全屏使用。

## 每次盘后更新数据（自动化后无需手动）
跑批生成的 `api/reports/*.json` 已写入本目录。更新时只需：
```bash
cd C:\wbtest\m2560\deploy_workbench
git add -A
git commit -m "update $(date +%Y-%m-%d)"
git push
```
手机端下次打开即拉到最新数据（SW 保证 /api/ 实时不缓存）。

## 注意
- GitHub Pages 默认公开，股票名单任何人可看。若需私有，请改用自有域名+COS。
- 若仓库名只能用普通名，需把前端 `assets/js/*.js` 里的 `/api/reports` 改为 `./api/reports`，
  并改 manifest 的 start_url/scope 为 `./`，改动较多，建议直接用用户页方案。
