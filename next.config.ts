import type { NextConfig } from "next";

// Fix untuk masalah SSL Certificate verification di jaringan lokal/corporate
// Ini aman dipakai di development environment
if (process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
