import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          900: '#0a0a0f',
          800: '#12121a',
          700: '#1a1a2e',
          600: '#222240',
          500: '#2a2a4a',
          400: '#3a3a5c',
          300: '#5a5a7c',
          200: '#8a8aac',
          100: '#b0b0cc',
        },
        accent: {
          purple: '#7c3aed',
          blue: '#3b82f6',
          cyan: '#06b6d4',
          pink: '#ec4899',
        },
      },
    },
  },
  plugins: [],
};
export default config;
