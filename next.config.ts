import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ['supabase.co', 'lh3.googleusercontent.com'], // For Supabase storage and Google avatars
  },
};

export default nextConfig;
