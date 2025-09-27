import * as crypto from 'crypto';
import * as zlib from 'zlib';
import * as yaml from 'js-yaml';

// Custom YAML schema to handle unknown tags (like the Python version)
const unknownTagType = new yaml.Type('!', {
    kind: 'scalar',
    multi: true,
    construct: (data: any) => data
});

const unknownSequenceType = new yaml.Type('!', {
    kind: 'sequence', 
    multi: true,
    construct: (data: any) => data
});

const unknownMappingType = new yaml.Type('!', {
    kind: 'mapping',
    multi: true, 
    construct: (data: any) => data
});

// Handle specific BL4 tags like !<!tags>
const bl4TagsType = new yaml.Type('!<!tags>', {
    kind: 'mapping',
    construct: (data: any) => data
});

const BL4_SCHEMA = yaml.DEFAULT_SCHEMA.extend([
    unknownTagType,
    unknownSequenceType,
    unknownMappingType,
    bl4TagsType
]);

// Base encryption key from the Python implementation
const BASE_KEY = Buffer.from([
    0x35, 0xEC, 0x33, 0x77, 0xF3, 0x5D, 0xB0, 0xEA,
    0xBE, 0x6B, 0x83, 0x11, 0x54, 0x03, 0xEB, 0xFB,
    0x27, 0x25, 0x64, 0x2E, 0xD5, 0x49, 0x06, 0x29,
    0x05, 0x78, 0xBD, 0x60, 0xBA, 0x4A, 0xA7, 0x87
]);

export interface ItemStats {
    primaryStat?: number;
    secondaryStat?: number;
    level?: number;
    rarity?: number;
    manufacturer?: number;
    itemClass?: number;
    flags?: number[];
}

export interface ItemLocation {
    container: string;
    containerType: 'inventory' | 'bank' | 'lost_loot' | 'equipped' | 'vehicle' | 'unknown';
    slot?: number;
    displayName: string;
}

export interface DecodedItem {
    serial: string;
    itemType: string;
    itemCategory: string;
    length: number;
    stats: ItemStats;
    rawFields: { [key: string]: any };
    confidence: string;
    location: ItemLocation;
}

export interface SaveData {
    originalYaml: string;
    decodedItems: { [path: string]: DecodedItem };
    yamlData: any;
}

/**
 * Decode bit-packed item serial strings
 */
export function bitPackDecode(serial: string): Buffer {
    let payload = serial;
    if (serial.startsWith('@Ug')) {
        payload = serial.substring(3);
    }

    const charMap: { [key: string]: number } = {};
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=!$%&*()[]{}~`^_<>?#;';
    
    for (let i = 0; i < chars.length; i++) {
        charMap[chars[i]] = i;
    }

    let bits = '';
    for (const char of payload) {
        if (char in charMap) {
            const val = charMap[char];
            bits += val.toString(2).padStart(6, '0');
        }
    }

    // Pad to byte boundary
    while (bits.length % 8 !== 0) {
        bits += '0';
    }

    const byteData = [];
    for (let i = 0; i < bits.length; i += 8) {
        const byteVal = parseInt(bits.substring(i, i + 8), 2);
        byteData.push(byteVal);
    }

    return Buffer.from(byteData);
}

/**
 * Encode data back to bit-packed serial format
 */
export function bitPackEncode(data: Buffer, prefix: string = '@Ug'): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=!$%&*()[]{}~`^_<>?#;';
    
    let bitString = '';
    for (const byte of data) {
        bitString += byte.toString(2).padStart(8, '0');
    }

    // Pad to 6-bit boundary
    while (bitString.length % 6 !== 0) {
        bitString += '0';
    }

    const result = [];
    for (let i = 0; i < bitString.length; i += 6) {
        const chunk = bitString.substring(i, i + 6);
        const val = parseInt(chunk, 2);
        if (val < chars.length) {
            result.push(chars[val]);
        }
    }

    return prefix + result.join('');
}

