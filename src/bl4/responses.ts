import { Response } from 'express';

/**
 * Response utilities for BL4 API
 */

/**
 * Send standardized error response
 */
export function sendError(res: Response, statusCode: number, error: string): void {
    res.status(statusCode).json({ error });
}

/**
 * Send standardized success response
 */
export function sendSuccess(res: Response, data: any): void {
    res.json(data);
}

/**
 * Send file download response
 */
export function sendFileDownload(
    res: Response,
    buffer: Buffer,
    filename: string,
    contentType: string = 'application/octet-stream'
): void {
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
}

/**
 * Send ZIP download response
 */
export function sendZipDownload(res: Response, filename: string): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const zipFilename = `${filename}-${timestamp}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
    res.setHeader('Cache-Control', 'no-cache');
}

/**
 * Generate timestamped filename
 */
export function generateTimestampedFilename(baseName: string, extension: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `${baseName}_${timestamp}.${extension}`;
}

/**
 * Common error messages
 */
export const ERROR_MESSAGES = {
    SESSION_NOT_FOUND: 'Session not found or expired',
    STEAM_ID_MISMATCH: 'Steam ID mismatch',
    INVALID_SESSION_DATA: 'Invalid session data',
    PROCESSING_FAILED: 'Failed to process request',
    VERIFICATION_FAILED: 'Generated file failed verification',
    ARCHIVE_ERROR: 'Failed to create archive'
} as const;