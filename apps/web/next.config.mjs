/** @type {import('next').NextConfig} */
const nextConfig = {
  // Traces the exact node_modules subset this app actually needs (via
  // @vercel/nft) into .next/standalone, following the @nexaops/shared-types
  // workspace symlink to its real dist/ files — dramatically smaller and
  // simpler than shipping the whole monorepo node_modules tree in the
  // production image (see infra/docker/web.Dockerfile).
  output: 'standalone',
};

export default nextConfig;
