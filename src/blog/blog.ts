import path from "path";
import fs from "fs";
import fm from "front-matter";
import slugify from "slugify";
import { formatDate } from "../utils/utils";
import { marked } from "marked";

const POSTS_DIR = path.join(process.cwd(), "blog");

marked.use({
  renderer: {
    heading({ text, depth }) {
      // Use slugify for clean, predictable IDs
      const id = slugify(text, { lower: true, strict: true });
      return `<section class="flex space-x-3"><h${depth} id="${id}">${text}</h${depth}> <a href="#${id}" class="pi pi-link opacity-25"></a></section>`;
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

export interface BlogPostMeta {
  title: string;
  date: string;
  slug: string;
  excerpt?: string;
  body: string | Promise<string>;
  file: string;
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
  const files = getMarkdownFiles(POSTS_DIR);
  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf-8");
      const { attributes, body } = fm<BlogPostMeta>(raw);
      const slug = slugify(attributes.title || file, {
        lower: true,
        strict: true,
      });
      const dateStr =
        attributes.date || file.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
      const dateEpoch = dateStr ? new Date(dateStr).getTime() : 0;
      return {
        title: attributes.title || file,
        date: formatDate(dateStr),
        dateEpoch,
        excerpt: attributes.excerpt || body.slice(0, 120) + "...",
        slug,
        file,
      };
    })
    .sort((a, b) => b.dateEpoch - a.dateEpoch);
}

export function getPostBySlug(slug: string) {
  const posts = getAllPostsMeta();
  const postMeta = posts.find((p) => p.slug === slug);
  if (!postMeta) return null;
  const raw = fs.readFileSync(path.join(POSTS_DIR, postMeta.file), "utf-8");
  const { attributes, body } = fm(raw);
  return {
    ...postMeta,
    body: marked.parse(body),
    date: postMeta.date || "",
  };
}
