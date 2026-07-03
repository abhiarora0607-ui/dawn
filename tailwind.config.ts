import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: "#1B2A4A",
        "navy-soft": "#26365C",
        amber: "#FF9E43",
        "amber-deep": "#FF7A2F",
        surface: "#F7F8FB",
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
