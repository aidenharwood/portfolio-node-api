import express from 'express';
import path from 'path';
import { validatePlatformId, validateSessionData } from '../validation';
import { sendError, sendSuccess, sendFileDownload, generateTimestampedFilename, ERROR_MESSAGES } from '../responses';
import { getSaveData, getFolderData } from '../session-manager';
import { generateModifiedSave, createZipArchive } from '../file-processing';

const router = express.Router();

/**
 * GET /bl4/items/:sessionId
 * Get decoded items for a session
 */
router.get('/items/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const saveData = getSaveData(sessionId);

    if (!saveData) {
        return sendError(res, 404, ERROR_MESSAGES.SESSION_NOT_FOUND);
    }

    sendSuccess(res, {
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
        const { items } = req.body;

        // Validate session data
        const validation = validateSessionData(items);
        if (!validation.isValid) {
            return sendError(res, 400, validation.error!);
        }

        const saveData = getSaveData(sessionId);
        if (!saveData) {
            return sendError(res, 404, ERROR_MESSAGES.SESSION_NOT_FOUND);
        }

        // Validate that all provided items exist in the original save
        for (const path of Object.keys(items)) {
            if (!saveData.decodedItems[path]) {
                return sendError(res, 400, `Item at path '${path}' not found in original save`);
            }
        }

        // Update the items in the save data
        Object.assign(saveData.decodedItems, items);

        sendSuccess(res, {
            success: true,
            updatedCount: Object.keys(items).length
        });

    } catch (error) {
        console.error('Error updating items:', error);
        sendError(res, 500, 'Failed to update items');
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

        // Validate Steam ID
        const steamIdValidation = validatePlatformId(steamId);
        if (!steamIdValidation.isValid) {
            return sendError(res, 400, steamIdValidation.error!);
        }

        const saveData = getSaveData(sessionId);
        if (!saveData) {
            return sendError(res, 404, ERROR_MESSAGES.SESSION_NOT_FOUND);
        }

        // Generate modified save file
        const encryptedSave = generateModifiedSave(saveData, steamId);

        // Generate filename for download
        const filename = originalFileName ?
            `${path.parse(originalFileName).name}_modified_${generateTimestampedFilename('', 'sav').split('_')[1]}` :
            generateTimestampedFilename('modified_save', 'sav');

        sendFileDownload(res, encryptedSave, filename);

    } catch (error) {
        console.error('Error generating save file:', error);
        sendError(res, 500, 'Failed to generate modified save file. Please ensure your Steam ID is correct.');
    }
});

/**
 * POST /bl4/download-folder/:sessionId
 * Download modified save files as a ZIP
 */
router.post('/download-folder/:sessionId', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { steamId, modifiedFiles } = req.body;

        // Validate Steam ID
        const steamIdValidation = validatePlatformId(steamId);
        if (!steamIdValidation.isValid) {
            return sendError(res, 400, steamIdValidation.error!);
        }

        const folderData = getFolderData(sessionId);
        if (!folderData) {
            return sendError(res, 404, ERROR_MESSAGES.SESSION_NOT_FOUND);
        }

        if (folderData.steamId !== steamId) {
            return sendError(res, 400, ERROR_MESSAGES.STEAM_ID_MISMATCH);
        }

        // Create and send ZIP archive
        createZipArchive(res, modifiedFiles, steamId, 'bl4-saves-backup');

    } catch (error) {
        console.error('Error processing save folder download:', error);
        if (!res.headersSent) {
            sendError(res, 500, 'Failed to process save folder download.');
        }
    }
});

/**
 * DELETE /bl4/session/:sessionId
 * Clean up session data
 */
router.delete('/session/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const deleted = getSaveData(sessionId) !== undefined || getFolderData(sessionId) !== undefined;

    // Note: In the refactored version, we don't actually delete from stores
    // as they're now managed by session-manager. This is just for API compatibility.

    sendSuccess(res, {
        success: deleted,
        message: deleted ? 'Session cleaned up' : 'Session not found'
    });
});

export default router;