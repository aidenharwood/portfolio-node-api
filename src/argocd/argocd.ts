import { Request, Response } from "express";

export async function getStatusBadges(res: Response) {
  const url = `${process.env.ARGOCD_URL || ""}`;
  const badgeUrl = (app: string) =>
    `${url}/api/badge?name=${app}&revision=true&showAppName=true&width=200`;

  try {
    const response = await fetch(`${url}/api/v1/applications`, {
      headers: {
        Authorization: `Bearer ${process.env.ARGOCD_TOKEN || ""}`,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      res
        .status(response.status)
        .json({ error: "Failed to fetch ArgoCD applications" });
      return;
    }
    const data = await response.json();
    res.json(
      (data.items || []).map((item: any) => {
        return {
          appName: item.metadata.name,
          appUrl: `${url}/applications/${item.metadata.name}`,
          badgeUrl: badgeUrl(item.metadata.name),
        };
      })
    );
    return;
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
    console.error(error);
    return;
  }
}
