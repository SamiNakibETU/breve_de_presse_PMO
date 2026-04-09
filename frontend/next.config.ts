import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async redirects() {
    return [
      {
        source: "/redaction",
        destination: "/edition",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
