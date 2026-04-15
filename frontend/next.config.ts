import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [320, 420, 640, 768, 1024, 1280, 1920],
    minimumCacheTTL: 60 * 60 * 24, // 24 hours
  },

  // Compress responses
  compress: true,
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
