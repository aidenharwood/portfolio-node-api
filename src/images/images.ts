import path from "path";
import fs from "fs";
import { Request, Response } from "express";

const IMAGES_DIR = path.join(process.cwd(), "images");

// Supported image formats
const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.ico'];

/**
 * Get all image files recursively from subdirectories
 */
function getImageFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  
  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.lstatSync(fullPath);
    
    // Skip Git-related directories and hidden directories
    if (file.startsWith('.') || file === 'node_modules') {
      return [];
    }
    
    if (stat.isSymbolicLink()) {
      // For symlinks, resolve them and check if they point to valid image files
      try {
        const resolvedPath = fs.realpathSync(fullPath);
        const resolvedStat = fs.statSync(resolvedPath);
        
        if (resolvedStat.isFile()) {
          const ext = path.extname(resolvedPath).toLowerCase();
          if (SUPPORTED_FORMATS.includes(ext)) {
            // Return the original symlink path (not the resolved path)
            return [path.relative(IMAGES_DIR, fullPath)];
          }
        } else if (resolvedStat.isDirectory()) {
          // If symlink points to a directory, recursively scan it
          return getImageFiles(resolvedPath).map(relativePath => 
            path.join(path.relative(IMAGES_DIR, fullPath), relativePath)
          );
        }
      } catch (error) {
        // Skip broken symlinks
        console.warn(`Skipping broken symlink: ${fullPath}`);
      }
      return [];
    }
    
    if (stat.isDirectory()) {
      // Recursively get files from subdirectories
      return getImageFiles(fullPath);
    }
    
    const ext = path.extname(file).toLowerCase();
    if (SUPPORTED_FORMATS.includes(ext)) {
      // Return relative path from IMAGES_DIR
      return [path.relative(IMAGES_DIR, fullPath)];
    }
    return [];
  });
}

/**
 * Get all image paths (including subdirectories)
 */
export function getAllImages(): string[] {
  return getImageFiles(IMAGES_DIR);
}

/**
 * Serve an image file (supports nested paths)
 */
export function serveImage(req: Request, res: Response) {
  const imagePath = req.params.imagePath || req.params.filename;
  
  // Basic security: prevent directory traversal
  if (imagePath.includes('..')) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  
  const filePath = path.join(IMAGES_DIR, imagePath);
  
  // Ensure the resolved path is still within IMAGES_DIR (additional security)
  if (!filePath.startsWith(IMAGES_DIR)) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  
  // Check if file exists (using lstat to handle symlinks)
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Image not found' });
  }
  
  let actualFilePath = filePath;
  let stat = fs.lstatSync(filePath);
  
  // If it's a symlink, resolve it
  if (stat.isSymbolicLink()) {
    try {
      actualFilePath = fs.realpathSync(filePath);
      stat = fs.statSync(actualFilePath);
    } catch (error) {
      return res.status(404).json({ error: 'Broken symlink' });
    }
  }
  
  // Check if it's a file (not a directory)
  if (!stat.isFile()) {
    return res.status(400).json({ error: 'Path is not a file' });
  }
  
  // Check if it's a supported format (check the original requested path)
  const ext = path.extname(imagePath).toLowerCase();
  if (!SUPPORTED_FORMATS.includes(ext)) {
    return res.status(400).json({ error: 'Unsupported image format' });
  }
  
  // Set appropriate content type
  const contentTypes: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  
  const contentType = contentTypes[ext] || 'application/octet-stream';
  
  // Set caching headers for better performance
  res.set({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000', // Cache for 1 year
    'ETag': `"${stat.mtime.getTime()}"` // Use modification time as ETag
  });
  
  // Stream the file (use the resolved path for reading)
  const fileStream = fs.createReadStream(actualFilePath);
  fileStream.pipe(res);
  
  fileStream.on('error', (error) => {
    console.error('Error serving image:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error serving image' });
    }
  });
}