const fs = require('fs');
const path = 'server/services/jobOrchestrator.ts';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split(/\r?\n/);

    const startIndex = 8830; // Line 8831
    const count = 3;

    console.log('Deleting lines starting from index', startIndex);
    for (let i = 0; i < count; i++) {
        console.log(`Line ${startIndex + i + 1}: ${lines[startIndex + i]}`);
        if (!lines[startIndex + i].includes('topTopics') && !lines[startIndex + i].includes('sort') && !lines[startIndex + i].includes('slice')) {
            console.error('Safety check failed: unexpected content.');
            process.exit(1);
        }
    }

    lines.splice(startIndex, count);

    fs.writeFileSync(path, lines.join('\n'));
    console.log('Successfully deleted lines.');

} catch (e) {
    console.error(e);
    process.exit(1);
}
