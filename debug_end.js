const fs = require('fs');
const path = 'server/services/jobOrchestrator.ts';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split(/\r?\n/);

    console.log(`File has ${lines.length} lines`);
    console.log('--- Last 50 lines ---');
    lines.slice(-50).forEach((line, i) => {
        console.log(`${lines.length - 50 + i}: ${line}`); // print index
    });

} catch (e) {
    console.error(e);
    process.exit(1);
}
