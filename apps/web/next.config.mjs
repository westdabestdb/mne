/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` is a node-only runtime dep (better-auth talks to Postgres in server code).
  // Keep it out of the webpack bundle so its native bits are never parsed at build.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
