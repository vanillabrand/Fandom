import { jsonrepair } from 'jsonrepair';
export const safeParseJson = (text) => {
    if (!text)
        return {};
    // 1. Aggressive Extraction: Find the outer JSON payload
    const firstOpen = text.indexOf('{');
    const firstSquare = text.indexOf('[');
    let startIndex = -1;
    if (firstOpen !== -1 && firstSquare !== -1) {
        startIndex = Math.min(firstOpen, firstSquare);
    }
    else if (firstOpen !== -1) {
        startIndex = firstOpen;
    }
    else if (firstSquare !== -1) {
        startIndex = firstSquare;
    }
    if (startIndex === -1)
        return {};
    // substring from the first valid character
    let candidate = text.substring(startIndex).trim();
    // 2. Comment Stripping (C-Style, Python-Style, Shell-Style)
    // Removed inside strings to avoid breaking valid JSON string content
    let sanitized = "";
    let inString = false;
    let escape = false;
    for (let i = 0; i < candidate.length; i++) {
        const char = candidate[i];
        if (escape) {
            sanitized += char;
            escape = false;
            continue;
        }
        if (char === '\\') {
            sanitized += char;
            escape = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            sanitized += char;
            continue;
        }
        if (!inString) {
            // Check for // or /* or #
            if (char === '/' && candidate[i + 1] === '/') {
                while (i < candidate.length && candidate[i] !== '\n')
                    i++;
                continue;
            }
            if (char === '/' && candidate[i + 1] === '*') {
                i += 2;
                while (i < candidate.length && !(candidate[i] === '*' && candidate[i + 1] === '/'))
                    i++;
                i++;
                continue;
            }
            if (char === '#') {
                while (i < candidate.length && candidate[i] !== '\n')
                    i++;
                continue;
            }
        }
        sanitized += char;
    }
    return attemptRobustParse(sanitized);
};
const attemptRobustParse = (text) => {
    // 1. Try Standard Parse
    try {
        return JSON.parse(text);
    }
    catch (e) {
        // 2. Try jsonrepair
        try {
            const repaired = jsonrepair(text);
            return JSON.parse(repaired);
        }
        catch (repairErr) {
            console.warn("[safeParseJson] jsonrepair failed, attempting manual stack repair...");
            // 3. Manual Stack-Based Repair (Truncation Healing)
            let repaired = "";
            let stack = [];
            let inString = false;
            let escape = false;
            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                if (escape) {
                    escape = false;
                    repaired += char;
                    continue;
                }
                if (char === '\\') {
                    escape = true;
                    repaired += char;
                    continue;
                }
                if (char === '"') {
                    inString = !inString;
                    repaired += char;
                    continue;
                }
                if (!inString) {
                    if (char === '{')
                        stack.push('}');
                    else if (char === '[')
                        stack.push(']');
                    else if (char === '}' || char === ']') {
                        if (stack.length > 0 && stack[stack.length - 1] === char) {
                            stack.pop();
                        }
                    }
                }
                repaired += char;
            }
            // Cleanup trailing commas/colons
            repaired = repaired.trimEnd();
            if (repaired.endsWith(','))
                repaired = repaired.slice(0, -1);
            if (repaired.endsWith(':'))
                repaired += ' null';
            // Close string if truncated
            if (inString)
                repaired += '"';
            // Close stack
            while (stack.length > 0) {
                repaired += stack.pop();
            }
            try {
                return JSON.parse(repaired);
            }
            catch (finalErr) {
                console.warn("[safeParseJson] Manual repair initially failed, trying deeper heuristics...");
                // Heuristic 1: If it ends with "key" (dangling quote), try adding : null
                if (repaired.match(/"\s*[}\]]*$/)) {
                    try {
                        const lastQuote = repaired.lastIndexOf('"');
                        if (lastQuote !== -1) {
                            const candidate2 = repaired.slice(0, lastQuote + 1) + ": null" + repaired.slice(lastQuote + 1);
                            return JSON.parse(candidate2);
                        }
                    }
                    catch (e) { }
                }
                // Last ditch: if it's a "colon expected" error, it might be an unquoted key
                try {
                    const unquotedFixed = repaired.replace(/([{,]\s*)([a-zA-Z0-9_]+)(\s*:)/g, '$1"$2"$3');
                    return JSON.parse(unquotedFixed);
                }
                catch (e3) {
                    return {};
                }
            }
        }
    }
};
