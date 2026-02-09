const fs = require('fs');
const path = 'server/services/jobOrchestrator.ts';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split(/\r?\n/);

    // Validate we are cutting at the right place
    const cutIndex = 8821; // Line 8822 (0-based)
    // Actually, line 8821 (1-based) is index 8820.

    // View_file said:
    // 8820:         return 'profile';
    // 8821:     }

    // So index 8820 should be '    }'

    if (lines[8820].trim() !== '}') {
        console.error('Line 8821 does not match "}". content:', lines[8820]);
        // Fallback: search for determineNodeGroup end?
        // Let's just trust view_file for now or use looser check.
        if (!lines[8820].includes('}')) {
            console.error('Aborting.');
            process.exit(1);
        }
    }

    // Keep lines 0 to 8820 (inclusive) -> length 8821
    const newLines = lines.slice(0, 8821);

    // Add class closing brace
    newLines.push('}');
    newLines.push('');
    newLines.push('export const jobOrchestrator = JobOrchestrator.getInstance();');
    newLines.push('');

    fs.writeFileSync(path, newLines.join('\n'));
    console.log('Successfully rewrote file end.');

} catch (e) {
    console.error(e);
    process.exit(1);
}
