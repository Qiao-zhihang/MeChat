@echo off
cd /d "%~dp0"
if not exist log mkdir log
:loop
echo [%date:~0,10% %time:~0,8%] ====== MeChat Start ======>> log\mechat.log
node server/index.js >> log\mechat.log 2>&1
timeout /t 3 /nobreak >nul
goto loop