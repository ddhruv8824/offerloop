@echo off
rem Double-click to schedule the Offerloop job agent (see docs\offerloop-agent.md).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-schedule.ps1" %*
pause
