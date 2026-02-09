export class UniversalShortcodeRegistry {
    constructor() {
        this.map = new Map();
        this.reverseMap = new Map();
        this.counter = 1;
    }
    /**
     * Registers a string and returns a shortcode {{REF_N}}.
     * If the string is already registered, returns existing code.
     * If string is empty/null, returns empty string.
     */
    register(value) {
        if (!value)
            return '';
        // Don't register short values (e.g. "US") - not worth the overhead
        if (value.length < 15)
            return value; // Arbitrary threshold
        if (this.reverseMap.has(value)) {
            return this.reverseMap.get(value);
        }
        const code = `{{REF_${this.counter++}}}`;
        this.map.set(code, value);
        this.reverseMap.set(value, code);
        return code;
    }
    /**
     * Replaces all {{REF_N}} codes in the text with original values.
     */
    unpack(text) {
        if (!text)
            return text;
        return text.replace(/{{REF_\d+}}/g, (match) => {
            return this.map.get(match) || match;
        });
    }
    /**
     * Recursively unpacks an object or array.
     */
    unpackObject(obj) {
        if (!obj)
            return obj;
        if (typeof obj === 'string') {
            return this.unpack(obj);
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.unpackObject(item));
        }
        if (typeof obj === 'object') {
            const result = {};
            for (const key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key)) {
                    result[key] = this.unpackObject(obj[key]);
                }
            }
            return result;
        }
        return obj;
    }
    /**
     * Returns the compression ratio stats.
     */
    getStats() {
        let originalSize = 0;
        let compressedSize = 0;
        this.map.forEach((value, key) => {
            originalSize += value.length;
            compressedSize += key.length;
        });
        return {
            items: this.map.size,
            saving: originalSize - compressedSize
        };
    }
}
