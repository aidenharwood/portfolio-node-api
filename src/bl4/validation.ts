/**
 * Validation utilities for BL4 API
 */

export const STEAM_ID_REGEX = /^7656119\d{10}$/;
export const EPIC_ID_REGEX = /^[a-f0-9]{32}$/;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_FOLDER_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILES_COUNT = 20;

/**
 * Validate platform ID (Steam or Epic Games)
 */
export function validatePlatformId(platformId: string): { isValid: boolean; error?: string; platform?: 'steam' | 'epic' } {
    if (!platformId) {
        return { isValid: false, error: 'Platform ID is required' };
    }

    // Check for Epic Games ID first (32-character hex string)
    if (EPIC_ID_REGEX.test(platformId)) {
        return { isValid: true, platform: 'epic' };
    }

    // Check for Steam ID (17 digits starting with 7656119)
    if (STEAM_ID_REGEX.test(platformId)) {
        return { isValid: true, platform: 'steam' };
    }

    return {
        isValid: false,
        error: 'Invalid Platform ID. Must be a Steam ID (17 digits starting with 7656119) or Epic Games Account ID (32-character hex string)'
    };
}

/**
 * Validate file upload
 */
export function validateFileUpload(file: Express.Multer.File): { isValid: boolean; error?: string } {
    if (!file) {
        return { isValid: false, error: 'No file uploaded' };
    }

    if (file.size > MAX_FILE_SIZE) {
        return { isValid: false, error: 'File too large. Maximum size is 10MB.' };
    }

    if (!file.originalname.toLowerCase().endsWith('.sav')) {
        return { isValid: false, error: 'Only .sav files are allowed' };
    }

    return { isValid: true };
}

/**
 * Validate folder upload
 */
export function validateFolderUpload(files: Express.Multer.File[]): { isValid: boolean; error?: string } {
    if (!files || files.length === 0) {
        return { isValid: false, error: 'No files uploaded' };
    }

    if (files.length > MAX_FILES_COUNT) {
        return { isValid: false, error: `Too many files. Maximum ${MAX_FILES_COUNT} files allowed` };
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_FOLDER_SIZE) {
        return { isValid: false, error: 'Files too large. Maximum total size is 50MB.' };
    }

    // Check all files are .sav
    for (const file of files) {
        if (!file.originalname.toLowerCase().endsWith('.sav')) {
            return { isValid: false, error: 'Only .sav files are allowed' };
        }
    }

    return { isValid: true };
}

/**
 * Validate YAML content for conversion
 */
export function validateYamlContent(yamlContent: any): { isValid: boolean; error?: string } {
    if (!yamlContent || typeof yamlContent !== 'string') {
        return { isValid: false, error: 'yamlContent is required and must be a string' };
    }

    if (yamlContent.trim().length === 0) {
        return { isValid: false, error: 'yamlContent cannot be empty' };
    }

    return { isValid: true };
}

/**
 * Validate session data
 */
export function validateSessionData(items: any): { isValid: boolean; error?: string } {
    if (!items || typeof items !== 'object') {
        return { isValid: false, error: 'Invalid items data' };
    }

    return { isValid: true };
}