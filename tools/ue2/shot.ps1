# powershell tools/ue2/shot.ps1 -Cameras umumiy,balkon -Tag a
# Pictures from the cameras of ObodMaskanUE2's test level -> D:/3d-aps/ObodMaskanUE2/Renders/<camera>_<tag>.png
# The editor is brought to the front only if a picture does not arrive in 20 s (some editors render only then).
param([string[]]$Cameras = @('umumiy', 'hovli', 'yaqin', 'portal', 'balkon'), [string]$Tag = 'a', [int]$W = 1600, [int]$H = 900)
$py = 'D:\UE_5.8\Engine\Binaries\ThirdParty\Python3\Win64\python.exe'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ue = Join-Path (Split-Path -Parent $here) 'unreal\ue.py'
Add-Type @'
using System; using System.Runtime.InteropServices;
public class UeWin2 { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }
'@
$Cameras = $Cameras -split ',' | Where-Object { $_ }
$ed = Get-CimInstance Win32_Process -Filter "Name='UnrealEditor.exe'" | Where-Object { $_.CommandLine -like '*ObodMaskan2*' } | Select-Object -First 1
$proc = if ($ed) { Get-Process -Id $ed.ProcessId } else { $null }
foreach ($c in $Cameras) {
  $f = "D:/3d-aps/ObodMaskanUE2/Renders/${c}_${Tag}.png"
  if (Test-Path $f) { Remove-Item $f }
  & $py $ue "$here\ue_shot.py" $c $f $W $H | Out-Null
  $t = 0
  while (-not (Test-Path $f) -and $t -lt 180) {
    Start-Sleep -Seconds 2; $t += 2
    if ($t -eq 20 -and $proc) { [UeWin2]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null; [UeWin2]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null }
  }
  "$c -> $f ($t s, $(Test-Path $f))"
}
