import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

function readAppVersion(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_VERSION?.trim().replace(/^v/i, "");
  if (fromEnv && fromEnv !== "unknown") return fromEnv;
  const versionFile = path.join(__dirname, "..", "VERSION");
  if (fs.existsSync(versionFile)) {
    return fs.readFileSync(versionFile, "utf8").trim().replace(/^v/i, "");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const packageJson = require("./package.json") as { version: string };
  return packageJson.version;
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: readAppVersion(),
  },
  output: "standalone", // Required for Docker production builds
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:4000/:path*",
      },
      {
        source: "/socket.io/:path*",
        destination: "http://127.0.0.1:4000/socket.io/:path*",
      },
      {
        source: "/sub/:path*",
        destination: "http://127.0.0.1:4000/sub/:path*",
      },
      {
        source: "/s/:path*",
        destination: "http://127.0.0.1:4000/s/:path*",
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/dash/login",
        destination: "/login",
        permanent: true,
      },
      {
        source: "/dash",
        destination: "/",
        permanent: false,
      },
      {
        source: "/admin",
        destination: "/",
        permanent: false,
      },
      {
        source: "/panel",
        destination: "/",
        permanent: false,
      }
    ];
  },
};

export default nextConfig;
