<#
  Sets up Windows Task Scheduler to run the Offerloop job agent by itself, in the background.

  Default: 2 minutes after you log in to Windows, then every 15 minutes for as long as you're
  logged in. Each check takes a few seconds when nothing is approved; when something is, the
  agent opens its own Chrome (minimized) and applies. No window pops up: it runs hidden.
  A check missed while the PC slept happens when it wakes. Running this again replaces the
  old schedule.

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-schedule.ps1
  powershell ... -File scripts\install-schedule.ps1 -EveryMinutes 30
#>
param(
  [ValidateRange(5, 1440)]
  [int]$EveryMinutes = 15,
  [string]$TaskName = "Offerloop Hirist agent"
)

$ErrorActionPreference = "Stop"
$agentDir = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot "run-connect.ps1"
$hidden = Join-Path $PSScriptRoot "run-hidden.vbs"
$user = "$env:USERDOMAIN\$env:USERNAME"

if (-not (Test-Path (Join-Path $agentDir ".env"))) {
  Write-Host "No .env in $agentDir yet. Add OFFERLOOP_URL and OFFERLOOP_AGENT_KEY first (see docs\offerloop-agent.md)." -ForegroundColor Yellow
}

# Hidden: wscript runs the .vbs, which starts PowerShell with no window. On a Windows without
# VBScript, fall back to a headless console (also no window).
if (Test-Path (Join-Path $env:windir "System32\vbscript.dll")) {
  $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$hidden`"" -WorkingDirectory $agentDir
} else {
  $action = New-ScheduledTaskAction -Execute "conhost.exe" `
    -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runner`"" `
    -WorkingDirectory $agentDir
}

# When you log in (after 2 minutes, so Windows and the network settle), then every N minutes
# with no end. A logon trigger can't repeat on its own; borrow the pattern from a one-time one.
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$trigger.Delay = "PT2M"
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$trigger.Repetition = $repeat.Repetition
$trigger.Repetition.Duration = "" # empty = repeat indefinitely

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew

# Runs as you, only while you're logged in — no password is stored.
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Applies to the Hirist jobs you approved on Offerloop (services\job-agent), in the background. Logs: $agentDir\data\logs" `
    -Force | Out-Null
} catch {
  Write-Host "Couldn't create the task: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "If it says access is denied, open PowerShell with 'Run as administrator' and run this again."
  exit 1
}

# Start now too, so there's no need to log out and back in.
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Done. '$TaskName' runs in the background: when you log in to Windows, then every $EveryMinutes minutes." -ForegroundColor Green
Write-Host "It just did its first check. Approve Hirist jobs on Offerloop and they're applied within $EveryMinutes minutes."
Write-Host "Logs:       $agentDir\data\logs"
Write-Host "Remove it:  scripts\uninstall-schedule.cmd"
