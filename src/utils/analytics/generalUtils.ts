
// [UNIFIED] Frontend ID Normalization (Matches JobOrchestrator)
export const normalizeId = (rawId: any): string => {
    if (!rawId) return '';
    return String(rawId).toLowerCase().trim()
        .replace(/\s+/g, '_')
        .replace(/[^\w\d_]/g, '') // stricter sanitization
        .replace(/^@/, ''); // Remove leading @
};

// [NEW] Shared Number Formatting (Compact)
export const formatNumber = (num: number | undefined | null): string => {
    if (num === undefined || num === null || isNaN(num)) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toLocaleString();
};
