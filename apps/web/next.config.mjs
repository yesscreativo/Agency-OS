/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@agency-os/ui", "@agency-os/db", "@agency-os/domain"],
};

export default nextConfig;
