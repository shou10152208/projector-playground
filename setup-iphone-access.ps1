# iPhone など同じWi-Fiのスマホから WSL 内のサーバーに届くようにする設定。
# WSL2 は NAT のため、Windows 側でポート転送とファイアウォール許可が必要。
#
# 使い方(Windows の PowerShell を「管理者として実行」して):
#   powershell -ExecutionPolicy Bypass -File setup-iphone-access.ps1
# 解除するとき:
#   powershell -ExecutionPolicy Bypass -File setup-iphone-access.ps1 -Remove

param(
  [int]$Port = 8443,
  [switch]$Remove
)

$ErrorActionPreference = "Stop"

# 管理者チェック
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
  Write-Host "このスクリプトは管理者権限が必要です。PowerShell を『管理者として実行』してください。" -ForegroundColor Red
  exit 1
}

$ruleName = "KaradaDeAsobo-$Port"

if ($Remove) {
  netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 | Out-Null
  Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  Write-Host "ポート $Port の転送とファイアウォール許可を解除しました。" -ForegroundColor Green
  exit 0
}

# WSL の IP を取得
$wslIp = (wsl hostname -I).Trim().Split(" ")[0]
if (-not $wslIp) { Write-Host "WSL の IP を取得できませんでした。WSL が起動しているか確認してください。" -ForegroundColor Red; exit 1 }

# ポート転送(既存を作り直す)
netsh interface portproxy delete v4tov4 listenport=$Port listenaddress=0.0.0.0 2>$null | Out-Null
netsh interface portproxy add v4tov4 listenport=$Port listenaddress=0.0.0.0 connectport=$Port connectaddress=$wslIp | Out-Null

# ファイアウォール許可
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow `
  -Protocol TCP -LocalPort $Port -Profile Private | Out-Null

# 案内
$lanIps = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "169.*" -and $_.IPAddress -ne "127.0.0.1" -and $_.PrefixOrigin -ne "WellKnown" } |
  Select-Object -ExpandProperty IPAddress

Write-Host ""
Write-Host "設定しました (WSL $wslIp:$Port へ転送)。" -ForegroundColor Green
Write-Host "WSL 側で  python3 serve.py  を起動したうえで、iPhone の Safari で次を開いてください:" -ForegroundColor Cyan
foreach ($ip in $lanIps) {
  if ($ip -notlike "172.*") { Write-Host ("    https://{0}:{1}" -f $ip, $Port) -ForegroundColor Yellow }
}
Write-Host ""
Write-Host "※ 自己署名証明書のため『安全ではない』警告が出ます。『詳細』→『このまま開く』で進んでください。"
