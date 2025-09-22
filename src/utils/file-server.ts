import path from "path";
import fs from "fs";
import { Request, Response } from "express";

/**
 * Common file operations
 */

/**
 * Get all files with specified extensions recursively from a directory
 */
export function getFilesByExtensions(dir: string, extensions: string[]): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.lstatSync(fullPath);
    
    if (stat.isSymbolicLink()) {
      return [];
    }
    
    if (stat.isDirectory()) {
      return getFilesByExtensions(fullPath, extensions).map(subFile => path.join(file, subFile));
    }
    
    const ext = path.extname(file).toLowerCase();
    return extensions.includes(ext) ? [file] : [];
  });
}

/**
 * Common file serving utilities
 */

/**
 * Serve a file with appropriate headers and error handling
 */
export function serveFile(
  req: Request,
  res: Response,
  baseDir: string,
  allowedExtensions: string[],
  contentTypes: { [key: string]: string },
  pathParam: string = 'filename'
) {
  const filePath = req.params[pathParam];
  
  // Basic security: prevent directory traversal
  if (!filePath || filePath.includes('..')) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  
  // Construct the full file path
  const fullPath = path.join(baseDir, filePath);
  
  // Check if file exists
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  let stat;
  try {
    stat = fs.lstatSync(fullPath);
    
    // If it's a symlink, resolve it
    if (stat.isSymbolicLink()) {
      const resolvedPath = fs.realpathSync(fullPath);
      stat = fs.statSync(resolvedPath);
    }
  } catch (error) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Check if it's a file (not a directory)
  if (!stat.isFile()) {
    return res.status(400).json({ error: 'Path is not a file' });
  }
  
  // Check if it's a supported format
  const ext = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return res.status(400).json({ error: 'Unsupported file format' });
  }
  
  const contentType = contentTypes[ext] || 'application/octet-stream';
  
  // Set caching headers for better performance
  res.set({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
    'ETag': `"${stat.mtime.getTime()}"` // Use modification time as ETag
  });
  
  // Stream the file
  const fileStream = fs.createReadStream(fullPath);
  fileStream.pipe(res);
  
  fileStream.on('error', (error) => {
    console.error('Error serving file:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error serving file' });
    }
  });
}

/**
 * Common content types for different file extensions
 */
export const IMAGE_CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

export const SUPPORTED_IMAGE_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'];