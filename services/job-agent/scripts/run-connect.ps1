<#
  Runs the Offerloop job agent once, unattended. Task Scheduler starts this, hidden, through
  run-hidden.vbs (see install-schedule.ps1); you can also run it by hand to test.

  1. Runs `npm run connect -- --scheduled`: asks Offerloop what's approved. Nothing waiting?
     It exits in a few seconds. Otherwise it opens the agent's Chrome (minimized) if needed
     and applies. It never waits for a manual Hirist login: if you're logged out it stops,
     tells Offerloop (the Automations page shows it), and the jobs stay queued.
  2. Appends everything to data\logs\connect-YYYY-MM.log.

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
