<#
  Removes the Task Scheduler entry made by install-schedule.ps1. Approved jobs stay queued
  on Offerloop; run `npm run connect` by hand whenever you like.

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\uninstall-schedule.ps1
#>
param([string]$TaskName = "Offerloop Hirist agent")

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed '$TaskName'." -ForegroundColor Green
} else {
  Write-Host "There's no task called '$TaskName'."
}
