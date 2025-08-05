import path from "path";
import fs from "fs";
import fm from "front-matter";
import slugify from "slugify";
import { formatDate } from "../utils/utils";
import { marked } from "marked";

const POSTS_DIR = path.join(process.cwd(), "blog");

export interface BlogPostMeta {
  title: string;
  date: string;
  slug: string;
  excerpt?: string;
  body: string | Promise<string>;
  file: string;
}

export function getAllPostsMeta() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  return files
    .map((file) => {
      const raw = fs.readFileSync(path.join(POSTS_DIR, file), "utf-8");
      const { attributes, body } = fm<BlogPostMeta>(raw);
      const slug = slugify(attributes.title || file, {
        lower: true,
        strict: true,
      });
      return {
        title: attributes.title || file,
        date: formatDate(
          attributes.date || file.match(/\d{4}-\d{2}-\d{2}/)?.[0] || ""
        ),
        slug,
        excerpt: attributes.excerpt || body.slice(0, 120) + "...",
        file,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
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
