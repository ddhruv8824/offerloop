<#
  Sets up Windows Task Scheduler to run the Offerloop job agent by itself.

  Default: every day at 10:00, then every 2 hours until 20:00 — so jobs you approve during
  the day are applied within a couple of hours. Only while you're logged in to Windows
  (the agent uses a Chrome window on your desktop); a run missed while the PC was asleep
  happens as soon as it wakes. Running it again replaces the old schedule.

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-schedule.ps1
  powershell ... -File scripts\install-schedule.ps1 -Start 09:30 -EveryHours 3 -Until 21:00
  powershell ... -File scripts\install-schedule.ps1 -EveryHours 0      (once a day only)
#>
param(
  [string]$Start = "10:00",
  [int]$EveryHours = 2,
  [string]$Until = "20:00",
  [string]$TaskName = "Offerloop Hirist agent"
)

$ErrorActionPreference = "Stop"
$agentDir = Split-Path -Parent $PSScriptRoot
$runner = Join-Path $PSScriptRoot "run-connect.ps1"
$culture = [System.Globalization.CultureInfo]::InvariantCulture

try {
  $startAt = [datetime]::ParseExact($Start, "HH:mm", $culture)
  $endAt = [datetime]::ParseExact($Until, "HH:mm", $culture)
} catch {
  Write-Host "Use 24-hour times like -Start 10:00 -Until 20:00." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path (Join-Path $agentDir ".env"))) {
  Write-Host "No .env in $agentDir yet. Add OFFERLOOP_URL and OFFERLOOP_AGENT_KEY first (see docs\offerloop-agent.md)." -ForegroundColor Yellow
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Minimized -File `"$runner`"" `
  -WorkingDirectory $agentDir

$trigger = New-ScheduledTaskTrigger -Daily -At $startAt
if ($EveryHours -gt 0) {
  if ($endAt -le $startAt) {
    Write-Host "-Until must be later than -Start." -ForegroundColor Red
    exit 1
  }
  # A daily trigger can't repeat on its own; borrow the repetition pattern from a one-time trigger.
  $repeat = New-ScheduledTaskTrigger -Once -At $startAt `
    -RepetitionInterval (New-TimeSpan -Hours $EveryHours) `
    -RepetitionDuration ($endAt - $startAt)
  $trigger.Repetition = $repeat.Repetition
}

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -MultipleInstances IgnoreNew

# Runs as you, only while you're logged in — no password is stored.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description "Applies to the Hirist jobs you approved on Offerloop (services\job-agent). Logs: $agentDir\data\logs" `
    -Force | Out-Null
} catch {
  Write-Host "Couldn't create the task: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "If it says access is denied, open PowerShell with 'Run as administrator' and run this again."
  exit 1
}

$when = if ($EveryHours -gt 0) { "every day at $Start, then every $EveryHours h until $Until" } else { "every day at $Start" }
Write-Host ""
Write-Host "Scheduled '$TaskName': $when." -ForegroundColor Green
Write-Host "Test it now:   Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Logs:          $agentDir\data\logs"
Write-Host "Remove it:     scripts\uninstall-schedule.ps1"
