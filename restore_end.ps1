$lines = Get-Content server\services\jobOrchestrator.ts
$index = 0
for ($i = $lines.Count - 500; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match "private determineNodeGroup") {
        $index = $i
        break
    }
}

if ($index -eq 0) {
    Write-Error "Could not find determineNodeGroup"
    exit 1
}

Write-Host "Found determineNodeGroup at $index. Truncating..."

$newLines = $lines[0..($index - 1)]
$newLines += "    private determineNodeGroup(username: string, analytics: any): string {"
$newLines += "        if (!username) return 'profile';"
$newLines += "        "
$newLines += "        const clean = username.toLowerCase();"
$newLines += ""
$newLines += "        // 1. Check Analytics (Apify Data)"
$newLines += "        if (analytics) {"
$newLines += "            // Check Brands"
$newLines += "            if (analytics.brands && analytics.brands.some((b: any) => "
$newLines += "                (b.username && b.username.toLowerCase() === clean) ||"
$newLines += "                (b.name && b.name.toLowerCase() === clean)"
$newLines += "            )) {"
$newLines += "                return 'brand';"
$newLines += "            }"
$newLines += ""
$newLines += "            // Check Creators"
$newLines += "            if (analytics.creators && analytics.creators.some((c: any) => "
$newLines += "                (c.username && c.username.toLowerCase() === clean)"
$newLines += "            )) {"
$newLines += "                return 'creator';"
$newLines += "            }"
$newLines += ""
$newLines += "            // Check Overindexed"
$newLines += "            if (analytics.overindexedAccounts && analytics.overindexedAccounts.some((o: any) =>"
$newLines += "                (o.username && o.username.toLowerCase() === clean)"
$newLines += "            )) {"
$newLines += "                const match = analytics.overindexedAccounts.find((o: any) => o.username.toLowerCase() === clean);"
$newLines += "                if (match && match.category === 'brand') return 'brand';"
$newLines += "                return 'overindexed';"
$newLines += "            }"
$newLines += "        }"
$newLines += ""
$newLines += "        // 2. Heuristic Semantic Checks (Fallback)"
$newLines += "        // Check for obvious brand indicators in username if no analytics match"
$newLines += "        if (/official|global|uk|usa|app|tech|studio|store|shop|brand/.test(clean)) {"
$newLines += "            return 'brand';"
$newLines += "        }"
$newLines += ""
$newLines += "        return 'profile';"
$newLines += "    }"
$newLines += "}"
$newLines += ""
$newLines += "export const jobOrchestrator = JobOrchestrator.getInstance();"
$newLines += ""

$newLines | Set-Content server\services\jobOrchestrator.ts -Encoding UTF8
Write-Host "Successfully restored determineNodeGroup and file end."
