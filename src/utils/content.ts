import path from "path";
import fs from "fs";
import fm from "front-matter";
import slugify from "slugify";
import { marked } from "marked";

/**
 * Common file operations for content directories
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
 * Get markdown files from a directory
 */
export function getMarkdownFiles(dir: string): string[] {
  return getFilesByExtensions(dir, ['.md']);
}

/**
 * Configure marked with common settings
 */
export function setupMarkedRenderer() {
  marked.use({
    renderer: {
      heading({ text, depth }) {
        // Use slugify for clean, predictable IDs
        const id = slugify(text, { lower: true, strict: true });
        return `<div class="flex items-center group">
          <h${depth} id="${id}" class="flex-1">${text}</h${depth}>
          <a href="#${id}" class="ml-2 opacity-0 group-hover:opacity-50 hover:opacity-75 transition-opacity" title="Link to this section">
            <i class="pi pi-link"></i>
          </a>
        </div>`;
      },
      code(this, code) {
        const info = code.lang || "";
        const text = code.text || "";
        const parts = info.split(/\s+/).filter(Boolean);
        const lang = parts[0] || "";
        let filename = "";

        if (lang === "mermaid") return `<pre class="mermaid">${text}</pre>`;

        parts.slice(1).forEach((p) => {
          const m = p.match(/(?:filename|title)=(.+)/);
          if (m) filename = decodeURIComponent(m[1]);
        });

        const header = filename ? `<div class="code-header">${filename}</div>` : "";

        return `<pre>${header}<code class="language-${lang}">${text}</code></pre>`;
      },
    },
  });
}

/**
 * Parse frontmatter from markdown content
 */
export function parseMarkdownContent<T>(content: string): { attributes: T; body: string } {
  return fm<T>(content);
}

/**
 * Generate slug from title or filename
 */
export function generateSlug(title?: string, filename?: string): string {
  return slugify(title || filename || '', {
    lower: true,
    strict: true,
  });
}

/**
 * Extract date from attributes or filename
 */
export function extractDate(attributes: any, filename: string): { dateStr: string; dateEpoch: number } {
  const dateStr = attributes.date || filename.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  const dateEpoch = dateStr ? new Date(dateStr).getTime() : 0;
  return { dateStr, dateEpoch };
}

/**
 * Generic function to read and parse markdown files from a directory
 */
export function getContentMeta<T>(
  dir: string, 
  transform: (attributes: any, body: string, file: string, dateStr: string, dateEpoch: number) => T
): T[] {
  const files = getMarkdownFiles(dir);
  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const { attributes, body } = parseMarkdownContent(raw);
      const { dateStr, dateEpoch } = extractDate(attributes, file);
      return transform(attributes, body, file, dateStr, dateEpoch);
    })
    .sort((a: any, b: any) => b.dateEpoch - a.dateEpoch);
}

/**
 * Generic function to get content by slug
 */
export function getContentBySlug<T extends { slug: string; file: string }>(
  dir: string,
  slug: string,
  allContent: T[],
  transform?: (attributes: any, body: string, meta: T) => any
): any | null {
  const contentMeta = allContent.find((item) => item.slug === slug);
  if (!contentMeta) return null;
  
  const raw = fs.readFileSync(path.join(dir, contentMeta.file), "utf-8");
  const { attributes, body } = parseMarkdownContent(raw);
  
  const result = {
    ...contentMeta,
    body: marked.parse(body),
    rawContent: body,
  };
  
  return transform ? transform(attributes, body, contentMeta) : result;
}