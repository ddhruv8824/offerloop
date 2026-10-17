@echo off
rem Double-click to run the Offerloop job agent in the background (see docs\offerloop-agent.md).
rem A task that starts when you log in needs admin rights, so Windows asks once.
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-schedule.ps1" %*
pause
