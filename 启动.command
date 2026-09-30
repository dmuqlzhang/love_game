#!/bin/zsh
cd -- "${0:A:h}" || exit 1
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  print '未找到 Node.js / npm。请安装 Node.js 22，再重新启动。'
  read '?按回车退出…'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm install || exit 1
fi
npm run setup || exit 1
print '请在浏览器打开下面显示的本地地址。结束时按 Ctrl+C。'
npm run dev
