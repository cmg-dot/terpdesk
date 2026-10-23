/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next 14 runs src/instrumentation.ts only with this flag. It installs the HIPAA log scrubber (src/lib/logScrub.ts).
    instrumentationHook: true,
  },
};

export default nextConfig;
