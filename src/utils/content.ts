import path from "path";
import fs from "fs";
import fm from "front-matter";
import slugify from "slugify";
import { marked } from "marked";

/**
 * Common file operations for content directories
 */

/**
 * Resolve the actual directory path, handling git-sync symlink structure
 */
function resolveContentDirectory(dir: string): string {
  if (!fs.existsSync(dir)) {
    return dir;
  }
  
  // Check if there's a 'current' symlink (git-sync structure)
  const currentPath = path.join(dir, 'current');
  if (fs.existsSync(currentPath)) {
    const stat = fs.lstatSync(currentPath);
    if (stat.isSymbolicLink()) {
      try {
        // Resolve the symlink to get the actual directory
        const resolvedPath = fs.realpathSync(currentPath);
        if (fs.existsSync(resolvedPath)) {
          return resolvedPath;
        }
      } catch (error) {
        console.warn(`Failed to resolve symlink ${currentPath}:`, error);
      }
    }
  }
  
  return dir;
}

/**
 * Get all files with specified extensions recursively from a directory
 */
export function getFilesByExtensions(dir: string, extensions: string[]): string[] {
  const resolvedDir = resolveContentDirectory(dir);
  
  if (!fs.existsSync(resolvedDir)) {
    return [];
  }
  
  return fs.readdirSync(resolvedDir).flatMap((file) => {
    const fullPath = path.join(resolvedDir, file);
    const stat = fs.lstatSync(fullPath);
    
    if (stat.isSymbolicLink()) {
      // Handle symlinks by resolving them
      try {
        const resolvedPath = fs.realpathSync(fullPath);
        const resolvedStat = fs.statSync(resolvedPath);
        
        if (resolvedStat.isDirectory()) {
          return getFilesByExtensions(fullPath, extensions).map(subFile => path.join(file, subFile));
        } else if (resolvedStat.isFile()) {
          const ext = path.extname(file).toLowerCase();
          return extensions.includes(ext) ? [file] : [];
        }
      } catch (error) {
        console.warn(`Failed to resolve symlink ${fullPath}:`, error);
      }
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

        // Parse filename from various formats: filename=, title=, or just the filename
        parts.slice(1).forEach((p) => {
          const filenameMatch = p.match(/(?:filename|title)=(.+)/);
          if (filenameMatch) {
            filename = decodeURIComponent(filenameMatch[1]);
          } else if (!filename && p.includes('.')) {
            // If no explicit filename= but there's a part with a dot, treat it as filename
            filename = p;
          }
        });

        const languageClass = lang ? `language-${lang}` : 'language-text';
        const header = filename ? 
          `<div class="markdown-code-header">📄 ${filename}</div>` : "";

        // Use unique class names to avoid conflicts with existing CSS
        return `${header}<pre class="markdown-code-block ${languageClass}"><code>${text}</code></pre>

        <style>
        .markdown-code-header {
          background: #f6f8fa !important;
          color: #24292f !important;
          padding: 0.5rem 1rem !important;
          font-size: 0.875rem !important;
          font-weight: 500 !important;
          border: 1px solid #d0d7de !important;
          border-bottom: none !important;
          border-radius: 0.375rem 0.375rem 0 0 !important;
          margin: 1rem 0 0 0 !important;
          font-family: ui-monospace, 'SF Mono', monospace !important;
        }
        
        .markdown-code-block {
          background: #f6f8fa !important;
          color: #24292f !important;
          border: 1px solid #d0d7de !important;
          border-radius: 0.375rem !important;
          padding: 1rem !important;
          margin: 1rem 0 !important;
          overflow-x: auto !important;
          line-height: 1.45 !important;
          font-family: ui-monospace, 'SF Mono', 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace !important;
        }
        
        .markdown-code-header + .markdown-code-block {
          border-radius: 0 0 0.375rem 0.375rem !important;
          margin-top: 0 !important;
        }
        
        .markdown-code-block code {
          background: transparent !important;
          padding: 0 !important;
          border: none !important;
          font-size: inherit !important;
          color: inherit !important;
        }
        
        @media (prefers-color-scheme: dark) {
          .markdown-code-header {
            background: #161b22 !important;
            color: #e6edf3 !important;
            border-color: #30363d !important;
          }
          .markdown-code-block {
            background: #0d1117 !important;
            color: #e6edf3 !important;
            border-color: #30363d !important;
          }
        }
        
        .dark .markdown-code-header {
          background: #161b22 !important;
          color: #e6edf3 !important;
          border-color: #30363d !important;
        }
        
        .dark .markdown-code-block {
          background: #0d1117 !important;
          color: #e6edf3 !important;
          border-color: #30363d !important;
        }
        </style>`;
      },
      codespan(code) {
        // Use unique class for inline code to avoid conflicts
        return `<code class="markdown-inline-code">${code}</code>
        <style>
        .markdown-inline-code {
          background: #f6f8fa !important;
          color: #d73a49 !important;
          padding: 0.2em 0.4em !important;
          border-radius: 0.25rem !important;
          font-size: 0.875em !important;
          font-family: ui-monospace, 'SF Mono', monospace !important;
          border: 1px solid #d0d7de !important;
        }
        
        @media (prefers-color-scheme: dark) {
          .markdown-inline-code {
            background: #161b22 !important;
            color: #f85149 !important;
            border-color: #30363d !important;
          }
        }
        
        .dark .markdown-inline-code {
          background: #161b22 !important;
          color: #f85149 !important;
          border-color: #30363d !important;
        }
        </style>`;
      },
      blockquote(quote) {
        // Enhanced blockquote styling with fallback colors
        return `<blockquote style="border-left: 4px solid #0969da; background: #f6f8fa; padding: 1rem; margin: 1rem 0; font-style: italic; color: #24292f; border-radius: 0 0.375rem 0.375rem 0;">
          ${quote}
        </blockquote>
        <style>
        .dark blockquote {
          border-left-color: #2f81f7 !important;
          background: #161b22 !important;
          color: #e6edf3 !important;
        }
        </style>`;
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
  const resolvedDir = resolveContentDirectory(dir);
  const files = getMarkdownFiles(dir);
  
  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(resolvedDir, file), "utf-8");
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
  const resolvedDir = resolveContentDirectory(dir);
  const contentMeta = allContent.find((item) => item.slug === slug);
  if (!contentMeta) return null;
  
  const raw = fs.readFileSync(path.join(resolvedDir, contentMeta.file), "utf-8");
  const { attributes, body } = parseMarkdownContent(raw);
  
  const result = {
    ...contentMeta,
    body: marked.parse(body),
    rawContent: body,
  };
  
  return transform ? transform(attributes, body, contentMeta) : result;
}