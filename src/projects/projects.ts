import path from "path";
import fs from "fs";
import fm from "front-matter";
import slugify from "slugify";
import { marked } from "marked";

const PROJECTS_DIR = path.join(process.cwd(), "projects");

marked.use({
  renderer: {
    heading({ text, depth }) {
      // Use slugify for clean, predictable IDs
      const id = slugify(text, { lower: true, strict: true });
      return `<div class="flex items-center group">
        <h${depth} id="${id}" class="flex-1">${text}</h${depth}>
        <a href="#${id}" class="ml-2 opacity-0 group-hover:opacity-50 hover:opacity-75 transition-opacity" title="Link to this section">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path>
          </svg>
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
  body: string | Promise<string>;
  rawContent?: string;
  file: string;
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
  const files = getMarkdownFiles(PROJECTS_DIR);
  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(PROJECTS_DIR, file), "utf-8");
      const { attributes, body } = fm<ProjectMeta>(raw);
      const slug = attributes.slug || slugify(attributes.title || file, {
        lower: true,
        strict: true,
      });
      const dateStr =
        attributes.date || file.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
      const dateEpoch = dateStr ? new Date(dateStr).getTime() : 0;
      return {
        title: attributes.title || file,
        description: attributes.description || "",
        date: dateStr, // Send raw date string, let frontend format it
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
    })
    .sort((a, b) => b.dateEpoch - a.dateEpoch);
}

export function getProjectBySlug(slug: string) {
  const projects = getAllProjectsMeta();
  const projectMeta = projects.find((p) => p.slug === slug);
  if (!projectMeta) return null;
  const raw = fs.readFileSync(path.join(PROJECTS_DIR, projectMeta.file), "utf-8");
  const { attributes, body } = fm(raw);
  return {
    ...projectMeta,
    body: marked.parse(body),
    rawContent: body, // Include raw markdown content
    date: projectMeta.date || "",
  };
}