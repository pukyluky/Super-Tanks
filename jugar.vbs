Option Explicit

Dim fso, wsh, appDir, noBrowser, printBrowser, i, appExe
Set fso = CreateObject("Scripting.FileSystemObject")
Set wsh = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
wsh.CurrentDirectory = appDir

noBrowser = False
printBrowser = False
For i = 0 To WScript.Arguments.Count - 1
  If LCase(WScript.Arguments(i)) = "/nobrowser" Then noBrowser = True
  If LCase(WScript.Arguments(i)) = "/printbrowser" Then printBrowser = True
Next

Function IsServerReady()
  On Error Resume Next
  Dim req
  Set req = CreateObject("WinHttp.WinHttpRequest.5.1")
  req.SetTimeouts 200, 200, 200, 200
  req.Open "GET", "http://127.0.0.1:3000/index.html", False
  req.Send
  IsServerReady = (Err.Number = 0 And req.Status = 200)
  Err.Clear
  On Error GoTo 0
End Function

Function CleanExePath(rawPath)
  Dim s
  s = Trim(rawPath)
  If Left(s, 1) = """" And Right(s, 1) = """" And Len(s) >= 2 Then
    s = Mid(s, 2, Len(s) - 2)
  End If
  CleanExePath = s
End Function

Function ReadRegSafe(regPath)
  On Error Resume Next
  ReadRegSafe = wsh.RegRead(regPath)
  If Err.Number <> 0 Then
    ReadRegSafe = ""
    Err.Clear
  End If
  On Error GoTo 0
End Function

Function FindAppBrowser()
  Dim pf, pf86, la, candidates, exeNames, idx, p, regVal
  pf = wsh.ExpandEnvironmentStrings("%ProgramFiles%")
  pf86 = wsh.ExpandEnvironmentStrings("%ProgramFiles(x86)%")
  la = wsh.ExpandEnvironmentStrings("%LocalAppData%")

  candidates = Array( _
    pf86 & "\Microsoft\Edge\Application\msedge.exe", _
    pf & "\Microsoft\Edge\Application\msedge.exe", _
    pf & "\Google\Chrome\Application\chrome.exe", _
    pf86 & "\Google\Chrome\Application\chrome.exe", _
    la & "\Google\Chrome\Application\chrome.exe", _
    pf & "\BraveSoftware\Brave-Browser\Application\brave.exe", _
    pf86 & "\BraveSoftware\Brave-Browser\Application\brave.exe", _
    la & "\BraveSoftware\Brave-Browser\Application\brave.exe" _
  )

  For idx = 0 To UBound(candidates)
    p = candidates(idx)
    If fso.FileExists(p) Then
      FindAppBrowser = p
      Exit Function
    End If
  Next

  exeNames = Array("msedge.exe", "chrome.exe", "brave.exe", "opera.exe")
  For idx = 0 To UBound(exeNames)
    regVal = CleanExePath(ReadRegSafe("HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" & exeNames(idx) & "\"))
    If regVal <> "" And fso.FileExists(regVal) Then
      FindAppBrowser = regVal
      Exit Function
    End If
    regVal = CleanExePath(ReadRegSafe("HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" & exeNames(idx) & "\"))
    If regVal <> "" And fso.FileExists(regVal) Then
      FindAppBrowser = regVal
      Exit Function
    End If
  Next

  FindAppBrowser = ""
End Function

appExe = FindAppBrowser()
If printBrowser Then
  WScript.Echo appExe
  WScript.Quit 0
End If

If Not IsServerReady() Then
  On Error Resume Next
  wsh.Run "node server.js", 0, False
  If Err.Number <> 0 Then
    MsgBox "No se pudo iniciar Node.js. Comprueba que Node.js esta instalado en el sistema.", vbCritical, "Tanques Tacticos 2D"
    WScript.Quit 1
  End If
  On Error GoTo 0

  For i = 1 To 40
    If IsServerReady() Then Exit For
    WScript.Sleep 100
  Next
End If

If Not noBrowser Then
  If appExe <> "" Then
    wsh.Run """" & appExe & """ --app=http://localhost:3000 --new-window --window-size=1320,860", 1, False
  Else
    wsh.Run "http://localhost:3000", 1, False
  End If
End If
