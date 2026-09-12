Option Explicit

Dim shell, fso, batPath, command
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

batPath = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "Smart Finder.bat")
command = "cmd.exe /d /c " & Chr(34) & Chr(34) & batPath & Chr(34) & " --hidden" & Chr(34)
shell.Run command, 0, False
