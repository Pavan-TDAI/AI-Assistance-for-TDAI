/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.TDAI_NEXT_DIST ?? ".next",
  transpilePackages: ["@personal-ai/shared"],
  webpack: (config, { dev }) => {
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
