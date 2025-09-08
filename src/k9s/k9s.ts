import { PassThrough } from "stream";
import {
  createPod,
  deletePod,
  getPodStatus,
  createAttach,
  createExec,
} from "../utils/k8s";
import {
  Attach,
  CoreV1ApiCreateNamespacedPodRequest,
  Exec,
  V1Pod,
} from "@kubernetes/client-node";
import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";

const podcmd = [
  "/bin/sh",
  "-lc",
  "apk add --quiet --no-progress shadow bash acl; mkdir -p /home/guest; setfacl -m u:guest:rwx /home/guest; usermod -d /home/guest guest; chsh -s /bin/bash guest; su -l guest",
];

const k9sPodManifest: CoreV1ApiCreateNamespacedPodRequest = {
  namespace: "k9s",
  body: {
    metadata: {
      generateName: "k9s-",
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
      serviceAccountName: "k9s-sa",
      containers: [
        {
          name: "k9s",
          image: "derailed/k9s:latest",
          command: podcmd,
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

  wss.on("connection", async (ws: WebSocket) => {
    ws.binaryType = "arraybuffer";
    try {
      let closed = false;

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

      ws.send(`Creating pod...\r\n`);

      console.log("Creating pod...");
      const pod: V1Pod | undefined = await createK9sPod();

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
      stdoutStream.on("data", (chunk: any) => {
        if (ws.readyState === ws.OPEN) ws.emit("data", Buffer.from(chunk, "utf-8"));
      });
      stderrStream.on("data", (chunk: any) => {
        if (ws.readyState === ws.OPEN) ws.emit("data", Buffer.from(chunk, "utf-8"));
      });

      ws.on("data", (chunk: any) => {
        if(closed) return;
        if (ws.readyState === ws.OPEN) stdinStream.write(chunk);
      });

      ws.on("close", () => shutdown("websocket closed"));
      ws.on("error", (e) => shutdown("websocket error: " + JSON.stringify(e)));

      // const cmd = ["k9s"];
      // const cmd = ["/bin/sh"];
      const cmd = [
        "/bin/sh",
        "-lc",
        "su -l guest",
      ];

      try {
        ws.send(`Attempting to attach...\r\n`);
        console.log("Attempting to attach...");
        const attach = await createExec();
        // const attach = await createAttach();
        if (!attach) {
          shutdown("Could not create k8s attach");
          return;
        }
        await attach
          // .attach(
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
            ws.send(`Attached!\r\n`);
          }, undefined);
      } catch (err: any) {
        shutdown("attach error: " + JSON.stringify(err));
      }
    } catch (err) {
      console.error("k9s websocket error:", err);
      try {
        if (ws.readyState === ws.OPEN) ws.close();
      } catch {}
    }
  });
  console.log("K9s WebSocket server created at /k9s");
}
