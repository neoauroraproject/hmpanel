import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

function readAppVersion(): string {
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
