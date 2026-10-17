import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// Initialize OpenNext Cloudflare development bindings
initOpenNextCloudflareForDev();

let gitCommitSha =
  process.env.NEXT_PUBLIC_GIT_COMMIT_SHA ||
  process.env.CF_PAGES_COMMIT_SHA ||
  "";

if (!gitCommitSha) {
  try {
    gitCommitSha = execSync("git rev-parse --short HEAD", {
      encoding: "utf8",
    }).trim();
  } catch {
    gitCommitSha = "dev";
  }
}

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  env: {
    NEXT_PUBLIC_GIT_COMMIT_SHA: gitCommitSha,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
