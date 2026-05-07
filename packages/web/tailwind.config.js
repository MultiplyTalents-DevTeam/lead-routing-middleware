/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#0B0F1A",
          900: "#111827",
          800: "#1A2235",
          700: "#243044"
        },
        gold: {
          DEFAULT: "#D4A017",
          light: "#E8B520",
          dark: "#B8860F"
        }
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};
