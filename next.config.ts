import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The certificate template is read from disk at runtime, so it is not
  // discovered by module tracing and must be bundled explicitly.
  outputFileTracingIncludes: {
    "/api/whatsapp/webhook": ["./templates/certificate-base.pdf"],
  },
};

export default nextConfig;
