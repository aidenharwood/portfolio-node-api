import express from 'express';
import multer from 'multer';
import { validatePlatformId, validateFileUpload, validateFolderUpload } from '../validation';
import { sendError, sendSuccess } from '../responses';
import { generateSessionId, storeSaveData, storeFolderData } from '../session-manager';
import { processSingleSaveFile, processSaveFiles } from '../file-processing';

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

/**
 * POST /bl4/upload
 * Upload and decrypt a BL4 save file
 */
router.post('/upload', upload.single('saveFile'), (req, res) => {
    try {
        // Validate file upload
        const fileValidation = validateFileUpload(req.file as Express.Multer.File);
        if (!fileValidation.isValid) {
            return sendError(res, 400, fileValidation.error!);
        }

        // Validate Steam ID
        const steamIdValidation = validatePlatformId(req.body.steamId);
        if (!steamIdValidation.isValid) {
            return sendError(res, 400, steamIdValidation.error!);
        }

        const { steamId } = req.body;

        // Process the save file
        const saveData = processSingleSaveFile(req.file as Express.Multer.File, steamId);

        // Generate a session ID for this save
        const sessionId = generateSessionId();
        storeSaveData(sessionId, saveData);

        // Return session ID and decoded items for editing
        sendSuccess(res, {
            sessionId,
            itemCount: Object.keys(saveData.decodedItems).length,
            items: saveData.decodedItems
        });

    } catch (error) {
        console.error('Error processing save file:', error);
        sendError(res, 500, 'Failed to decrypt save file. Check your ID and ensure the file is valid.');
    }
});

/**
 * POST /bl4/upload-folder
 * Upload and decrypt multiple BL4 save files from a folder
 */
router.post('/upload-folder', uploadFolder.array('saveFiles', 20), (req, res) => {
    try {
        // Validate folder upload
        const folderValidation = validateFolderUpload(req.files as Express.Multer.File[]);
        if (!folderValidation.isValid) {
            return sendError(res, 400, folderValidation.error!);
        }

        // Validate Steam ID
        const steamIdValidation = validatePlatformId(req.body.steamId);
        if (!steamIdValidation.isValid) {
            return sendError(res, 400, steamIdValidation.error!);
        }

        const { steamId } = req.body;
        const files = req.files as Express.Multer.File[];

        // Process save files
        const processedFiles = processSaveFiles(files, steamId);

        if (processedFiles.length === 0) {
            return sendError(res, 400, 'No valid save files could be processed. Check your ID and file validity.');
        }

        // Generate a session ID for this folder
        const sessionId = generateSessionId();
        storeFolderData(sessionId, processedFiles, steamId);

        // Return session ID and processed files
        sendSuccess(res, {
            sessionId,
            files: processedFiles
        });

    } catch (error) {
        console.error('Error processing save folder:', error);
        sendError(res, 500, 'Failed to process save folder. Check your ID and ensure the files are valid.');
    }
});

export default router;