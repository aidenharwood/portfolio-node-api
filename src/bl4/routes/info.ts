import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sendSuccess, sendError } from '../responses';

const router = express.Router();

/**
 * GET /bl4/suggested-paths
 * Get suggested file paths for BL4 save files
 */
router.get('/suggested-paths', (req, res) => {
    try {
        const username = os.userInfo().username;
        const isWindows = os.platform() === 'win32';

        const basePath = isWindows
            ? `C:/Users/${username}/My Documents/My Games/Borderlands 4/Saved/SaveGames`
            : `${os.homedir()}/Documents/My Games/Borderlands 4/Saved/SaveGames`;

        const suggestions: string[] = [];

        // Check if base path exists
        if (fs.existsSync(basePath)) {
            try {
                const steamFolders = fs.readdirSync(basePath)
                    .filter(folder => {
                        const fullPath = path.join(basePath, folder);
                        return fs.statSync(fullPath).isDirectory() &&
                               folder.match(/^7656119\d{10}$/); // Steam ID pattern
                    });

                if (steamFolders.length === 1) {
                    // Single Steam profile, point to Profiles/Client folder
                    const clientPath = path.join(basePath, steamFolders[0], 'Profiles', 'Client');
                    if (fs.existsSync(clientPath)) {
                        suggestions.push(clientPath);
                    } else {
                        suggestions.push(path.join(basePath, steamFolders[0]));
                    }
                } else if (steamFolders.length > 1) {
                    // Multiple Steam profiles, point to parent folder
                    suggestions.push(basePath);
                } else {
                    // No Steam folders found, suggest base path
                    suggestions.push(basePath);
                }
            } catch (error) {
                // Directory exists but can't read it, suggest base path
                suggestions.push(basePath);
            }
        } else {
            // Base path doesn't exist, still suggest it
            suggestions.push(basePath);
        }

        sendSuccess(res, {
            suggestions,
            currentUser: username,
            platform: os.platform()
        });

    } catch (error) {
        console.error('Error getting suggested paths:', error);
        sendError(res, 500, 'Failed to get suggested file paths');
    }
});

/**
 * GET /bl4/info
 * Get API information
 */
router.get('/info', (req, res) => {
    sendSuccess(res, {
        name: 'Borderlands 4 Save Editor API',
        version: '1.0.0',
        description: 'Upload, decrypt, edit, and download BL4 save files',
        endpoints: {
            upload: 'POST /bl4/upload - Upload and decrypt save file',
            'upload-folder': 'POST /bl4/upload-folder - Upload and decrypt multiple save files',
            items: 'GET /bl4/items/:sessionId - Get decoded items',
            update: 'PUT /bl4/items/:sessionId - Update item stats',
            download: 'POST /bl4/download/:sessionId - Download modified save',
            'download-folder': 'POST /bl4/download-folder/:sessionId - Download modified saves as ZIP',
            'convert-yaml-to-sav': 'POST /bl4/convert-yaml-to-sav - Convert YAML to SAV format',
            cleanup: 'DELETE /bl4/session/:sessionId - Clean up session',
            'suggested-paths': 'GET /bl4/suggested-paths - Get suggested save file paths',
            info: 'GET /bl4/info - Get API information'
        },
        supportedTypes: ['weapons (r)', 'equipment (e)', 'equipment_alt (d)', 'other (w,u,f,!)'],
        maxFileSize: '10MB',
        maxFolderSize: '50MB',
        maxFiles: 20,
        platformIdFormat: 'Steam ID (17 digits starting with 7656119) or Epic Games Account ID (32-character hex string)'
    });
});

export default router;