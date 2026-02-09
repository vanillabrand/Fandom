const fs = require('fs');
const path = 'server/services/jobOrchestrator.ts';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split(/\r?\n/);

    let exportIndex = -1;
    for (let i = lines.length - 20; i < lines.length; i++) {
        if (lines[i].includes('export const jobOrchestrator')) {
            exportIndex = i;
            break;
        }
    }

    if (exportIndex === -1) {
        console.error('Could not find export line');
        process.exit(1);
    }

    // Check if brace already exists before it (ignoring empty lines)
    let hasBrace = false;
    for (let i = exportIndex - 1; i >= exportIndex - 5; i--) {
        if (lines[i].trim() === '}') {
            // We expect TWO braces. One for method, one for class.
            // But let's just insert one and see if tsc complains.
            // If we have method closing brace, we need another one.
            // The file currently has:
            //     }
            // 
            // export const ...

            // So we need to insert '}' at exportIndex.
            break;
        }
    }

    console.log(`Inserting brace at line ${exportIndex + 1}`);
    lines.splice(exportIndex, 0, '}');

    fs.writeFileSync(path, lines.join('\n'));
    console.log('Successfully inserted brace.');

} catch (e) {
    console.error(e);
    process.exit(1);
}
