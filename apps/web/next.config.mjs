/** @type {import('next').NextConfig} */
const nextConfig = {
  // `pg` is a node-only runtime dep (better-auth + @mnemia/core talk to Postgres in server code).
  // Keep them out of the webpack bundle so native bits are never parsed at build.
  serverExternalPackages: ["pg", "@mnemia/core"],
};

export default nextConfig;
