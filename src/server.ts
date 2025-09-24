import express, { Request, Response } from "express";
import cors from "cors";
import { getAllPostsMeta, getPostBySlug } from "./blog/blog";
import { getAllProjectsMeta, getProjectBySlug } from "./projects/projects";
import { getAllImages, serveImage } from "./images/images";
import { getStatusBadges } from "./argocd/argocd";
import http from "http";
import { createWsServer } from "./k9s/k9s";
import bl4Router from "./bl4/bl4-api";

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Mount BL4 save editor API
app.use('/api/bl4', bl4Router);

app.get("/api/posts", (req: Request, res: Response) => {
  res.json(getAllPostsMeta());
});

app.get("/api/projects", (req: Request, res: Response) => {
  res.json(getAllProjectsMeta());
});

app.get("/images", (req: Request, res: Response) => {
  res.json(getAllImages());
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

app.get("/api/projects/:slug", (req: Request, res: Response) => {
  const project = getProjectBySlug(req.params.slug);
  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json(project);
});

app.get("/images/:filename", (req: Request, res: Response) => {
  serveImage(req, res);
});

// Serve images at /images path with full nested path support
app.get(/^\/images\/(.*)/, (req: Request, res: Response) => {
  // Get the full path after /images/
  const imagePath = req.params[0];
  
  if (!imagePath) {
    return res.status(400).json({ error: 'No image path provided' });
  }
  
  // Set the imagePath for the serveImage function
  req.params.imagePath = imagePath;
  serveImage(req, res);
});

const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
server.listen(PORT, () =>
  console.log(`API running on http://0.0.0.0:${PORT}`)
);


createWsServer(server);