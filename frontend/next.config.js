const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack(config) {
    const dcvSdkDir = path.resolve(
      __dirname,
      "node_modules/bedrock-agentcore/dist/src/tools/browser/live-view/nice-dcv-web-client-sdk",
    );
    config.resolve.alias = {
      ...config.resolve.alias,
      "bedrock-agentcore/browser/live-view": path.resolve(
        __dirname,
        "node_modules/bedrock-agentcore/dist/src/tools/browser/live-view/index.js",
      ),
      dcv: path.resolve(dcvSdkDir, "dcvjs-esm/dcv.js"),
      "dcv-ui": path.resolve(dcvSdkDir, "dcv-ui/dcv-ui.js"),
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
