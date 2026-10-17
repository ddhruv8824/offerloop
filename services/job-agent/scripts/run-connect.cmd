@echo off
setlocal
cd /d "%~dp0.."
call npm run connect
exit /b %errorlevel%
