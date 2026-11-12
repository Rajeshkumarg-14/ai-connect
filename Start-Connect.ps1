$ErrorActionPreference = 'Stop'
if (-not (Test-Path P:\)) { throw 'The Dev Drive is not mounted. Mount D:\DevDrive.vhdx in Explorer first.' }
Set-Location -LiteralPath $PSScriptRoot
if ($PWD.Path.StartsWith('D:\Projects', [StringComparison]::OrdinalIgnoreCase)) {
    Set-Location -LiteralPath ('P:\Projects' + $PWD.Path.Substring('D:\Projects'.Length))
}
if (-not (Test-Path 'node_modules\react\package.json')) {
    throw 'Dependencies are missing. Read README.md, then run npm ci --ignore-scripts.'
}
npm start
