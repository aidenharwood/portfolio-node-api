import * as yaml from 'js-yaml';
import archiver from 'archiver';
import { Response } from 'express';
import { processSaveFile, applySaveEdits, SaveData, encryptYamlContentToSav } from './bl4-crypto';
import { FolderFileData } from './session-manager';
import { extractCharacterInfo } from './character-info';
import { sendZipDownload, ERROR_MESSAGES } from './responses';

/**
 * File processing utilities for BL4 API
 */

/**
 * Process a single save file
 */
export function processSingleSaveFile(file: Express.Multer.File, steamId: string): SaveData {
    return processSaveFile(file.buffer, steamId);
}

/**
 * Process multiple save files for folder upload
 */
export function processSaveFiles(files: Express.Multer.File[], steamId: string): Array<FolderFileData> {
    const processedFiles: Array<FolderFileData> = [];

    for (const file of files) {
        try {
            const saveData = processSaveFile(file.buffer, steamId);
            const characterInfo = extractCharacterInfo(saveData.yamlData, file.originalname);

            processedFiles.push({
                name: file.originalname,
                yamlContent: saveData.originalYaml,
                jsonData: saveData.yamlData,
                size: file.size,
                characterInfo
            });
        } catch (error) {
            console.error(`Error processing file ${file.originalname}:`, error);
            // Skip files that can't be processed but continue with others
        }
    }

    return processedFiles;
}

/**
 * Apply edits to save data and generate encrypted file
 */
export function generateModifiedSave(saveData: SaveData, steamId: string): Buffer {
    const encryptedSave = applySaveEdits(saveData, saveData.decodedItems, steamId);

    // Verify the encryption was successful
    try {
        processSaveFile(encryptedSave, steamId);
    } catch (verifyError) {
        console.error('Verification failed:', verifyError);
        throw new Error(ERROR_MESSAGES.VERIFICATION_FAILED);
    }

    return encryptedSave;
}

/**
 * Convert YAML content to SAV format
 */
export function convertYamlToSav(yamlContent: string, steamId: string): Buffer {
    const encryptedSave = encryptYamlContentToSav(yamlContent, steamId);

    // Verify the encryption was successful
    try {
        processSaveFile(encryptedSave, steamId);
    } catch (verifyError) {
        console.error('Verification failed:', verifyError);
        throw new Error(ERROR_MESSAGES.VERIFICATION_FAILED);
    }

    return encryptedSave;
}

/**
 * Create ZIP archive from modified files
 */
export function createZipArchive(
    res: Response,
    modifiedFiles: Array<{
        name: string,
        jsonData?: any,
        yamlContent?: string
    }>,
    steamId: string,
    filename: string
): void {
    const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
    });

    sendZipDownload(res, filename);
    archive.pipe(res);

    // Process each modified file
    for (const modifiedFile of modifiedFiles) {
        try {
            let yamlContent: string;

            // Convert JSON data to YAML if provided, otherwise use yamlContent
            if (modifiedFile.jsonData) {
                yamlContent = yaml.dump(modifiedFile.jsonData, {
                    indent: 2,
                    lineWidth: -1,
                    noRefs: true,
                    sortKeys: false
                });
            } else if (modifiedFile.yamlContent) {
                yamlContent = modifiedFile.yamlContent;
            } else {
                throw new Error('No valid data provided for file');
            }

            // Re-encrypt the YAML content back to save file format
            const encryptedSaveData = encryptYamlContentToSav(yamlContent, steamId);

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
            throw new Error(ERROR_MESSAGES.ARCHIVE_ERROR);
        }
    });

    archive.on('end', () => {
        console.log(`ZIP archive completed: ${archive.pointer()} bytes`);
    });

    // Finalize the archive
    archive.finalize();
}