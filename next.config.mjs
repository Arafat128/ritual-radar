/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["three", "d3-force-3d"],
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: "canvas" }];
    return config;
  },
  async headers() {
    // Allow Rite (and local dev) to embed Radar in an iframe
    const frameAncestors = [
      "'self'",
      "https://rite-woad.vercel.app",
      "https://*.vercel.app",
      "http://localhost:3000",
      "http://localhost:3010",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3010",
    ].join(" ");
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `frame-ancestors ${frameAncestors}`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
