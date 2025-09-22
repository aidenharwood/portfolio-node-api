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
  
  const results: string[] = [];
  
  function scanDirectory(currentDir: string, relativePath: string = '') {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.lstatSync(fullPath);
      
      // Skip Git-related directories and hidden directories
      if (item.startsWith('.') || item === 'node_modules') {
        continue;
      }
      
      if (stat.isSymbolicLink()) {
        // For symlinks, resolve them and check if they point to valid image files
        try {
          const resolvedPath = fs.realpathSync(fullPath);
          const resolvedStat = fs.statSync(resolvedPath);
          
          if (resolvedStat.isFile()) {
            const ext = path.extname(resolvedPath).toLowerCase();
            if (SUPPORTED_FORMATS.includes(ext)) {
              const itemRelativePath = relativePath ? path.join(relativePath, item) : item;
              results.push(itemRelativePath);
            }
          } else if (resolvedStat.isDirectory()) {
            // If symlink points to a directory, recursively scan it
            const itemRelativePath = relativePath ? path.join(relativePath, item) : item;
            scanDirectory(resolvedPath, itemRelativePath);
          }
        } catch (error) {
          // Skip broken symlinks
          console.warn(`Skipping broken symlink: ${fullPath}`);
        }
        continue;
      }
      
      if (stat.isDirectory()) {
        // Recursively scan subdirectories
        const itemRelativePath = relativePath ? path.join(relativePath, item) : item;
        scanDirectory(fullPath, itemRelativePath);
      } else {
        // Check if it's a supported image format
        const ext = path.extname(item).toLowerCase();
        if (SUPPORTED_FORMATS.includes(ext)) {
          const itemRelativePath = relativePath ? path.join(relativePath, item) : item;
          results.push(itemRelativePath);
        }
      }
    }
  }
  
  scanDirectory(dir);
  
  // Clean up worktree paths from all results
  return results.map(filePath => {
    // Remove any worktree prefix patterns
    const cleanPath = filePath.replace(/^[^/\\]+\.git[/\\]\.worktrees[/\\][^/\\]+[/\\]/, '');
    return cleanPath;
  }).filter(cleanPath => cleanPath && !cleanPath.includes('.git'));
}

/**
 * Get all image paths (including subdirectories)
 */
export function getAllImages(): string[] {
  return getImageFiles(IMAGES_DIR);
}

/**
 * Find the actual file path, handling worktree structures
 */
function findActualImagePath(imagePath: string): string | null {
  const directPath = path.join(IMAGES_DIR, imagePath);
  
  // First try the direct path
  if (fs.existsSync(directPath)) {
    return directPath;
  }
  
  // If not found, search in worktree directories
  try {
    const imageDir = fs.readdirSync(IMAGES_DIR);
    for (const item of imageDir) {
      const itemPath = path.join(IMAGES_DIR, item);
      const stat = fs.lstatSync(itemPath);
      
      if (stat.isDirectory() && item.endsWith('.git')) {
        // Look in the .worktrees directory
        const worktreesPath = path.join(itemPath, '.worktrees');
        if (fs.existsSync(worktreesPath)) {
          const worktrees = fs.readdirSync(worktreesPath);
          for (const worktree of worktrees) {
            const worktreePath = path.join(worktreesPath, worktree);
            const possiblePath = path.join(worktreePath, imagePath);
            if (fs.existsSync(possiblePath)) {
              return possiblePath;
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error searching for image:', error);
  }
  
  return null;
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
  
  // Find the actual file path (handles worktree resolution)
  const actualFilePath = findActualImagePath(imagePath);
  
  if (!actualFilePath) {
    return res.status(404).json({ error: 'Image not found' });
  }
  
  let stat;
  try {
    stat = fs.lstatSync(actualFilePath);
    
    // If it's a symlink, resolve it
    if (stat.isSymbolicLink()) {
      const resolvedPath = fs.realpathSync(actualFilePath);
      stat = fs.statSync(resolvedPath);
    }
  } catch (error) {
    return res.status(404).json({ error: 'Image not found' });
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