import express from 'express';
import multer from 'multer';
import uploadRoutes from './routes/upload';
import downloadRoutes from './routes/download';
import convertRoutes from './routes/convert';
import verifyRoutes from './routes/verify';
import debugRoutes from './routes/debug';
import infoRoutes from './routes/info';
import { sendError } from './responses';

const router = express.Router();

// Mount route modules
router.use('/', uploadRoutes);
router.use('/', downloadRoutes);
router.use('/', convertRoutes);
router.use('/', verifyRoutes);
router.use('/', debugRoutes);
router.use('/', infoRoutes);

// Error handling middleware
router.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return sendError(res, 400, 'File too large. Maximum size is 10MB.');
        }
        return sendError(res, 400, error.message);
    }

    if (error.message === 'Only .sav files are allowed') {
        return sendError(res, 400, error.message);
    }

    console.error('BL4 API Error:', error);
    sendError(res, 500, 'Internal server error');
});

export default router;