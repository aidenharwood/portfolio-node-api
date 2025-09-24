/**
 * K9s Terminal Module - Legacy compatibility wrapper
 * 
 * This file maintains backward compatibility while delegating to the new
 * refactored terminal services. New code should use the services directly.
 */
import { Server } from "http";
import { getK9sTerminalServer } from "../services/k9s-terminal-server";
import { createLogger } from "../utils/logger";

// Legacy imports kept for potential future use
import {
  createPod,
  deletePod,
  getPodStatus,
  createExec,
} from "../utils/k8s";
import {
  CoreV1ApiCreateNamespacedPodRequest,
  V1Pod,
} from "@kubernetes/client-node";

const logger = createLogger('k9s-legacy');

// Legacy pod manifest (kept for reference)
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
          command: ["/bin/sh", "-c", "apk add --no-cache expect && /bin/sh"],
          tty: true,
          stdin: true,
          env: [
            { name: "KUBECONFIG", value: "/kube/config" },
            { name: "TERM", value: "xterm-256color" },
            { name: "COLORTERM", value: "truecolor" },
            { name: "COLUMNS", value: "80" },
            { name: "LINES", value: "24" },
            { name: "FORCE_COLOR", value: "1" },
            { name: "NO_COLOR", value: "" }
          ],
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

// Legacy function (kept for potential future use)
async function createK9sPod(): Promise<any> {
  return createPod(k9sPodManifest, {});
}

/**
 * Legacy createWsServer function - delegates to refactored implementation
 * @deprecated Use getK9sTerminalServer().start(server) instead
 */
export function createWsServer(server: Server): void {
  logger.info('Creating WebSocket server using refactored implementation');
  getK9sTerminalServer().start(server);
}

// Export legacy functions for backward compatibility
export { createK9sPod };

// Re-export new services for convenience
export { getK9sTerminalServer, K9sTerminalServer } from "../services/k9s-terminal-server";