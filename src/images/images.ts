import path from "path";
import { Request, Response } from "express";
import { getFilesByExtensions } from "../utils/content";
import { 
  serveFile, 
  SUPPORTED_IMAGE_FORMATS, 
  IMAGE_CONTENT_TYPES 
} from "../utils/file-server";

const IMAGES_DIR = path.join(process.cwd(), "images");

/**
 * Get all image paths (including subdirectories)
 */
export function getAllImages(): string[] {
  return getFilesByExtensions(IMAGES_DIR, SUPPORTED_IMAGE_FORMATS);
}

/**
 * Serve an image file (supports nested paths)
 */
export function serveImage(req: Request, res: Response) {
  const pathParam = req.params.imagePath ? 'imagePath' : 'filename';
  return serveFile(req, res, IMAGES_DIR, SUPPORTED_IMAGE_FORMATS, IMAGE_CONTENT_TYPES, pathParam);
}