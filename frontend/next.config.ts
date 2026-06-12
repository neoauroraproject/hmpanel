import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone", // Required for Docker production builds
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/:path*",
      },
      {
        source: "/socket.io/:path*",
        destination: "http://localhost:4000/socket.io/:path*",
      },
      {
        source: "/sub/:path*",
        destination: "http://localhost:4000/sub/:path*",
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
