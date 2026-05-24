Option Explicit

Dim shell, fso, scriptPath, password

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptPath = fso.GetParentFolderName(WScript.ScriptFullName)
If Right(scriptPath, 1) <> "\" Then scriptPath = scriptPath & "\"

Do
    password = InputBox( _
        "MeChat Password Hash Tool" & vbCrLf & vbCrLf & _
        "Enter plaintext password to generate SHA-256 hash" & vbCrLf & _
        "Rule: SHA-256('mechat_salt_' + password)" & vbCrLf & vbCrLf & _
        "Click Cancel to exit", _
        "MeChat Hasher", "")

    If password = "" Or IsEmpty(password) Then Exit Do

    Dim tempFile, cmd
    tempFile = scriptPath & "_hash_temp.txt"
    cmd = "cmd /c node """ & scriptPath & "hash_pwd.js"" """ & Replace(password, """", """""") & """ > """ & tempFile & """ 2>&1"

    On Error Resume Next
    shell.Run cmd, 0, True

    If Err.Number <> 0 Then
        MsgBox "Error: " & Err.Description & vbCrLf & vbCrLf & _
               "Make sure Node.js is installed and hash_pwd.js exists", 16, "Error"
        Err.Clear
        On Error GoTo 0
    Else
        On Error GoTo 0
        WScript.Sleep 300

        If fso.FileExists(tempFile) Then
            Dim ts, lines, lineArr, i, hashVal
            Set ts = fso.OpenTextFile(tempFile, 1)
            lines = ts.ReadAll
            ts.Close
            fso.DeleteFile tempFile

            lineArr = Split(lines, vbLf)
            For i = LBound(lineArr) To UBound(lineArr)
                If Left(Trim(lineArr(i)), 5) = "HASH:" Then
                    hashVal = Trim(Mid(Trim(lineArr(i)), 6))
                    Exit For
                End If
            Next

            If hashVal <> "" Then
                shell.Run "cmd /c echo | set /p=" & hashVal & "| clip", 0, True

                MsgBox _
                    "Plaintext: " & password & vbCrLf & vbCrLf & _
                    "Hash: " & hashVal & vbCrLf & vbCrLf & _
                    "(Copied to clipboard)", _
                    64, "Result"

                Dim saveChoice
                saveChoice = MsgBox("Save to file?", 68, "Save")

                If saveChoice = 6 Then
                    Dim savePath, saveTs
                    savePath = scriptPath & "hash_" & Year(Now) & Month(Now) & Day(Now) & Hour(Now) & Minute(Now) & Second(Now) & ".txt"
                    Set saveTs = fso.CreateTextFile(savePath, True)
                    saveTs.WriteLine "Time: " & Now()
                    saveTs.WriteLine "Plaintext: " & password
                    saveTs.WriteLine "Hash: " & hashVal
                    saveTs.Close
                    MsgBox "Saved to:" & vbCrLf & savePath, 64, "Done"
                End If
            Else
                MsgBox "Parse failed:" & vbCrLf & lines, 16, "Error"
            End If
        Else
            MsgBox "Cannot read output", 16, "Error"
        End If
    End If
Loop

Set shell = Nothing
Set fso = Nothing
