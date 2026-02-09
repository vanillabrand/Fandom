const fs = require('fs');
const path = 'server/services/jobOrchestrator.ts';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split(/\r?\n/);

    // Find "return 'profile';"
    let returnProfileIndex = -1;
    for (let i = lines.length - 200; i < lines.length; i++) {
        if (lines[i].includes("return 'profile'")) {
            returnProfileIndex = i;
            break;
        }
    }

    if (returnProfileIndex === -1) {
        console.error('Could not find return "profile";');
        process.exit(1);
    }

    // The next line should be '    }'
    const braceIndex = returnProfileIndex + 1;
    console.log(`Found return 'profile' at ${returnProfileIndex + 1}. Brace at ${braceIndex + 1}: ${lines[braceIndex]}`);

    // Keep lines 0 to braceIndex (inclusive)
    const newLines = lines.slice(0, braceIndex + 1);

    // Add clean ending
    newLines.push('');
    newLines.push('}'); // Close class
    newLines.push('');
    newLines.push('export const jobOrchestrator = JobOrchestrator.getInstance();');
    newLines.push('');

    fs.writeFileSync(path, newLines.join('\n'));
    console.log('Successfully rewrote file end.');

} catch (e) {
    console.error(e);
    process.exit(1);
}