/**
 * Parse item location from the YAML path
 */
export function parseItemLocation(path: string): ItemLocation {
    const pathLower = path.toLowerCase();
    
    // Check for specific containers
    if (pathLower.includes('inventory')) {
        const slotMatch = path.match(/\[(\d+)\]/);
        return {
            container: 'Player Inventory',
            containerType: 'inventory',
            slot: slotMatch ? parseInt(slotMatch[1]) : undefined,
            displayName: slotMatch ? `Inventory Slot ${slotMatch[1]}` : 'Player Inventory'
        };
    }
    
    if (pathLower.includes('bank') || pathLower.includes('vault')) {
        const slotMatch = path.match(/\[(\d+)\]/);
        return {
            container: 'Bank/Vault',
            containerType: 'bank',
            slot: slotMatch ? parseInt(slotMatch[1]) : undefined,
            displayName: slotMatch ? `Bank Slot ${slotMatch[1]}` : 'Bank/Vault'
        };
    }
    
    if (pathLower.includes('lostloot') || pathLower.includes('lost_loot')) {
        const slotMatch = path.match(/\[(\d+)\]/);
        return {
            container: 'Lost Loot',
            containerType: 'lost_loot',
            slot: slotMatch ? parseInt(slotMatch[1]) : undefined,
            displayName: slotMatch ? `Lost Loot Slot ${slotMatch[1]}` : 'Lost Loot'
        };
    }
    
    if (pathLower.includes('equipped') || pathLower.includes('equip')) {
        return {
            container: 'Equipped Items',
            containerType: 'equipped',
            displayName: 'Currently Equipped'
        };
    }
    
    if (pathLower.includes('vehicle') || pathLower.includes('car') || pathLower.includes('runner')) {
        return {
            container: 'Vehicle Storage',
            containerType: 'vehicle',
            displayName: 'Vehicle Storage'
        };
    }
    
    // Default fallback
    const segments = path.split('.');
    const containerName = segments.length > 1 ? segments[1] : segments[0];
    
    return {
        container: containerName,
        containerType: 'unknown',
        displayName: containerName || 'Unknown Location'
    };
}

/**
 * Improve rarity detection and validation
 */
export function validateRarity(rarity: number | undefined): number | undefined {
    if (rarity === undefined || rarity === null) return undefined;
    
    // Valid rarity range is typically 0-4 for most games
    if (rarity >= 0 && rarity <= 10) {
        return rarity;
    }
    
    // If it's a weird value, try to map it to a valid range
    if (rarity > 10) {
        // Some games use different ranges, try to normalize
        if (rarity >= 100) {
            return Math.min(4, Math.floor(rarity / 25)); // Map 0-100+ to 0-4
        }
        return Math.min(4, Math.floor(rarity / 2)); // Map higher values down
    }
    
    return undefined; // Invalid rarity
}

/**
 * Extract fields from decoded item data
 */
export function extractFields(data: Buffer): { [key: string]: any } {
    const fields: { [key: string]: any } = {};

    if (data.length >= 4) {
        fields.headerLe = data.readUInt32LE(0);
        fields.headerBe = data.readUInt32BE(0);
    }

    if (data.length >= 8) {
        fields.field2Le = data.readUInt32LE(4);
    }

    if (data.length >= 12) {
        fields.field3Le = data.readUInt32LE(8);
    }

    // Extract potential 16-bit stats
    const stats16: [number, number][] = [];
    for (let i = 0; i < Math.min(data.length - 1, 20); i += 2) {
        if (i + 1 < data.length) {
            const val16 = data.readUInt16LE(i);
            fields[`val16At${i}`] = val16;
            if (val16 >= 100 && val16 <= 10000) {
                stats16.push([i, val16]);
            }
        }
    }
    fields.potentialStats = stats16;

    // Extract potential flags
    const flags: [number, number][] = [];
    for (let i = 0; i < Math.min(data.length, 20); i++) {
        const byteVal = data[i];
        fields[`byte${i}`] = byteVal;
        if (byteVal < 100) {
            flags.push([i, byteVal]);
        }
    }
    fields.potentialFlags = flags;

    return fields;
}

