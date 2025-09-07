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

// --- k9s websocket proxy ---
// Exposes a websocket at /k9s that execs into the pod's "k9s" container and proxies a TTY.
//
// Expected first WS message (JSON) can override target:
// { "namespace": "default", "pod": "mypod-xxxxx", "container": "k9s", "cmd": ["/bin/sh"] }
//
// If not provided, defaults use POD_NAME and POD_NAMESPACE env vars and container "k9s".
const server = http.createServer(app);

// Kubernetes exec client (in-cluster)
const kc = new k8s.KubeConfig();
try {
  kc.loadFromCluster();
} catch (e) {
  console.warn("Could not load in-cluster kubeconfig:", e);
}
const exec = new k8s.Exec(kc);

const wss = new WebSocketServer({ server, path: "/k9s" });

wss.on("connection", (ws: WS) => {
  let closed = false;

  // Expect an init message first to choose pod/namespace/container/cmd
  ws.once("message", async (firstMsg) => {

    const namespace = process.env.POD_NAMESPACE || "default";
    const pod = process.env.POD_NAME || process.env.HOSTNAME;
    const container = "portfolio-k9s";
    const cmd = ["/bin/sh", "-c", "k9s"];

    console.log("Client connected to k9s websocket");
    ws.send(`Starting k9s...\r\n`);

    if (!pod) {
      ws.send(
        "Error: target pod not specified and POD_NAME not set in environment"
      );
      ws.close();
      return;
    }

    console.log("k9s exec into", { namespace, pod, container, cmd });

    const stdinStream = new PassThrough();
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    // forward stdout/stderr to websocket (binary)
    stdoutStream.on("data", (chunk: Buffer) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk);
    });
    stderrStream.on("data", (chunk: Buffer) => {
      if (ws.readyState === ws.OPEN) ws.send(chunk);
    });

    // forward websocket messages to stdin. Support resize messages:
    ws.on("message", (m) => {
      if (closed) return;
      if (typeof m === "string") {
        try {
          const obj = JSON.parse(m);
          if (
            obj &&
            obj.type === "resize" &&
            typeof obj.cols === "number" &&
            typeof obj.rows === "number"
          ) {
            // resize request: try to call underlying resize if available
            // The client-node Exec does not expose a simple resize API here, so this may be a no-op.
            // If using a different exec mechanism, implement resize there.
            return;
          }
        } catch {
          // not JSON -> treat as raw input
        }
      }
      // write raw data into stdin stream
      if (Buffer.isBuffer(m)) stdinStream.write(m);
      else stdinStream.write(Buffer.from(String(m)));
    });

    ws.on("close", () => {
      closed = true;
      stdinStream.end();
    });
    ws.on("error", () => {
      closed = true;
      stdinStream.end();
    });

    try {
      // exec into the target container with TTY enabled
      exec.exec(
        namespace,
        pod,
        container,
        cmd,
        stdoutStream,
        stderrStream,
        stdinStream,
        true, // tty
        (status) => {
          // exec finished
          try {
            if (ws.readyState === ws.OPEN) ws.close();
          } catch {}
        }
      );
    } catch (err: any) {
      ws.send(`Error exec into container: ${err.message || String(err)}`);
      ws.close();
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () =>
  console.log(`API (with /k9s websocket) running on http://localhost:${PORT}`)
);
