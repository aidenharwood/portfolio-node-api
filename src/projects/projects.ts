import path from "path";
import fs from "fs";
import slugify from "slugify";
import { marked } from "marked";
import { 
  getContentMeta, 
  getContentBySlug, 
  setupMarkedRenderer, 
  generateSlug 
} from "../utils/content";

const PROJECTS_DIR = path.join(process.cwd(), "projects");

// Setup marked renderer
setupMarkedRenderer();

export interface ProjectMeta {
  title: string;
  description: string;
  date: string;
  slug: string;
  excerpt?: string;
  tags?: string[];
  image?: string;
  github?: string;
  demo?: string;
  featured?: boolean;
  file: string;
  dateEpoch: number;
}

export interface Project extends ProjectMeta {
  body: string;
  rawContent?: string;
}

function getMarkdownFiles(dir: string): string[] {
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
      return getMarkdownFiles(fullPath);
    }
    return file.endsWith(".md") ? [path.relative(PROJECTS_DIR, fullPath)] : [];
  });
}

export function getAllProjectsMeta() {
  return getContentMeta<ProjectMeta>(PROJECTS_DIR, (attributes, body, file, dateStr, dateEpoch) => {
    const slug = attributes.slug || generateSlug(attributes.title, file);
    return {
      title: attributes.title || file,
      description: attributes.description || "",
      date: dateStr,
      dateEpoch,
      excerpt: attributes.excerpt || body.slice(0, 150) + "...",
      slug,
      tags: attributes.tags || [],
      image: attributes.image || "",
      github: attributes.github || "",
      demo: attributes.demo || "",
      featured: attributes.featured || false,
      file,
    };
  });
}

export function getProjectBySlug(slug: string) {
  const projects = getAllProjectsMeta();
  return getContentBySlug(PROJECTS_DIR, slug, projects);
}