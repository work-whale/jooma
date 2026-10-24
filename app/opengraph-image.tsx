import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// The social card every page shares unless it has its own. It replaces the
// square logo the root layout used to name, which LinkedIn, X and iMessage all
// crop into a wide frame and which said nothing about what Jooma is.
//
// Generated once at build time (no request-time APIs here), so it costs
// nothing per share.

export const alt = "Jooma: teaching resources for UK teachers, made in about a minute";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/logo/Jooma-logo-v2-white-512.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#5B2ED6",
          color: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} alt="" width={220} height={220} style={{ width: 220, height: "auto" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1.5 }}>
            Teaching resources for UK teachers, made in about a minute.
          </div>
          <div style={{ fontSize: 30, opacity: 0.85 }}>
            Slides, worksheets, lesson plans and reports. Try it free at jooma.ai
          </div>
        </div>
      </div>
    ),
    size,
  );
}
