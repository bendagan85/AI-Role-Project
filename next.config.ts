import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // jsdom, pdf-parse and mammoth are CommonJS / dynamically-required
  // libraries used only inside the Inngest ingestion function. Bundling
  // them for the serverless runtime breaks them (jsdom uses `vm` + optional
  // native deps; pdf-parse self-reads a test file on import). Mark them
  // external so they're require()'d from node_modules at runtime instead —
  // this is what makes URL/PDF/DOCX ingestion work on Vercel.
  serverExternalPackages: ["jsdom", "pdf-parse", "mammoth"],
};

export default nextConfig;
