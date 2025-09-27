import express from 'express';
import { validatePlatformId, validateYamlContent } from '../validation';
import { sendError, sendSuccess } from '../responses';
import { convertYamlToSav } from '../file-processing';
import { decryptSavToYaml } from '../bl4-crypto';

const router = express.Router();

/**
 * POST /bl4/verify-roundtrip
 * Body: { yamlContent: string, steamId: string }
 * Returns: { ok: boolean, message?: string, diff?: { before: string, after: string } }
 */
router.post('/verify-roundtrip', express.json({ limit: '50mb' }), (req, res) => {
    try {
        const { yamlContent, steamId } = req.body;

        const yamlValidation = validateYamlContent(yamlContent);
        if (!yamlValidation.isValid) return sendError(res, 400, yamlValidation.error!);

        const sidValidation = validatePlatformId(steamId);
        if (!sidValidation.isValid) return sendError(res, 400, sidValidation.error!);

        // Convert YAML -> SAV (Buffer)
        const savBuffer = convertYamlToSav(yamlContent, steamId);

        // Decrypt SAV -> YAML
        const roundtripYamlBuffer = decryptSavToYaml(savBuffer, steamId);
        const roundtripYaml = roundtripYamlBuffer.toString('utf-8');

        // Compare strings
        if (roundtripYaml === yamlContent) {
            return sendSuccess(res, { ok: true, message: 'Roundtrip identical' });
        }

        return sendSuccess(res, { ok: false, message: 'Roundtrip differs', diff: { before: yamlContent, after: roundtripYaml } });
    } catch (error) {
        console.error('Verify error:', error);
        return sendError(res, 500, (error as Error).message || 'Verification failed');
    }
});

export default router;
