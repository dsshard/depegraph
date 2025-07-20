/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  logging: false,
  devIndicators: false,
  compiler: {
    removeConsole: true,
  },
  poweredByHeader: false,
}

module.exports = nextConfig
