import express from 'express';
import { validatePlatformId, validateYamlContent } from '../validation';
import { sendError, sendFileDownload, generateTimestampedFilename } from '../responses';
import { convertYamlToSav } from '../file-processing';

const router = express.Router();

/**
 * POST /bl4/convert-yaml-to-sav
 * Convert YAML content directly to SAV format without requiring a session
 */
router.post('/convert-yaml-to-sav', (req, res) => {
    try {
        const { yamlContent, steamId } = req.body;

        // Validate inputs
        const yamlValidation = validateYamlContent(yamlContent);
        if (!yamlValidation.isValid) {
            return sendError(res, 400, yamlValidation.error!);
        }

        const steamIdValidation = validatePlatformId(steamId);
        if (!steamIdValidation.isValid) {
            return sendError(res, 400, steamIdValidation.error!);
        }

        // Convert YAML to SAV
        const encryptedSave = convertYamlToSav(yamlContent, steamId);

        // Generate filename for download
        const filename = generateTimestampedFilename('yaml_to_sav', 'sav');

        sendFileDownload(res, encryptedSave, filename);

    } catch (error) {
        console.error('Error converting YAML to SAV:', error);
        sendError(res, 500, 'Failed to convert YAML to SAV. Please check your YAML content and Steam ID.');
    }
});

export default router;