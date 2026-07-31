/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["three", "d3-force-3d"],
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: "canvas" }];
    return config;
  },
};

export default nextConfig;
