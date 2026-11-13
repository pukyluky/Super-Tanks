Option Explicit

Dim fso, wsh, appDir, noBrowser, i
Set fso = CreateObject("Scripting.FileSystemObject")
Set wsh = CreateObject("WScript.Shell")

appDir = fso.GetParentFolderName(WScript.ScriptFullName)
wsh.CurrentDirectory = appDir

noBrowser = False
For i = 0 To WScript.Arguments.Count - 1
  If LCase(WScript.Arguments(i)) = "/nobrowser" Then noBrowser = True
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
  wsh.Run "http://localhost:3000", 1, False
End If
