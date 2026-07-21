/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    // Deploy-unique build id, stamped from the Vercel git commit SHA (falls
    // back to 'dev' locally). Inlined into the client bundle AND readable at
    // runtime, so /api/version and the running tab can compare and trigger
    // the "reload to update" banner. Requires Vercel's "Automatically expose
    // System Environment Variables" (on by default).
    NEXT_PUBLIC_APP_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
  },
}

export default nextConfig
