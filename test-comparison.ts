
function testComparison() {
    const sourceFollowers = "1,315,445";
    const profileFollowers = 0;

    console.log(`Comparing source=${sourceFollowers} (type: ${typeof sourceFollowers}) with profile=${profileFollowers}`);
    console.log(`source > profile:`, sourceFollowers > profileFollowers);

    const castedSource = parseInt(String(sourceFollowers).replace(/,/g, ''));
    console.log(`Casted source:`, castedSource);
    console.log(`castedSource > profile:`, castedSource > profileFollowers);
}

testComparison();
