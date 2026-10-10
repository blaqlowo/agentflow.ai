import type { NextConfig } from "next";

// Pages may only be embedded in an iframe by this site and by any origins listed in
// EMBED_ALLOWED_ORIGINS (comma-separated, for example https://yourname.dev).
const embedOrigins = (process.env.EMBED_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter((o) => /^https?:\/\/[a-z0-9.\-:]+$/i.test(o));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: `frame-ancestors 'self' ${embedOrigins.join(" ")}`.trim() },
        ],
      },
    ];
  },
};

export default nextConfig;
