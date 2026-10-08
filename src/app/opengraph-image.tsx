import { ImageResponse } from "next/og";

export const alt = "SleepCode — a fake VS Code editor that types real code by itself";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "#0a0a0f",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 28, color: "#a5b4fc", marginBottom: 24 }}>SleepCode</div>
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05 }}>Look busy.</div>
        <div style={{ fontSize: 84, fontWeight: 800, lineHeight: 1.05, color: "#818cf8" }}>Code smart.</div>
        <div style={{ fontSize: 30, color: "#a1a1aa", marginTop: 32, maxWidth: 900 }}>
          A fake VS Code session that types real code while you power nap.
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 48,
            padding: "16px 24px",
            borderRadius: 12,
            background: "#1e1e1e",
            border: "1px solid #3f3f46",
            fontFamily: "monospace",
            fontSize: 24,
          }}
        >
          <span style={{ color: "#c586c0" }}>export async function&nbsp;</span>
          <span style={{ color: "#dcdcaa" }}>GET</span>
          <span style={{ color: "#d4d4d4" }}>() {"{"} …</span>
        </div>
      </div>
    ),
    size
  );
}
