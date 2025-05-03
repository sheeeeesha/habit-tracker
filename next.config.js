/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'randomuser.me',
        pathname: '/api/portraits/**',
      },
    ],
    domains: ['randomuser.me'],
    unoptimized: true,
  },
};

module.exports = nextConfig; 