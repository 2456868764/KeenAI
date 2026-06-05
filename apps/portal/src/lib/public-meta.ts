import { getApiUrl } from "./portal-config";

export type PublicWorkspaceMeta = {
  org: { id: string; slug: string; name: string };
  brand: { id: string; slug: string; name: string };
};

export async function fetchPublicMeta(orgSlug: string): Promise<PublicWorkspaceMeta | null> {
  const res = await fetch(`${getApiUrl()}/api/v1/public/${encodeURIComponent(orgSlug)}/meta`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicWorkspaceMeta;
}
