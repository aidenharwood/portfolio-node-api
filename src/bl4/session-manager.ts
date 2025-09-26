import { SaveData } from './bl4-crypto';

/**
 * Session management utilities for BL4 API
 */

// Store save data temporarily (in production, use Redis or database)
const saveDataStore: Map<string, SaveData> = new Map();

// Interface for folder file data
export interface FolderFileData {
    name: string;
    yamlContent: string;        // Raw YAML string for display
    jsonData: any;              // Parsed JSON object for editing
    size: number;
    characterInfo?: {
        name: string;
        level: string;
        className: string;
    };
}

const folderDataStore: Map<string, { files: Array<FolderFileData>, steamId: string }> = new Map();

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15);
}

/**
 * Store save data for a session
 */
export function storeSaveData(sessionId: string, saveData: SaveData): void {
    saveDataStore.set(sessionId, saveData);
}

/**
 * Retrieve save data for a session
 */
export function getSaveData(sessionId: string): SaveData | undefined {
    return saveDataStore.get(sessionId);
}

/**
 * Store folder data for a session
 */
export function storeFolderData(sessionId: string, files: Array<FolderFileData>, steamId: string): void {
    folderDataStore.set(sessionId, { files, steamId });
}

/**
 * Retrieve folder data for a session
 */
export function getFolderData(sessionId: string): { files: Array<FolderFileData>, steamId: string } | undefined {
    return folderDataStore.get(sessionId);
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
    const saveDeleted = saveDataStore.delete(sessionId);
    const folderDeleted = folderDataStore.delete(sessionId);
    return saveDeleted || folderDeleted;
}

/**
 * Clean up expired sessions (basic implementation)
 * In production, this should be more sophisticated
 */
export function cleanupExpiredSessions(): void {
    // For now, just clear all sessions (not recommended for production)
    // In a real implementation, you'd track creation time and expiry
    saveDataStore.clear();
    folderDataStore.clear();
}