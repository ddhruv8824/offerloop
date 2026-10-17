' Starts run-connect.ps1 with no window at all, so the scheduled agent stays in the background.
' Task Scheduler runs this (see install-schedule.ps1). Exit code = the agent's exit code.
Dim shell, here, cmd
Set shell = CreateObject("WScript.Shell")
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & here & "\run-connect.ps1"""
WScript.Quit shell.Run(cmd, 0, True)
