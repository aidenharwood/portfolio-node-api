import express from 'express';
import multer from 'multer';
import { deriveKey, decryptSavToYaml } from '../bl4-crypto';
import { sendError, sendSuccess } from '../responses';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/debug/derive-key', express.json(), (req, res) => {
    try {
        const { steamId } = req.body;
        if (!steamId) return sendError(res, 400, 'steamId required');
        const key = deriveKey(steamId);
        return sendSuccess(res, { key: key.toString('hex') });
    } catch (err) {
        return sendError(res, 500, (err as Error).message || 'derive key failed');
    }
});

router.post('/debug/decrypt-check', upload.single('saveFile'), (req, res) => {
    try {
        const file = req.file;
        const steamId = req.body.steamId;
        if (!file) return sendError(res, 400, 'saveFile required');
        if (!steamId) return sendError(res, 400, 'steamId required');

        try {
            const yamlBuf = decryptSavToYaml(file.buffer, steamId);
            const snippet = yamlBuf.slice(0, 1024).toString('utf-8');
            return sendSuccess(res, { ok: true, snippet });
        } catch (err) {
            return sendSuccess(res, { ok: false, error: (err as Error).message });
        }
    } catch (err) {
        return sendError(res, 500, (err as Error).message || 'decrypt check failed');
    }
});

export default router;
