import express from 'express';
import { validatePlatformId, validateYamlContent } from '../validation';
import { sendError, sendFileDownload, generateTimestampedFilename } from '../responses';
import { convertYamlToSav } from '../file-processing';

const router = express.Router();

/**
 * POST /bl4/convert-yaml-to-sav
 * Convert YAML content directly to SAV format without requiring a session
 */
// Use JSON body parser for this route to ensure large payloads are handled
router.post('/convert-yaml-to-sav', express.json({ limit: '50mb' }), async (req, res) => {
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

        // If client requested a ZIP (zip=true), package the .sav in a ZIP response
        const asZip = req.query.zip === 'true' || req.query.zip === '1'

        if (asZip) {
            // Lazy import archiver to avoid pulling it into every request
            const archiver = (await import('archiver')).default
            res.setHeader('Content-Type', 'application/zip');
            const zipFilename = filename.replace(/\.sav$/i, '') + '.zip'
            res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
            const archive = archiver('zip', { zlib: { level: 9 } })
            archive.pipe(res)

            const savName = filename
            archive.append(encryptedSave, { name: savName })
            archive.finalize()
            return
        }

        // Send as raw binary with explicit headers to avoid accidental encoding
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', encryptedSave.length.toString());
        res.send(encryptedSave);

    } catch (error) {
        console.error('Error converting YAML to SAV:', error);
        sendError(res, 500, 'Failed to convert YAML to SAV. Please check your YAML content and Steam ID.');
    }
});

export default router;