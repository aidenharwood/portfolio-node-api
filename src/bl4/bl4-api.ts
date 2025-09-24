import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as yaml from 'js-yaml';
import archiver from 'archiver';
import { 
    processSaveFile, 
    applySaveEdits, 
    SaveData, 
    DecodedItem,
    encryptYamlContentToSav
} from './bl4-crypto';

const router = express.Router();

// Configure multer for file uploads (in memory)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept .sav files
        if (file.originalname.toLowerCase().endsWith('.sav')) {
            cb(null, true);
        } else {
            cb(new Error('Only .sav files are allowed'));
        }
    }
});

// Configure multer for folder uploads (multiple files)
const uploadFolder = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB total limit
        files: 20 // Max 20 files
    },
    fileFilter: (req, file, cb) => {
        // Accept .sav files
        if (file.originalname.toLowerCase().endsWith('.sav')) {
            cb(null, true);
        } else {
            cb(new Error('Only .sav files are allowed'));
        }
    }
});

// Store save data temporarily (in production, use Redis or database)
const saveDataStore: Map<string, SaveData> = new Map();

// Interface for folder file data
interface FolderFileData {
    name: string;
    yamlContent: string;
    size: number;
    characterInfo?: {
        name: string;
        level: string;
        className: string;
    };
}

const folderDataStore: Map<string, { files: Array<FolderFileData>, steamId: string }> = new Map();

// Helper function to get nested values from objects
function getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : null;
    }, obj);
}

/**
 * POST /bl4/upload
 * Upload and decrypt a BL4 save file
 */
router.post('/upload', upload.single('saveFile'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No save file uploaded' });
        }

        const { steamId } = req.body;
        if (!steamId || !steamId.match(/^7656119\d{10}$/)) {
            return res.status(400).json({ 
                error: 'Invalid Steam ID. Must be 17 digits starting with 7656119' 
            });
        }

        // Process the save file
        const saveData = processSaveFile(req.file.buffer, steamId);
        
        // Generate a session ID for this save
        const sessionId = Math.random().toString(36).substring(2, 15);
        saveDataStore.set(sessionId, saveData);

        // Return session ID and decoded items for editing
        res.json({
            sessionId,
            itemCount: Object.keys(saveData.decodedItems).length,
            items: saveData.decodedItems
        });

    } catch (error) {
        console.error('Error processing save file:', error);
        res.status(500).json({ 
            error: 'Failed to decrypt save file. Check your Steam ID and ensure the file is valid.' 
        });
    }
});

/**
 * POST /bl4/upload-folder
 * Upload and decrypt multiple BL4 save files from a folder
 */
router.post('/upload-folder', uploadFolder.array('saveFiles', 20), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No save files uploaded' });
        }

        const { steamId } = req.body;
        if (!steamId || !steamId.match(/^7656119\d{10}$/)) {
            return res.status(400).json({ 
                error: 'Invalid Steam ID. Must be 17 digits starting with 7656119' 
            });
        }

        const files = req.files as Express.Multer.File[];
        const processedFiles: Array<FolderFileData> = [];

        // Process each save file
        for (const file of files) {
            try {
                const saveData = processSaveFile(file.buffer, steamId);
                
                // Extract character info from the YAML data for tab display
                let characterInfo = { name: '', level: '', className: '' };
                try {
                    const yamlData = saveData.yamlData;
                    if (yamlData && typeof yamlData === 'object') {
                        console.log(`Processing ${file.originalname} - Top level keys:`, Object.keys(yamlData));
                        
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
                        if (yamlData.state.experience && Array.isArray(yamlData.state.experience) && 
                            yamlData.state.experience[0] && yamlData.state.experience[0].level !== undefined) {
                            characterInfo.level = yamlData.state.experience[0].level.toString();
                            console.log(`Found level:`, characterInfo.level);
                        }
                        
                        console.log(`Final character info for ${file.originalname}:`, characterInfo);
                    }
                } catch (infoError) {
                    console.log(`Could not extract character info from ${file.originalname}:`, infoError);
                }
                
                processedFiles.push({
                    name: file.originalname,
                    yamlContent: saveData.originalYaml, // Use raw YAML instead of abstracted data
                    size: file.size,
                    characterInfo // Add character info for tab display
                });
            } catch (error) {
                console.error(`Error processing file ${file.originalname}:`, error);
                // Skip files that can't be processed but continue with others
            }
        }

        if (processedFiles.length === 0) {
            return res.status(400).json({ 
                error: 'No valid save files could be processed. Check your Steam ID and file validity.' 
            });
        }

        // Generate a session ID for this folder
        const sessionId = Math.random().toString(36).substring(2, 15);
        folderDataStore.set(sessionId, {
            files: processedFiles,
            steamId
        });

        // Return session ID and processed files
        res.json({
            sessionId,
            files: processedFiles
        });

    } catch (error) {
        console.error('Error processing save folder:', error);
        res.status(500).json({ 
            error: 'Failed to process save folder. Check your Steam ID and ensure the files are valid.' 
        });
    }
});

/**
 * GET /bl4/items/:sessionId
 * Get decoded items for a session
 */
router.get('/items/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const saveData = saveDataStore.get(sessionId);

    if (!saveData) {
        return res.status(404).json({ error: 'Session not found or expired' });
    }

    res.json({
        items: saveData.decodedItems,
        itemCount: Object.keys(saveData.decodedItems).length
    });
});

/**
 * PUT /bl4/items/:sessionId
 * Update item stats for a session
 */
