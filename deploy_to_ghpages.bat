@echo off
REM 一键部署 deploy_workbench 到 GitHub Pages（用户页方案：<用户名>.github.io）
REM 用法：编辑下面的 GITHUB_USER，双击运行，首次需输入 GitHub 账号+Token
set GITHUB_USER=<你的GitHub用户名>
set REPO_URL=https://github.com/%GITHUB_USER%/%GITHUB_USER%.github.io.git

cd /d "%~dp0"
if not exist ".git" (
  git init
  git branch -M main
  git remote add origin %REPO_URL%
)
git add -A
git commit -m "update %date:~0,4%-%date:~5,2%-%date:~8,2% %time:~0,2%:%time:~3,2%"
git push -u origin main
echo.
echo 部署完成。访问 https://%GITHUB_USER%.github.io/
pause
