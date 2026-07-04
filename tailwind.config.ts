import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Refined Dawn palette — deeper navy, richer sunrise, warm off-white
        navy: "#16233F",
        "navy-soft": "#243356",
        "navy-line": "#E4E8F0",
        amber: "#FF9E43",
        "amber-deep": "#F97316",
        "amber-glow": "#FFB865",
        surface: "#F8F9FC",
        "surface-warm": "#FBF9F6",
        cream: "#FEFCF8",
        ink: "#1A2438",
        muted: "#5B6478",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(22,35,63,0.04), 0 8px 24px rgba(22,35,63,0.05)",
        "card-hover": "0 4px 12px rgba(22,35,63,0.08), 0 16px 40px rgba(22,35,63,0.08)",
        glow: "0 8px 32px rgba(249,115,22,0.18)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
    },
  },
  plugins: [],
};
export default config;
