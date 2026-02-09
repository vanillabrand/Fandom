const fs = require('fs');
try {
    const content = fs.readFileSync('c:\\Users\\bruce\\Documents\\Clients\\Fandom\\server\\services\\jobOrchestrator.ts', 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
        if (line.includes('analyzeMapRequirements')) {
            console.log(`${index + 1}: ${line.trim()}`);
        }
    });
} catch (e) {
    console.error(e);
}
