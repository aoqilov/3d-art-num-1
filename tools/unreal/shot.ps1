# powershell tools/unreal/shot.ps1 -Cameras umumiy,hovli -Hour 10 -Tag a
# Pictures from the Unreal level's cameras -> ../ObodMaskanUE/Renders/ue_<camera>_<hour>_<tag>.png
# The editor renders its viewport only when it is the foreground window (until it is restarted with
# Config/DefaultEditorSettings.ini: bThrottleCPUWhenNotForeground=False), so it is brought forward for the shot.
param([string[]]$Cameras = @('umumiy', 'hovli'), [int]$Hour = 10, [string]$Tag = 'a', [int]$W = 1600, [int]$H = 900)
$py = 'D:\UE_5.8\Engine\Binaries\ThirdParty\Python3\Win64\python.exe'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Add-Type @'
using System; using System.Runtime.InteropServices;
public class UeWin { [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }
'@
$Cameras = $Cameras -split ',' | Where-Object { $_ }
$ue = Get-Process UnrealEditor | Select-Object -First 1
foreach ($c in $Cameras) {
  $f = "D:/3d-aps/ObodMaskanUE/Renders/ue_${c}_${Hour}_${Tag}.png"
  if (Test-Path $f) { Remove-Item $f }
  & $py "$here\ue.py" "$here\ue_shot.py" $c $Hour $f $W $H | Out-Null
  [UeWin]::ShowWindow($ue.MainWindowHandle, 9) | Out-Null
  [UeWin]::SetForegroundWindow($ue.MainWindowHandle) | Out-Null
  $t = 0; while (-not (Test-Path $f) -and $t -lt 180) { Start-Sleep -Seconds 2; $t += 2 }
  "$c ${Hour}:00 -> $f ($t s, $(Test-Path $f))"
}
