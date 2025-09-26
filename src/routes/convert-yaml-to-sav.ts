import express from 'express';
import { encryptYamlContentToSav } from '../bl4/bl4-crypto';

const router = express.Router();

/**
 * POST /convert-yaml-to-sav
 * Convert YAML content to SAV format
 */
router.post('/convert-yaml-to-sav', express.json({ limit: '50mb' }), (req, res) => {
    try {
        const { yamlContent, steamId } = req.body;

        if (!yamlContent) {
            return res.status(400).json({ error: 'No YAML content provided' });
        }

        if (!steamId || !steamId.match(/^7656119\d{10}$/)) {
            return res.status(400).json({
                error: 'Invalid Steam ID. Must be 17 digits starting with 7656119'
            });
        }

        // Convert YAML to SAV
        const encryptedSaveData = encryptYamlContentToSav(yamlContent, steamId);

        // Generate filename for download
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `converted_save_${timestamp}.sav`;

        // Set headers for file download
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', encryptedSaveData.length);

        res.send(encryptedSaveData);

    } catch (error) {
        console.error('Error converting YAML to SAV:', error);
        res.status(500).json({
            error: 'Failed to convert YAML to SAV. Check your Steam ID and YAML content.'
        });
    }
});

export default router;