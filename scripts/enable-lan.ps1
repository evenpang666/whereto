param([ValidateRange(1024, 65535)][int]$Port = 3789)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$projectPath = Split-Path -Parent $PSScriptRoot
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    # Elevate only this reviewed script. Windows asks for administrator consent.
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Port {1}' -f $PSCommandPath, $Port
    $process = Start-Process powershell.exe -ArgumentList $arguments -Verb RunAs -WindowStyle Hidden -PassThru -Wait
    exit $process.ExitCode
}
try {
    Set-Location -LiteralPath $projectPath
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $networkJson = & $nodePath --input-type=module -e "import { selectLan } from './server/network.mjs'; console.log(JSON.stringify(selectLan()));"
    if ($LASTEXITCODE -ne 0) { throw 'Could not read Ethernet interface.' }
    $network = $networkJson | ConvertFrom-Json
    if (-not $network -or $network.address -notmatch '^192\.168\.\d+\.\d+$') { throw 'No matching 192.168 Ethernet interface.' }
    $ruleName = 'Whereto-LAN-{0}' -f $Port
    $rule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    # A /32 local address and the interface subnet keep access on the chosen Ethernet.
    $addressBytes = [Net.IPAddress]::Parse($network.address).GetAddressBytes()
    $maskBytes = [Net.IPAddress]::Parse($network.netmask).GetAddressBytes()
    $networkBase = (0..3 | ForEach-Object { $addressBytes[$_] -band $maskBytes[$_] }) -join '.'
    $maskBits = ($maskBytes | ForEach-Object { [Convert]::ToString($_, 2).PadLeft(8, '0') }) -join ''
    $prefixLength = ($maskBits -replace '0', '').Length
    $remoteSubnet = '{0}/{1}' -f $networkBase, $prefixLength
    $options = @{
        DisplayName = '漫游whereto LAN TCP {0}' -f $Port
        Direction = 'Inbound'; Action = 'Allow'; Enabled = 'True'; Profile = 'Any'
        Program = $nodePath; Protocol = 'TCP'; LocalPort = $Port
        LocalAddress = $network.address; RemoteAddress = $remoteSubnet
        InterfaceAlias = $network.name; EdgeTraversalPolicy = 'Block'
    }
    if ($rule) { Set-NetFirewallRule -Name $ruleName @options | Out-Null }
    else { New-NetFirewallRule -Name $ruleName @options | Out-Null }
    Write-Host ('LAN enabled: http://{0}:{1}' -f $network.address, $Port)
    exit 0
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