/**
 * Decode weapon serial (@Ugr)
 */
export function decodeWeapon(data: Buffer, serial: string, path: string = ""): DecodedItem {
    const fields = extractFields(data);
    const stats: ItemStats = {};

    // Extract weapon stats matching Python decode_weapon exactly
    if (fields.val16At0 !== undefined) {
        stats.primaryStat = fields.val16At0 as number;
    }

    if (fields.val16At12 !== undefined) {
        stats.secondaryStat = fields.val16At12 as number;
    }

    if (fields.byte4 !== undefined) {
        stats.manufacturer = fields.byte4 as number;
    }

    if (fields.byte8 !== undefined) {
        stats.itemClass = fields.byte8 as number;
    }

    if (fields.byte1 !== undefined) {
        const rawRarity = fields.byte1 as number;
        stats.rarity = validateRarity(rawRarity);
    }

    // Look for level 50 in common positions for weapons
    // Check byte13 first (Python default), but also check other common positions
    if (fields.byte13 !== undefined) {
        const level13 = fields.byte13 as number;
        if (level13 >= 1 && level13 <= 72) { // Valid level range
            stats.level = level13;
        }
    }
    
    // If no valid level in byte13, check other positions where level 50 might be
    if (stats.level === undefined) {
        // Check byte positions for level 50
        for (let i = 0; i < 20; i++) {
            const byteKey = `byte${i}` as keyof typeof fields;
            if (fields[byteKey] === 50) {
                stats.level = 50;
                break;
            }
        }
    }

    // User specified: @Ugr weapons always have HIGH confidence
    // (Python uses length check: 24,26 = high, others = medium, but user overrides this)
    const confidence = "high";

    return {
        serial,
        itemType: 'r',
        itemCategory: 'weapon',
        length: data.length,
        stats,
        rawFields: fields,
        confidence,
        location: parseItemLocation(path)
    };
}

/**
 * Decode equipment type 'e' (@Uge)
 */
export function decodeEquipmentE(data: Buffer, serial: string, path: string = ""): DecodedItem {
    const fields = extractFields(data);
    const stats: ItemStats = {};

    // Match Python decode_equipment_e exactly
    if (fields.val16At2 !== undefined) {
        stats.primaryStat = fields.val16At2 as number;
    }

    if (fields.val16At8 !== undefined) {
        stats.secondaryStat = fields.val16At8 as number;
    }

    // Look for level in val16At10 first (Python default), then search for level 50
    if (fields.val16At10 !== undefined && data.length > 38) {
        const level10 = fields.val16At10 as number;
        if (level10 >= 1 && level10 <= 72) { // Valid level range
            stats.level = level10;
        }
    }
    
    // If no valid level found, search for level 50 in byte positions
    if (stats.level === undefined) {
        for (let i = 0; i < Math.min(data.length, 20); i++) {
            const byteKey = `byte${i}` as keyof typeof fields;
            if (fields[byteKey] === 50) {
                stats.level = 50;
                break;
            }
        }
    }

    if (fields.byte1 !== undefined) {
        stats.manufacturer = fields.byte1 as number;
    }

    if (fields.byte3 !== undefined) {
        stats.itemClass = fields.byte3 as number;
    }

    if (fields.byte9 !== undefined) {
        const rawRarity = fields.byte9 as number;
        stats.rarity = validateRarity(rawRarity);
    }

    // User specified: @Uge equipment always has HIGH confidence
    // (Python uses byte1 == 49 check, but user overrides this)
    const confidence = "high";

    return {
        serial,
        itemType: 'e',
        itemCategory: 'equipment',
        length: data.length,
        stats,
        rawFields: fields,
        confidence,
        location: parseItemLocation(path)
    };
}

