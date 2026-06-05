import { fetchPublicArticle } from "@/lib/kb-public";
import { getPortalOrgSlug } from "@/lib/portal-config";
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgSlug = getPortalOrgSlug();
  const article = await fetchPublicArticle(orgSlug, id);

  const title = article?.seoTitle ?? article?.title ?? "Help Center";
  const subtitle =
    article?.seoDescription ?? article?.excerpt ?? article?.collection ?? "KeenAI Help Center";

  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "64px",
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 55%, #0ea5e9 100%)",
        color: "#f8fafc",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 28, opacity: 0.9 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "#38bdf8",
          }}
        />
        KeenAI Help Center
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
          {title.slice(0, 120)}
        </div>
        <div style={{ fontSize: 30, lineHeight: 1.4, opacity: 0.85, maxWidth: 900 }}>
          {subtitle.slice(0, 180)}
        </div>
      </div>
      {article?.collection ? (
        <div
          style={{
            alignSelf: "flex-start",
            fontSize: 22,
            padding: "10px 18px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.12)",
          }}
        >
          {article.collection}
        </div>
      ) : null}
    </div>,
    { ...size },
  );
}
