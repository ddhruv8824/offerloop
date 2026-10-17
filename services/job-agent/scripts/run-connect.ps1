<#
  Runs the Offerloop job agent once, unattended. Task Scheduler starts this (see
  install-schedule.ps1); you can also run it by hand to test.

  1. Starts the agent's Chrome (minimized) if it isn't running, and waits until it answers.
  2. Runs `npm run connect -- --scheduled`, which never waits for a manual Hirist login:
     if you're logged out it stops, and approved jobs stay queued for the next run.
  3. Appends everything to data\logs\connect-YYYY-MM.log.

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-connect.ps1 [-DryRun]
#>
param([switch]$DryRun)

$ErrorActionPreference = "Continue"
# The agent prints UTF-8 (dashes, arrows). Windows PowerShell reads programs' output in the
# old console code page by default, which turns "—" into "ΓÇö"; read it as UTF-8 instead.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$agentDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $agentDir "data\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("connect-{0}.log" -f (Get-Date -Format "yyyy-MM"))

function Write-Log([string]$text) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $text
  Write-Host $line
  Add-Content -Path $log -Value $line -Encoding UTF8
}

# The agent's own Chrome profile, separate from your everyday Chrome.
$profileDir = "C:\hirist-agent-profile"
$debugUrl = "http://127.0.0.1:9222/json/version"

function Test-AgentChrome {
  try {
    Invoke-RestMethod -Uri $debugUrl -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-AgentChrome)) {
  $roots = @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA) | Where-Object { $_ }
  $chrome = $roots |
    ForEach-Object { Join-Path $_ "Google\Chrome\Application\chrome.exe" } |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1
  if (-not $chrome) {
    Write-Log "Google Chrome wasn't found in Program Files or AppData. Install Chrome, or start the agent's Chrome yourself."
    exit 1
  }
  Write-Log "Starting the agent's Chrome ($profileDir)..."
  Start-Process -FilePath $chrome -ArgumentList @(
    "--remote-debugging-port=9222",
    "--user-data-dir=$profileDir",
    "--no-first-run",
    "--start-minimized"
  )
  $deadline = (Get-Date).AddSeconds(45)
  while (-not (Test-AgentChrome) -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 2
  }
  if (-not (Test-AgentChrome)) {
    Write-Log "The agent's Chrome didn't open port 9222. If a window with that profile is already open without it, close it and try again."
    exit 1
  }
}

Push-Location $agentDir
try {
  $npmArgs = @("run", "connect", "--", "--scheduled")
  if ($DryRun) { $npmArgs += "--dry-run" }
  Write-Log ("npm " + ($npmArgs -join " "))
  # Native output goes line by line to the screen and the log.
  & npm.cmd @npmArgs 2>&1 | ForEach-Object {
    $text = "$_"
    Write-Host $text
    Add-Content -Path $log -Value $text -Encoding UTF8
  }
  $code = $LASTEXITCODE
  Write-Log "Finished (exit code $code)."
  exit $code
} finally {
  Pop-Location
}