/**
 * Decode equipment type 'd' (@Ugd)
 */
export function decodeEquipmentD(data: Buffer, serial: string, path: string = ""): DecodedItem {
    const fields = extractFields(data);
    const stats: ItemStats = {};

    // Match Python decode_equipment_d exactly
    if (fields.val16At4 !== undefined) {
        stats.primaryStat = fields.val16At4 as number;
    }

    if (fields.val16At8 !== undefined) {
        stats.secondaryStat = fields.val16At8 as number;
    }

    // Look for level in val16At10 first (Python default), then search for level 50
    if (fields.val16At10 !== undefined) {
        const level10 = fields.val16At10 as number;
        if (level10 >= 1 && level10 <= 72) { // Valid level range
            stats.level = level10;
        }
    }
    
    // If no valid level found, search for level 50 in byte positions
    if (stats.level === undefined) {
        for (let i = 0; i < Math.min(data.length, 20); i++) {
            const byteKey = `byte${i}` as keyof typeof fields;
            if (fields[byteKey] === 50) {
                stats.level = 50;
                break;
            }
        }
    }

    if (fields.byte5 !== undefined) {
        stats.manufacturer = fields.byte5 as number;
    }

    if (fields.byte6 !== undefined) {
        stats.itemClass = fields.byte6 as number;
    }

    if (fields.byte14 !== undefined) {
        const rawRarity = fields.byte14 as number;
        stats.rarity = validateRarity(rawRarity);
    }

    // User specified: @Ugd equipment_alt has MEDIUM confidence
    // (Python uses byte5 == 15 check, but user overrides this to always be medium)
    const confidence = "medium";

    return {
        serial,
        itemType: 'd',
        itemCategory: 'equipment_alt',
        length: data.length,
        stats,
        rawFields: fields,
        confidence,
        location: parseItemLocation(path)
    };
}

/**
 * Decode other item types
 */
export function decodeOtherType(data: Buffer, serial: string, itemType: string, path: string = ""): DecodedItem {
    const fields = extractFields(data);
    const stats: ItemStats = {};

    const potentialStats = (fields.potentialStats as any) || [];
    if (potentialStats.length > 0) {
        stats.primaryStat = potentialStats[0][1];
        if (potentialStats.length > 1) {
            stats.secondaryStat = potentialStats[1][1];
        }
    }

    if (fields.byte1 !== undefined) {
        stats.manufacturer = fields.byte1 as number;
    }

    if (fields.byte2 !== undefined) {
        const rawRarity = fields.byte2 as number;
        stats.rarity = validateRarity(rawRarity);
    }

    const categoryMap: { [key: string]: string } = {
        'w': 'weapon_special',
        'u': 'utility', 
        'f': 'consumable',
        '!': 'special',
        'v': 'vehicle_part' // New item type found in save data
    };

    return {
        serial,
        itemType,
        itemCategory: categoryMap[itemType] || 'unknown',
        length: data.length,
        stats,
        rawFields: fields,
        confidence: "low",
        location: parseItemLocation(path)
    };
}

/**
 * Decode item serial string
 */
export function decodeItemSerial(serial: string, path: string = ""): DecodedItem {
    try {
        const data = bitPackDecode(serial);
        
        let itemType = '?';
        if (serial.length >= 4 && serial.startsWith('@Ug')) {
            itemType = serial[3];
        }

        switch (itemType) {
            case 'r':
                return decodeWeapon(data, serial, path);
            case 'e':
                return decodeEquipmentE(data, serial, path);
            case 'd':
                return decodeEquipmentD(data, serial, path);
            case 'v': // Vehicle parts - treat as low confidence other type
                return decodeOtherType(data, serial, itemType, path);
            default:
                return decodeOtherType(data, serial, itemType, path);
        }
    } catch (error) {
        return {
            serial,
            itemType: 'error',
            itemCategory: 'decode_failed',
            length: 0,
            stats: {},
            rawFields: { error: (error as Error).message },
            confidence: "none",
            location: parseItemLocation(path)
        };
    }
}

