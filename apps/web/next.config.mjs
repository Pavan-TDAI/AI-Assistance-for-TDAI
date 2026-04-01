/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.TDAI_NEXT_DIST ?? ".next",
  transpilePackages: ["@personal-ai/shared"],
  webpack: (config, { dev }) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"]
    };

    if (dev) {
      // Windows + OneDrive can corrupt webpack's filesystem cache in dev.
      // Keep dev caching in memory to avoid missing pack/chunk errors.
      config.cache = {
        type: "memory"
      };
    }

    return config;
  }
};

export default nextConfig;
