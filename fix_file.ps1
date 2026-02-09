$lines = Get-Content server\services\jobOrchestrator.ts
$index = 0
for ($i = $lines.Count - 200; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "return 'profile'") {
        $index = $i
        break
    }
}

if ($index -eq 0) {
    Write-Error "Could not find marker"
    exit 1
}

$cutIndex = $index + 1
Write-Host "Found marker at $index. Cutting at $cutIndex"

$newLines = $lines[0..$cutIndex]
$newLines += ""
$newLines += "}"
$newLines += ""
$newLines += "export const jobOrchestrator = JobOrchestrator.getInstance();"
$newLines += ""

$newLines | Set-Content server\services\jobOrchestrator.ts -Encoding UTF8
Write-Host "Successfully rewrote file end."