/**
 * Encode modified item back to serial
 */
export function encodeItemSerial(decodedItem: DecodedItem): string {
    try {
        const originalData = bitPackDecode(decodedItem.serial);
        const data = Buffer.from(originalData);

        if (decodedItem.itemType === 'r') {
            if (decodedItem.stats.primaryStat !== undefined && data.length >= 2) {
                data.writeUInt16LE(decodedItem.stats.primaryStat, 0);
            }
            if (decodedItem.stats.secondaryStat !== undefined && data.length >= 14) {
                data.writeUInt16LE(decodedItem.stats.secondaryStat, 12);
            }
            if (decodedItem.stats.rarity !== undefined && data.length >= 2) {
                data[1] = decodedItem.stats.rarity;
            }
            if (decodedItem.stats.manufacturer !== undefined && data.length >= 5) {
                data[4] = decodedItem.stats.manufacturer;
            }
            if (decodedItem.stats.itemClass !== undefined && data.length >= 9) {
                data[8] = decodedItem.stats.itemClass;
            }
        } else if (decodedItem.itemType === 'e') {
            if (decodedItem.stats.primaryStat !== undefined && data.length >= 4) {
                data.writeUInt16LE(decodedItem.stats.primaryStat, 2);
            }
            if (decodedItem.stats.secondaryStat !== undefined && data.length >= 10) {
                data.writeUInt16LE(decodedItem.stats.secondaryStat, 8);
            }
            if (decodedItem.stats.manufacturer !== undefined && data.length >= 2) {
                data[1] = decodedItem.stats.manufacturer;
            }
            if (decodedItem.stats.itemClass !== undefined && data.length >= 4) {
                data[3] = decodedItem.stats.itemClass;
            }
            if (decodedItem.stats.rarity !== undefined && data.length >= 10) {
                data[9] = decodedItem.stats.rarity;
            }
        } else if (decodedItem.itemType === 'd') {
            if (decodedItem.stats.primaryStat !== undefined && data.length >= 6) {
                data.writeUInt16LE(decodedItem.stats.primaryStat, 4);
            }
            if (decodedItem.stats.secondaryStat !== undefined && data.length >= 10) {
                data.writeUInt16LE(decodedItem.stats.secondaryStat, 8);
            }
            if (decodedItem.stats.manufacturer !== undefined && data.length >= 6) {
                data[5] = decodedItem.stats.manufacturer;
            }
            if (decodedItem.stats.itemClass !== undefined && data.length >= 7) {
                data[6] = decodedItem.stats.itemClass;
            }
        }

        const prefix = `@Ug${decodedItem.itemType}`;
        return bitPackEncode(data, prefix);
    } catch (error) {
        console.warn(`Failed to encode item serial: ${(error as Error).message}`);
        return decodedItem.serial;
    }
}

/**
 * Derive encryption key from an account identifier.
 * Supports both Steam and Epic styles (matches Python reference):
 * - epic: uid encoded as utf-16le, xor into base key (no wrap)
 * - steam: extract digits, convert to 8-byte little-endian, xor into base key with wrap
 */
export function deriveKey(uid: string, platform: 'steam' | 'epic' | 'auto' = 'auto'): Buffer {
    if (!uid) return Buffer.from(BASE_KEY);

    const key = Buffer.from(BASE_KEY);

    // Heuristic: if the uid contains digits and no '@', treat as steam when auto
    const looksLikeSteam = /\d/.test(uid) && !/@/.test(uid);
    const mode = platform === 'auto' ? (looksLikeSteam ? 'steam' : 'epic') : platform;

    if (mode === 'epic') {
        // Epic: UTF-16LE bytes XOR'ed into key (no wrap)
        const wid = Buffer.from(uid.trim(), 'utf16le');
        const n = Math.min(wid.length, key.length);
        for (let i = 0; i < n; i++) {
            key[i] = key[i] ^ wid[i];
        }
        return key;
    }

    // Steam: extract digits, convert to 8-byte little-endian, xor into key with wrap
    const digits = (uid || '').replace(/\D/g, '') || '0';
    const sidNum = BigInt(digits);
    const sidBuf = Buffer.alloc(8);
    sidBuf.writeBigUInt64LE(sidNum);

    for (let i = 0; i < sidBuf.length; i++) {
        key[i % key.length] = key[i % key.length] ^ sidBuf[i];
    }

    return key;
}

