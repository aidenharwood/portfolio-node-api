import express, { Request, Response } from "express";
import cors from "cors";
import { getAllPostsMeta, getPostBySlug } from "./blog/blog";
import { getStatusBadges } from "./argocd/argocd";
import http from "http";
import { Server as WebSocketServer, WebSocket as WS } from "ws";
import * as k8s from "@kubernetes/client-node";
import { PassThrough } from "stream";

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
