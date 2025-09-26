import { FolderFileData } from './session-manager';

/**
 * Character information extraction utilities
 */

/**
 * Extract character info from YAML data
 */
export function extractCharacterInfo(yamlData: any, fileName: string): FolderFileData['characterInfo'] {
    if (!yamlData || typeof yamlData !== 'object') {
        return undefined;
    }

    try {
        console.log(`Processing ${fileName} - Top level keys:`, Object.keys(yamlData));

        const characterInfo = { name: '', level: '', className: '' };

        // Extract character name from state.char_name
        if (yamlData.state && yamlData.state.char_name) {
            characterInfo.name = yamlData.state.char_name.toString();
            console.log(`Found name:`, characterInfo.name);
        }

        // Extract class from state.class
        if (yamlData.state && yamlData.state.class) {
            characterInfo.className = yamlData.state.class.toString();
            console.log(`Found class:`, characterInfo.className);
        }

        // Extract level from state.experience[0].level
        if (yamlData.state?.experience && Array.isArray(yamlData.state.experience) &&
            yamlData.state.experience[0]?.level !== undefined) {
            characterInfo.level = yamlData.state.experience[0].level.toString();
            console.log(`Found level:`, characterInfo.level);
        }

        console.log(`Final character info for ${fileName}:`, characterInfo);
        return characterInfo;

    } catch (error) {
        console.log(`Could not extract character info from ${fileName}:`, error);
        return undefined;
    }
}

/**
 * Get display name for a file based on character info
 */
export function getFileDisplayName(fileName: string, characterInfo?: FolderFileData['characterInfo']): string {
    if (fileName === 'profile.sav') {
        return 'Profile';
    }

    if (fileName.match(/\d+\.sav/)) {
        const match = fileName.match(/(\d+)\.sav/);
        const fileIndex = match ? match[1] : fileName.replace('.sav', '');

        if (characterInfo?.name) {
            return `${characterInfo.name} (${fileIndex})`;
        }
        return `Character ${fileIndex}`;
    }

    return fileName;
}

/**
 * Get icon for file type
 */
export function getFileIcon(fileName: string): string {
    if (fileName === 'profile.sav') {
        return 'pi pi-user';
    } else if (fileName.match(/\d+\.sav/)) {
        return 'pi pi-user-plus';
    }
    return 'pi pi-file';
}