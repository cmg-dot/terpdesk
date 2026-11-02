/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Next 14 runs src/instrumentation.ts only with this flag. It installs the HIPAA log scrubber (src/lib/logScrub.ts).
    instrumentationHook: true,
    // Server Actions accept 1 MB by default. The interpreter workbook import allows files up to 5 MB (MAX_WORKBOOK_BYTES in
    // src/lib/workbookImport/types.ts), so the limit sits just above that. Only the import sends bodies this large.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
