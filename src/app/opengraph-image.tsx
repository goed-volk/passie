import { ImageResponse } from "next/og";

export const alt = "Passie — Seizoenkaarten eerlijk delen met je vriendengroep";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0B0F19",
          backgroundImage:
            "radial-gradient(circle at 50% 25%, #35080E 0%, #131B2E 50%, #0B0F19 100%)",
          position: "relative",
        }}
      >
        {/* Subtle decorative glow */}
        <div
          style={{
            position: "absolute",
            width: "400px",
            height: "400px",
            borderRadius: "50%",
            backgroundColor: "#E2001A",
            opacity: 0.18,
            top: "40px",
          }}
        />

        {/* Ticket Branding Icon */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "132px",
            height: "132px",
            borderRadius: "34px",
            background: "linear-gradient(135deg, #E2001A 0%, #B30014 100%)",
            boxShadow: "0 24px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.2)",
            marginBottom: "32px",
          }}
        >
          <svg
            width="78"
            height="78"
            viewBox="0 0 100 100"
            fill="none"
          >
            <path
              d="M 16 28 C 16 22 21 17 27 17 L 73 17 C 79 17 84 22 84 28 L 84 41 A 9 9 0 0 0 84 59 L 84 72 C 84 78 79 83 73 83 L 27 83 C 21 83 16 78 16 72 L 16 59 A 9 9 0 0 0 16 41 Z"
              fill="#FFFFFF"
            />
            <line
              x1="38"
              y1="22"
              x2="38"
              y2="78"
              stroke="#E2001A"
              strokeWidth="3.5"
              strokeDasharray="4 4"
              strokeLinecap="round"
              opacity="0.4"
            />
            <path
              d="M 50 50 L 59 59 L 74 41"
              fill="none"
              stroke="#E2001A"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: "64px",
            fontWeight: 900,
            letterSpacing: "-0.03em",
            color: "#FFFFFF",
            marginBottom: "14px",
          }}
        >
          <span>Passie</span>
        </div>

        {/* Strong Subtitle */}
        <div
          style={{
            display: "flex",
            fontSize: "28px",
            fontWeight: 600,
            color: "#CBD5E1",
            textAlign: "center",
            maxWidth: "820px",
            lineHeight: 1.35,
          }}
        >
          Seizoenkaarten eerlijk delen met je vriendengroep
        </div>

        {/* Bottom Tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: "32px",
            padding: "8px 22px",
            borderRadius: "9999px",
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            color: "#94A3B8",
            fontSize: "17px",
            fontWeight: 500,
            letterSpacing: "0.02em",
          }}
        >
          <span>passie.goedvolk.org</span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
