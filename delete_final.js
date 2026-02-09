const fs = require('fs');
const path = 'server/services/jobOrchestrator.ts';

try {
    const content = fs.readFileSync(path, 'utf8');
    const lines = content.split(/\r?\n/);

    console.log(`File length: ${lines.length} lines`);

    // Find the marker
    let markerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('DELETED BLOCK 3b') || lines[i].includes('// DELETED BLOCK 3b')) {
            markerIndex = i;
            break;
        }
    }

    if (markerIndex === -1) {
        console.error('Marker "DELETED BLOCK 3b" not found');
        // fallback to just finding the last deleted block
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].includes('DELETED BLOCK')) {
                markerIndex = i;
                console.log(`Fallback marker found at line ${i + 1}: ${lines[i]}`);
                break;
            }
        }
    }

    if (markerIndex === -1) {
        console.error('No DELETED BLOCK marker found');
        process.exit(1);
    }

    console.log(`Found marker at line ${markerIndex + 1}`);

    // Find limits
    let exportIndex = -1;
    for (let i = markerIndex; i < lines.length; i++) {
        if (lines[i].includes('export const jobOrchestrator')) {
            exportIndex = i;
            break;
        }
    }

    if (exportIndex === -1) {
        console.error('Could not find export const jobOrchestrator');
        process.exit(1);
    }

    console.log(`Found export at line ${exportIndex + 1}`);

    let classEndIndex = -1;
    // Iterate backwards from exportIndex
    for (let i = exportIndex - 1; i > markerIndex; i--) {
        if (lines[i].trim() === '}') {
            classEndIndex = i;
            break;
        }
    }

    if (classEndIndex === -1) {
        console.error('Could not find class closing brace } before export');
        process.exit(1);
    }

    console.log(`Found class closing brace at line ${classEndIndex + 1}`);

    // Check if we also need to delete the function closing brace '}' which belongs to generateOverindexGraph
    // The duplicate function ENDS at classEndIndex - 1 (presumably)
    // The class ends at classEndIndex.

    // Logic:
    // Duplicate function body starts after markerIndex.
    // Duplicate function ends just before classEndIndex.

    // I want to delete everything from markerIndex + 1 to classEndIndex - 1.
    // This removes the rest of the function body and its closing brace.. wait.

    // Let's verify structure.
    // ...
    // footer code
    //     }  <-- end of duplicated function
    // }      <-- end of class

    // So if classEndIndex points to the end of class, then classEndIndex - 1 should be end of function (possibly with whitespace).

    const startDelete = markerIndex + 1;
    const endDelete = classEndIndex - 1;

    if (startDelete > endDelete) {
        console.log('Range is empty or invalid, nothing to delete.');
        process.exit(0);
    }

    console.log(`Deleting lines ${startDelete + 1} to ${endDelete + 1} (Count: ${endDelete - startDelete + 1})`);

    lines.splice(startDelete, endDelete - startDelete + 1);

    fs.writeFileSync(path, lines.join('\n'));
    console.log('Successfully deleted contents.');

} catch (e) {
    console.error(e);
    process.exit(1);
}
