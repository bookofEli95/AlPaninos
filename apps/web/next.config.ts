import type { NextConfig } from "next";

// Menu and category photos live in Supabase Storage. Allowing the project's
// own host (from NEXT_PUBLIC_SUPABASE_URL) means a local Supabase works too.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl) : null;

const nextConfig: NextConfig = {
  images: {
    qualities: [75, 85],
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      ...(supabaseHost
        ? [
            {
              protocol: supabaseHost.protocol.replace(":", "") as "http" | "https",
              hostname: supabaseHost.hostname,
              port: supabaseHost.port,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
    ],
    // Only for previewing against a Supabase on this machine: the optimizer
    // won't fetch from local addresses.
    unoptimized: process.env.NEXT_PUBLIC_IMAGES_UNOPTIMIZED === "1",
  },
};

export default nextConfig;
