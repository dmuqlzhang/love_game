@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js，请安装 Node.js 22 后重新启动。
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 exit /b 1
)
call npm run setup
if errorlevel 1 exit /b 1
echo 请在浏览器打开下面显示的本地地址。结束时按 Ctrl+C。
call npm run dev
