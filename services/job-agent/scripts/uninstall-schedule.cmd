@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-schedule.ps1" %*
pause
