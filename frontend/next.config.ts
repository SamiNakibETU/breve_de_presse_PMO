import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
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
