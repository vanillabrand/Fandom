const fs = require('fs');
const path = 'server/services/jobOrchestrator.ts';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split(/\r?\n/);

    // Find the marker
    const markerIndex = lines.findIndex(l => l.includes('DELETED BLOCK 3b'));
    if (markerIndex === -1) {
        console.error('Marker DELETED BLOCK 3b not found');
        process.exit(1);
    }

    console.log(`Found marker at line ${markerIndex + 1}`);

    // Find the end of the class (last '}')
    // We know the file ends with export const...
    // So the class end is the last '}' before that.

    // Let's just look for the end of the function.
    // The duplicate function has a return block.
    // It ends with:
    //     };
    // }

    // We can just delete everything from marker+1 until we see `export const jobOrchestrator`?
    // No, we need to keep the class closing brace `}`.

    // Let's identify the class closing brace.
    // It should be the last `}` in the file before the export.

    let classEndIndex = -1;
    for (let i = lines.length - 1; i > markerIndex; i--) {
        if (lines[i].trim() === '}') {
            classEndIndex = i;
            break;
        }
    }

    if (classEndIndex === -1) {
        console.error('Could not find class closing brace');
        process.exit(1);
    }

    console.log(`Found class end at line ${classEndIndex + 1}`);

    // Delete from markerIndex + 1 to classEndIndex - 1
    // This removes the rest of the function body but keeps the class closing brace.

    const startDelete = markerIndex + 1;
    const endDelete = classEndIndex - 1; // inclusive

    if (startDelete > endDelete) {
        console.log('Nothing to delete?');
        process.exit(0);
    }

    console.log(`Deleting lines ${startDelete + 1} to ${endDelete + 1}`);

    lines.splice(startDelete, endDelete - startDelete + 1);

    fs.writeFileSync(path, lines.join('\n'));
    console.log('Successfully deleted remaining duplicate code');

} catch (e) {
    console.error(e);
    process.exit(1);
}
