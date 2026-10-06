# [추가: 30분 자동 동기화 등록] 업무 API 코드는 변경하지 않는다.
# 현재 Windows 사용자의 로그인 세션에서 실행하며 비밀번호를 저장하지 않는다.
$ErrorActionPreference = 'Stop'
$syncRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$syncTaskName = 'ATMS-Hindsight-Docs-Sync'
$syncPython = (Get-Command python -ErrorAction Stop).Source
$syncPythonWindowless = Join-Path (Split-Path $syncPython) 'pythonw.exe'
if (-not (Test-Path -LiteralPath $syncPythonWindowless)) {
    throw 'pythonw.exe is required to run without a console window'
}
$syncRunner = Join-Path $PSScriptRoot 'run-hindsight-sync.py'
$syncExisting = Get-ScheduledTask -TaskName $syncTaskName -ErrorAction SilentlyContinue
if ($syncExisting -and $syncExisting.Actions.Arguments -ne ('"' + $syncRunner + '"')) {
    throw 'An unrelated task uses this name; it was not changed'
}
# 시작은 등록 30분 뒤이며 종료일 없이 30분 간격으로 반복한다.
$syncTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(30) -RepetitionInterval (New-TimeSpan -Minutes 30)
$syncAction = New-ScheduledTaskAction -Execute $syncPythonWindowless -Argument ('"' + $syncRunner + '"') -WorkingDirectory $syncRoot
$syncSettings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 25)
$syncUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$syncPrincipal = New-ScheduledTaskPrincipal -UserId $syncUser -LogonType Interactive -RunLevel Limited
# IgnoreNew는 이전 예약 실행이 진행 중이면 추가 실행을 건너뛴다.
# 실행기 내부 파일 잠금은 수동 실행과의 중복도 방지한다.
Register-ScheduledTask -TaskName $syncTaskName -Action $syncAction -Trigger $syncTrigger -Settings $syncSettings -Principal $syncPrincipal -Description 'ATMS project documents to local Hindsight every 30 minutes' -Force | Select-Object TaskName, State
