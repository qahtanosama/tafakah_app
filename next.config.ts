import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Portal arrival reports send photos as FormData through a Server
      // Action: up to 10 × 15 MB (ARRIVAL_MAX_PHOTO_BYTES). The 1 MB default
      // rejected any real-world submission. Cert uploads no longer pass file
      // bytes through actions (they go browser → Storage directly).
      bodySizeLimit: "160mb",
    },
  },
};

export default withNextIntl(nextConfig);
