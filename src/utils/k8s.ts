import * as k8s from "@kubernetes/client-node";
import {
  ConfigurationOptions,
  CoreV1ApiCreateNamespacedPodRequest,
  V1Pod,
} from "@kubernetes/client-node";

export async function createK8sClient() {
  const kc = new k8s.KubeConfig();
  try {
    kc.loadFromCluster();
    return kc.makeApiClient(k8s.CoreV1Api);
  } catch (e) {
    console.warn("Could not load kubeconfig:", e);
    return;
  }
}

export async function exec() {
  const kc = new k8s.KubeConfig();
  try {
    kc.loadFromCluster();
    const exec = new k8s.Exec(kc);
    return exec;
  } catch (e) {
    console.warn("Could not load kubeconfig:", e);
    return;
  }
}

export async function createPod(
  metadata: CoreV1ApiCreateNamespacedPodRequest,
  options: ConfigurationOptions
) {
  try {
    const k8sApi = await createK8sClient();
    return await k8sApi?.createNamespacedPod(metadata, options);
  } catch (e) {
    console.error("Error creating pod:", e);
    return;
  }
}

export async function deletePod(pod: V1Pod) {
  try {
    const k8sApi = await createK8sClient();
    return await k8sApi?.deleteNamespacedPod(
      {
        name: pod.metadata?.name ?? "",
        namespace: pod.metadata?.namespace ?? "",
      },
      {}
    );
  } catch (e) {
    console.error("Error deleting pod:", e);
    return;
  }
}
