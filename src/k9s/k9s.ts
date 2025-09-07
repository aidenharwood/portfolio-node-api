import { PassThrough } from "stream";
import {
  createPod,
  deletePod,
  getPodStatus,
  createAttach,
  createExec,
} from "../utils/k8s";
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
      generateName: "k9s-pod",
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
      resources: {
        requests: {
          cpu: "100m",
          memory: "100Mi",
        },
        limits: {
          cpu: "200m",
          memory: "200Mi",
        },
      },
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
        ws.send(`Creating pod...\r\n`);

        console.log("Creating pod...");
        const pod: V1Pod | undefined = await createK9sPod();

        const stdinStream = new PassThrough();
        const stdoutStream = new PassThrough();
        const stderrStream = new PassThrough();

        const shutdown = (reason: string) => {
          console.log("Shutting down k9s session: ", reason);
          ws.send(`\r\nSession terminated: ${reason}\r\n`);
          if (!closed) {
            stdinStream.end();
            stderrStream.end();
            stdoutStream.end();
            if (pod) deletePod(pod);
            try {
              if (ws.readyState === ws.OPEN) ws.close();
            } catch {}
          }
          closed = true;
        };

        if (!pod) {
          shutdown("Could not create k9s pod");
          return;
        } else {
          ws.send(
            `Created pod ${pod.metadata?.name} created, waiting to start...\r\n`
          );
          console.log(
            `Created pod ${pod.metadata?.name} created, waiting to start...`
          );
          // wait up to a minute for pod to be running
          const statusCheckStart = Date.now();
          while (
            (await getPodStatus(pod))?.status?.containerStatuses?.[0].state
              ?.running === undefined
          ) {
            if (Date.now() - statusCheckStart > 60000) {
              shutdown("Timed out waiting for k9s pod to start");
              return;
            }
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

        // forward stdout/stderr to websocket
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

        // forward websocket messages to stdin
        ws.on("message", (m) => {
          if (closed) return;
          if (Buffer.isBuffer(m)) stdinStream.write(m);
          else stdinStream.write(Buffer.from(String(m)));
        });

        ws.on("close", () => shutdown("websocket closed"));
        ws.on("error", (e) =>
          shutdown("websocket error: " + JSON.stringify(e))
        );

        const cmd = ["k9s"];
        // const cmd = ["/bin/sh"];

        try {
          ws.send(`Attempting to attach...\r\n`);
          console.log("Attempting to attach...");
          const attach = await createExec();
          if (!attach) {
            shutdown("Could not create k8s attach");
            return;
          }
          attach
            .exec(
              pod.metadata?.namespace ?? "",
              pod.metadata?.name ?? "",
              pod.spec?.containers?.[0].name ?? "",
              cmd,
              stdoutStream,
              stderrStream,
              stdinStream,
              true, // tty
              () => shutdown("k9s attach closed")
            )
            .then(() => {
              ws.send(`Attached! Welcome to k9s\r\n`);
              console.log("Attached! Welcome to k9s");
            }, undefined);
        } catch (err: any) {
          shutdown("attach error: " + JSON.stringify(err));
        }
      });
    } catch (err) {
      console.error("k9s websocket error:", err);
      try {
        if (ws.readyState === ws.OPEN) ws.close();
      } catch {}
    }
  });
  console.log("K9s WebSocket server created at /k9s");
}
