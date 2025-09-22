import path from "path";
import fs from "fs";
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