@echo off
chcp 65001 >nul
title 附近住哪儿 - 周边酒店查询 PWA 服务
cd /d "%~dp0"
echo ========================================================
echo   正在启动「附近住哪儿」周边酒店查询 Web App / PWA ...
echo   电脑可直接访问: http://localhost:5173
echo   手机连同一 Wi-Fi 可访问下方 Network 地址添加到主屏幕！
echo ========================================================
node "%~dp0node_modules\vite\bin\vite.js" --host 0.0.0.0 --port 5173 --strictPort --open
pause
