@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .logs mkdir .logs

set PORT=5501
:findport
netstat -ano | findstr ":%PORT% " | findstr LISTENING >nul
if %errorlevel%==0 (
  set /a PORT+=1
  goto findport
)

echo [HSF] 静态服务端口 %PORT%
start "HSF-frontend" /b python -m http.server %PORT% --bind 127.0.0.1 > .logs\frontend.log 2>&1
timeout /t 1 >nul
start "" "http://127.0.0.1:%PORT%/index.html"
echo 已打开 http://127.0.0.1:%PORT%/index.html
echo 关闭本窗口后请手动结束 python 进程
pause
