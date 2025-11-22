import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "img-src 'self' data: https: blob:; frame-src 'self' https: blob:;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;

