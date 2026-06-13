/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow testing the dev server from the phone over the LAN IP. Without this, Next 16
  // blocks cross-origin access to /_next dev resources, so the client never hydrates
  // (the buttons render but do nothing). Harmless in production / on Vercel.
  allowedDevOrigins: ["192.168.1.139"],
};

export default nextConfig;
