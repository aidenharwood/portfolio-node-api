import path from "path";
import fs from "fs";
import slugify from "slugify";
import { marked } from "marked";
import { 
  getContentMeta, 
  getContentBySlug, 
  setupMarkedRenderer, 
  generateSlug,
  parseMarkdownContent 
} from "../utils/content";

const POSTS_DIR = path.join(process.cwd(), "blog");

// Setup marked renderer
setupMarkedRenderer();

export interface BlogPostMeta {
  title: string;
  date: string;
  slug: string;
  excerpt?: string;
  file: string;
  dateEpoch: number;
}

export interface BlogPost extends BlogPostMeta {
  body: string;
  rawContent?: string;
}

function getMarkdownFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      return [];
    }
    if (stat.isDirectory()) {
      return getMarkdownFiles(fullPath);
    }
    return file.endsWith(".md") ? [path.relative(POSTS_DIR, fullPath)] : [];
  });
}

export function getAllPostsMeta() {
  return getContentMeta<BlogPostMeta>(POSTS_DIR, (attributes, body, file, dateStr, dateEpoch) => {
    const slug = generateSlug(attributes.title, file);
    return {
      title: attributes.title || file,
      date: dateStr,
      dateEpoch,
      excerpt: attributes.excerpt || body.slice(0, 120) + "...",
      slug,
      file,
    };
  });
}

export function getPostBySlug(slug: string) {
  const posts = getAllPostsMeta();
  return getContentBySlug(POSTS_DIR, slug, posts);
}
