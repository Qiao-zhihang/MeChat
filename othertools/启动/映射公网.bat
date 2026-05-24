@echo off
chcp 65001 >nul
title Cloudflare 公网隧道
echo ========================================
echo    Cloudflare 隧道启动中...
echo    映射 localhost:3000 -> 公网
echo ========================================
"%~dp0..\cloudflared.exe" tunnel --url http://localhost:3000
pause
