import { PassThrough } from "stream";
import { createPod, deletePod, createK8sClient, exec } from "../utils/k8s";
import {
  CoreV1ApiCreateNamespacedPodRequest,
  V1Pod,
} from "@kubernetes/client-node";
import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

const k9sPodManifest: CoreV1ApiCreateNamespacedPodRequest = {
  namespace: "k9s",
  body: {
    metadata: {
      name: "k9s-pod",
    },
    spec: {
      initContainers: [
        {
          name: "setup-kubeconfig",
          image: "busybox",
          command: ["/bin/sh", "-c"],
          args: ["/mnt/script/write-kubeconfig.sh"],
          volumeMounts: [
            {
              name: "kubeconfig",
              mountPath: "/kube",
            },
            {
              name: "scripts",
              mountPath: "/mnt/script",
            },
          ],
        },
      ],
      containers: [
        {
          name: "k9s",
          image: "derailed/k9s:latest",
          command: ["/bin/sh"],
          tty: true,
          stdin: true,
          env: [{ name: "KUBECONFIG", value: "/kube/config" }],
          volumeMounts: [
            {
              name: "kubeconfig",
              mountPath: "/kube",
            },
          ],
        },
      ],
      volumes: [
        {
          name: "scripts",
          configMap: {
            name: "k9s-scripts",
            defaultMode: 493, // 0755 in octal
          },
        },
        {
          name: "kubeconfig",
          emptyDir: {},
        },
      ],
    },
  },
};

async function createK9sPod() {
  return createPod(k9sPodManifest, {});
}

export function createWsServer(server: Server) {
  const wss = new WebSocketServer({ server, path: "/k9s" });

  wss.on("connection", (ws: WebSocket) => {
    try {
      let closed = false;

      // Expect an init message first to choose pod/namespace/container/cmd
      ws.once("message", async (firstMsg: string | Buffer) => {
        let init: any = {};
        try {
          if (typeof firstMsg === "string" && firstMsg.length)
            init = JSON.parse(firstMsg);
          else if (Buffer.isBuffer(firstMsg) && firstMsg.length)
            init = JSON.parse(firstMsg.toString("utf8"));
        } catch (e) {
          // ignore - use defaults below
        }

        ws.send(`Starting container...\r\n`);

        const pod: V1Pod | undefined = await createK9sPod();

        if (!pod) {
          ws.send(`Error creating k9s pod!\r\n`);
          ws.close();
          return;
        }

        const stdinStream = new PassThrough();
        const stdoutStream = new PassThrough();
        const stderrStream = new PassThrough();

        const shutdown = async () => {
          closed = true;
          stdinStream.end();
          stderrStream.end();
          stdoutStream.end();
          await deletePod(pod);
          try {
            if (ws.readyState === ws.OPEN) ws.close();
          } catch {}
        };

        // const cmd = ["sh", "-lc", "export TERM=xterm-256color; exec k9s --headless --readonly --all-namespaces"];
        const cmd = ["sh"];

        // forward stdout/stderr to websocket (binary)
        stdoutStream.on("data", (chunk: Buffer) => {
          const str = chunk.toString("utf8");
          console.log("Received stdout len=%d repr=%j", chunk.length, str);
          if (ws.readyState === ws.OPEN) ws.send(chunk);
        });
        stderrStream.on("data", (chunk: Buffer) => {
          const str = chunk.toString("utf8");
          console.log("Received stdout len=%d repr=%j", chunk.length, str);
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

        ws.on("close", () => shutdown());
        ws.on("error", () => shutdown());

        try {
          // exec into the target container with TTY enabled
          const ex = await exec();
          if (!ex) throw new Error("Could not create k8s exec client");
          await ex.exec(
            pod.metadata?.namespace ?? "",
            pod.metadata?.name ?? "",
            "k9s",
            cmd,
            stdoutStream,
            stderrStream,
            stdinStream,
            true, // tty
            () => {
              try {
                if (ws.readyState === ws.OPEN) shutdown();
              } catch {}
            }
          );
        } catch (err: any) {
          console.error("k9s exec error:", err);
          ws.send(`Error exec into container: ${JSON.stringify(err)}\r\n`);
          shutdown();
        }
      });
    } catch (err) {
      console.error("k9s websocket error:", err);
      try {
        if (ws.readyState === ws.OPEN) ws.close();
      } catch {}
    }
  });
}
