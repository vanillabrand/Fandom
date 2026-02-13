
function parseMetric(val: any): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
        const sanitized = val.toLowerCase().replace(/,/g, '').replace(/\s/g, '').trim();
        if (!sanitized) return 0;

        let multiplier = 1;
        if (sanitized.endsWith('m')) multiplier = 1000000;
        else if (sanitized.endsWith('k')) multiplier = 1000;

        const numericPart = sanitized.replace(/[mk]$/, '');
        const parsed = parseFloat(numericPart);
        return isNaN(parsed) ? 0 : Math.round(parsed * multiplier);
    }
    return 0;
}

console.log('Test 1.3M:', parseMetric('1.3M') === 1300000 ? 'PASS' : 'FAIL (' + parseMetric('1.3M') + ')');
console.log('Test 10k:', parseMetric('10k') === 10000 ? 'PASS' : 'FAIL (' + parseMetric('10k') + ')');
console.log('Test 1,234:', parseMetric('1,234') === 1234 ? 'PASS' : 'FAIL (' + parseMetric('1,234') + ')');
console.log('Test 1.5K:', parseMetric('1.5K') === 1500 ? 'PASS' : 'FAIL (' + parseMetric('1.5K') + ')');
console.log('Test 0:', parseMetric(0) === 0 ? 'PASS' : 'FAIL');
console.log('Test empty:', parseMetric('') === 0 ? 'PASS' : 'FAIL');
