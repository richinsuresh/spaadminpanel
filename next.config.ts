import type { NextConfig } from "next";

// Initialize the PWA plugin
const withPWA = require("next-pwa")({
  dest: "public",         // Where to output the service worker
  register: true,         // Auto-register the worker
  skipWaiting: true,      // Auto-update the app when new version is available
  disable: process.env.NODE_ENV === "development", // Disable PWA in dev mode
});

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  // Ensure images from external sources are strictly limited to your domains
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co', // <-- FIXED: Restricts image optimization to Supabase domains only
      },
    ],
  },
};

// Wrap the config with the PWA function
export default withPWA(nextConfig);