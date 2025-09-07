import express, { Request, Response } from "express";
import cors from "cors";
import { getAllPostsMeta, getPostBySlug } from "./blog/blog";
import { getStatusBadges } from "./argocd/argocd";
import http from "http";
import { createWsServer } from "./k9s/k9s";

const app = express();
app.use(cors());

app.get("/api/posts", (req: Request, res: Response) => {
  res.json(getAllPostsMeta());
});

app.get("/api/argocd/badges", (req: Request, res: Response) => {
  getStatusBadges(res);
});

app.get("/api/posts/:slug", (req: Request, res: Response) => {
  const post = getPostBySlug(req.params.slug);
  if (!post) {
    return res.status(404).json({ error: "Post not found" });
  }
  res.json(post);
});

const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () =>
  console.log(`API running on http://localhost:${PORT}`)
);


createWsServer(server);