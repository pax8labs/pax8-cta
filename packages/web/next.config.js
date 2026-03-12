/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@agentsync/core", "@agentsync/worker"],
};

module.exports = nextConfig;