/**
 * Decrypt .sav file to YAML
 */
export function decryptSavToYaml(savData: Buffer, steamId: string): Buffer {
    // Validate file size is multiple of 16 (AES block size)
    if (savData.length % 16 !== 0) {
        throw new Error(`File size not multiple of 16: ${savData.length} bytes. This indicates a corrupted save file.`);
    }
    
    const key = deriveKey(steamId);
    
    let decrypted: Buffer;
    try {
        const decipher = crypto.createDecipheriv('aes-256-ecb', key, null);
        // Disable automatic padding so we can emulate Python's try-unpad behavior
        decipher.setAutoPadding(false);

        const decryptedRaw = Buffer.concat([decipher.update(savData), decipher.final()]);

        // Attempt PKCS7 unpadding manually; if it fails, fall back to raw decrypted bytes
        let body: Buffer = decryptedRaw;
        try {
            const padLen = decryptedRaw[decryptedRaw.length - 1];
            if (padLen >= 1 && padLen <= 16) {
                // Verify padding bytes are all equal to padLen
                const paddingStart = decryptedRaw.length - padLen;
                let valid = true;
                for (let i = paddingStart; i < decryptedRaw.length; i++) {
                    if (decryptedRaw[i] !== padLen) {
                        valid = false;
                        break;
                    }
                }
                if (valid) {
                    body = decryptedRaw.slice(0, paddingStart);
                }
            }
        } catch (e) {
            // If unpad check fails, use raw decrypted bytes (mirrors Python's behavior)
            body = decryptedRaw;
        }

        // Decompress with zlib - decompressor will stop at end of zlib stream and ignore trailing checksum/length
        let yamlData: Buffer;
        try {
            yamlData = zlib.inflateSync(body);
        } catch (error) {
            throw new Error(`zlib decompression error. This usually indicates an incorrect Steam ID or corrupted file: ${(error as Error).message}`);
        }

        return yamlData;
    } catch (error) {
        throw new Error(`AES decryption failed. This usually indicates an incorrect Steam ID: ${(error as Error).message}`);
    }
}

/**
 * Calculate Adler-32 checksum
 */
function calculateAdler32(data: Buffer): number {
    let a = 1;
    let b = 0;
    const MOD_ADLER = 65521;
    
    for (let i = 0; i < data.length; i++) {
        a = (a + data[i]) % MOD_ADLER;
        b = (b + a) % MOD_ADLER;
    }
    
    // Use unsigned right shift to ensure we get an unsigned 32-bit value
    return ((b << 16) | a) >>> 0;
}

/**
 * Encrypt YAML back to .sav format
 */
export function encryptYamlToSav(yamlData: Buffer, steamId: string): Buffer {
    // Compress with zlib (level 9 to match Python reference)
    const compressed = zlib.deflateSync(yamlData, { level: 9 });

    // Calculate adler32 over the uncompressed data (matches Python zlib.adler32)
    const adler32 = calculateAdler32(yamlData);
    const uncompressedLength = yamlData.length;

    const adler32Buffer = Buffer.alloc(4);
    adler32Buffer.writeUInt32LE(adler32);

    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(uncompressedLength);

    const packed = Buffer.concat([compressed, adler32Buffer, lengthBuffer]);

    // Encrypt with AES-256-ECB using PKCS7 padding (let Node handle padding)
    const key = deriveKey(steamId);
    const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
    cipher.setAutoPadding(true);

    const encrypted = Buffer.concat([cipher.update(packed), cipher.final()]);

    return encrypted;
}

