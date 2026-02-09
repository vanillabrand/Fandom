const fs = require('fs');
const path = 'server/services/jobOrchestrator.ts';
try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split(/\r?\n/);

    const targetLineIndex = 8821; // Line 8822
    console.log(`Checking line ${targetLineIndex + 1}:`, lines[targetLineIndex]);

    // Check if it looks right (starts with // REMOVED or private generate)
    if (!lines[targetLineIndex] || (!lines[targetLineIndex].includes('REMOVED') && !lines[targetLineIndex].includes('generateOverindexGraph'))) {
        console.error('Target line does not look like the start of the duplicate method. Aborting.');
        process.exit(1);
    }

    // Delete lines 8822 to 8945 (1-based) -> index 8821 to 8944
    // Length: 8945 - 8822 + 1 = 124
    console.log('Deleting 124 lines starting from index', targetLineIndex);
    const deleted = lines.slice(targetLineIndex, targetLineIndex + 124);
    // console.log('First deleted:', deleted[0]);
    // console.log('Last deleted:', deleted[deleted.length-1]);

    lines.splice(targetLineIndex, 124);

    fs.writeFileSync(path, lines.join('\n'));
    console.log('Successfully deleted lines 8822-8945');

} catch (e) {
    console.error(e);
    process.exit(1);
}
