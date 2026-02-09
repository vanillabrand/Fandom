$lines = Get-Content server\services\jobOrchestrator.ts
$newLines = @()
$inserted = $false
foreach ($line in $lines) {
    if ($line -match "export const jobOrchestrator" -and -not $inserted) {
        $newLines += "}"
        $newLines += ""
        $inserted = $true
    }
    $newLines += $line
}
$newLines | Set-Content server\services\jobOrchestrator.ts -Encoding UTF8
Write-Host "Inserted brace."