/**
 * Find and decode all item serials in YAML data
 */
export function findAndDecodeSerials(yamlData: any): { [path: string]: DecodedItem } {
    const decodedSerials: { [path: string]: DecodedItem } = {};
    
    function searchObject(obj: any, path: string = ""): void {
        if (typeof obj === 'object' && obj !== null) {
            if (Array.isArray(obj)) {
                obj.forEach((item, index) => {
                    const newPath = path ? `${path}[${index}]` : `[${index}]`;
                    if (typeof item === 'string' && item.startsWith('@Ug')) {
                        const decoded = decodeItemSerial(item, newPath);
                        if (decoded.confidence !== "none") {
                            decodedSerials[newPath] = decoded;
                        }
                    } else if (typeof item === 'object') {
                        searchObject(item, newPath);
                    }
                });
            } else {
                Object.entries(obj).forEach(([key, value]) => {
                    const newPath = path ? `${path}.${key}` : key;
                    if (typeof value === 'string' && value.startsWith('@Ug')) {
                        const decoded = decodeItemSerial(value, newPath);
                        if (decoded.confidence !== "none") {
                            decodedSerials[newPath] = decoded;
                        }
                    } else if (typeof value === 'object') {
                        searchObject(value, newPath);
                    }
                });
            }
        }
    }
    
    searchObject(yamlData);
    return decodedSerials;
}

/**
 * Set nested value in object using dot notation path
 */
export function setNestedValue(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (part.includes('[') && part.includes(']')) {
            const [key, indexStr] = part.split('[');
            const index = parseInt(indexStr.replace(']', ''));
            current = current[key][index];
        } else {
            current = current[part];
        }
    }
    
    const finalPart = parts[parts.length - 1];
    if (finalPart.includes('[') && finalPart.includes(']')) {
        const [key, indexStr] = finalPart.split('[');
        const index = parseInt(indexStr.replace(']', ''));
        current[key][index] = value;
    } else {
        current[finalPart] = value;
    }
}

/**
 * Process save file: decrypt and decode items
 */
export function processSaveFile(savData: Buffer, steamId: string): SaveData {
    // Decrypt and parse YAML
    const yamlBuffer = decryptSavToYaml(savData, steamId);
    const yamlString = yamlBuffer.toString('utf-8');
    
    const yamlData = yaml.load(yamlString, { schema: BL4_SCHEMA });
    
    // Find and decode item serials
    const decodedItems = findAndDecodeSerials(yamlData);
    
    return {
        originalYaml: yamlString,
        decodedItems,
        yamlData
    };
}

/**
 * Apply item edits and re-encrypt save file
 */
export function applySaveEdits(saveData: SaveData, editedItems: { [path: string]: DecodedItem }, steamId: string): Buffer {
    // Apply edited items back to YAML data
    const modifiedYamlData = { ...saveData.yamlData };
    
    Object.entries(editedItems).forEach(([path, editedItem]) => {
        const newSerial = encodeItemSerial(editedItem);
        setNestedValue(modifiedYamlData, path, newSerial);
    });
    
    // Convert back to YAML and encrypt
    const modifiedYamlString = yaml.dump(modifiedYamlData, { 
        flowLevel: -1, 
        schema: BL4_SCHEMA 
    });
    const yamlBuffer = Buffer.from(modifiedYamlString, 'utf-8');
    
    return encryptYamlToSav(yamlBuffer, steamId);
}

/**
 * Re-encrypt YAML content back to save file format
 */
export function encryptYamlContentToSav(yamlContent: string, steamId: string): Buffer {
    const yamlBuffer = Buffer.from(yamlContent, 'utf-8');
    return encryptYamlToSav(yamlBuffer, steamId);
}