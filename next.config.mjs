/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Next 14 solo ejecuta instrumentation.ts (temporizador del lead score) con esta marca.
  experimental: {
    instrumentationHook: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
