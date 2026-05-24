@echo off
chcp 65001 >nul
title MeChat 服务端
echo ========================================
echo        MeChat 服务器启动中...
echo ========================================
cd /d "%~dp0"
node server/index.js
pause