router.put('/items/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { items }: { items: { [path: string]: DecodedItem } } = req.body;

        const saveData = saveDataStore.get(sessionId);
        if (!saveData) {
            return res.status(404).json({ error: 'Session not found or expired' });
        }

        if (!items || typeof items !== 'object') {
            return res.status(400).json({ error: 'Invalid items data' });
        }

        // Validate that all provided items exist in the original save
        for (const path of Object.keys(items)) {
            if (!saveData.decodedItems[path]) {
                return res.status(400).json({ 
                    error: `Item at path '${path}' not found in original save` 
                });
            }
        }

        // Update the items in the save data
        Object.assign(saveData.decodedItems, items);
        saveDataStore.set(sessionId, saveData);

        res.json({ 
            success: true, 
            updatedCount: Object.keys(items).length 
        });

    } catch (error) {
        console.error('Error updating items:', error);
        res.status(500).json({ error: 'Failed to update items' });
    }
});

/**
 * POST /bl4/download/:sessionId
 * Generate and download the modified save file with backup creation
 */
router.post('/download/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { steamId, originalFileName } = req.body;

        if (!steamId || !steamId.match(/^7656119\d{10}$/)) {
            return res.status(400).json({ 
                error: 'Invalid Steam ID. Must be 17 digits starting with 7656119' 
            });
        }

        const saveData = saveDataStore.get(sessionId);
        if (!saveData) {
            return res.status(404).json({ error: 'Session not found or expired' });
        }

        // Apply edits and encrypt the save file
        const encryptedSave = applySaveEdits(saveData, saveData.decodedItems, steamId);
        
        // Verify the encryption was successful by attempting to decrypt it
        try {
            processSaveFile(encryptedSave, steamId);
        } catch (verifyError) {
            console.error('Verification failed:', verifyError);
            return res.status(500).json({ 
                error: 'Generated save file failed verification. Please check your Steam ID and try again.' 
            });
        }

        // Generate filename for download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = originalFileName ? 
            `${path.parse(originalFileName).name}_modified_${timestamp}.sav` : 
            `modified_save_${timestamp}.sav`;

        // Set headers for file download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', encryptedSave.length);

        res.send(encryptedSave);

    } catch (error) {
        console.error('Error generating save file:', error);
        res.status(500).json({ 
            error: 'Failed to generate modified save file. Please ensure your Steam ID is correct.' 
        });
    }
});

/**
 * POST /bl4/download-folder/:sessionId
 * Download modified save files as a ZIP
 */
router.post('/download-folder/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { steamId, modifiedFiles }: { steamId: string, modifiedFiles: Array<{ name: string, yamlContent: string }> } = req.body;

        const folderData = folderDataStore.get(sessionId);
        if (!folderData) {
            return res.status(404).json({ error: 'Session not found or expired' });
        }

        if (folderData.steamId !== steamId) {
            return res.status(400).json({ error: 'Steam ID mismatch' });
        }

        // Create ZIP archive
        const archive = archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

        // Set response headers for ZIP download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `bl4-saves-backup-${timestamp}.zip`;
        
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-cache');

        // Pipe archive to response
        archive.pipe(res);

        // Process each modified file
        for (const modifiedFile of modifiedFiles) {
            try {
                // Re-encrypt the YAML content back to save file format
                const encryptedSaveData = encryptYamlContentToSav(modifiedFile.yamlContent, steamId);
                
                // Add to ZIP archive
                archive.append(encryptedSaveData, { 
                    name: modifiedFile.name
                });
                
                console.log(`Added ${modifiedFile.name} to ZIP (${encryptedSaveData.length} bytes)`);
            } catch (error) {
                console.error(`Error processing ${modifiedFile.name}:`, error);
                // Continue with other files rather than failing the entire ZIP
            }
        }

        // Handle archive events
        archive.on('error', (err) => {
            console.error('Archive error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to create ZIP archive' });
            }
        });

        archive.on('end', () => {
            console.log(`ZIP archive completed: ${archive.pointer()} bytes`);
        });

        // Finalize the archive
        archive.finalize();

    } catch (error) {
        console.error('Error processing save folder download:', error);
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Failed to process save folder download.' 
            });
        }
    }
});

/**
 * DELETE /bl4/session/:sessionId
 * Clean up session data
 */
router.delete('/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const deleted = saveDataStore.delete(sessionId);
    
    res.json({ 
        success: deleted,
        message: deleted ? 'Session cleaned up' : 'Session not found'
    });
});

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
        
        res.json({
            suggestions,
            currentUser: username,
            platform: os.platform()
        });
        
    } catch (error) {
        console.error('Error getting suggested paths:', error);
        res.status(500).json({ error: 'Failed to get suggested file paths' });
    }
});

/**
 * GET /bl4/info
 * Get API information
 */
router.get('/info', (req, res) => {
    res.json({
        name: 'Borderlands 4 Save Editor API',
        version: '1.0.0',
        description: 'Upload, decrypt, edit, and download BL4 save files',
        endpoints: {
            upload: 'POST /bl4/upload - Upload and decrypt save file',
            items: 'GET /bl4/items/:sessionId - Get decoded items',
            update: 'PUT /bl4/items/:sessionId - Update item stats',
            download: 'POST /bl4/download/:sessionId - Download modified save',
            cleanup: 'DELETE /bl4/session/:sessionId - Clean up session'
        },
        supportedTypes: ['weapons (r)', 'equipment (e)', 'equipment_alt (d)', 'other (w,u,f,!)'],
        maxFileSize: '10MB',
        steamIdFormat: '17 digits starting with 7656119'
    });
});

// Error handling middleware
router.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
        }
        return res.status(400).json({ error: error.message });
    }
    
    if (error.message === 'Only .sav files are allowed') {
        return res.status(400).json({ error: error.message });
    }
    
    console.error('BL4 API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
});

export default router;