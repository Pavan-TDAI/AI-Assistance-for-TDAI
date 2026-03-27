import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#081923",
        mist: "#dbe9ef",
        signal: "#0f766e",
        ember: "#d97706",
        shell: "#f5f7f3"
      },
      boxShadow: {
        panel: "0 20px 50px rgba(8, 25, 35, 0.12)"
      },
      backgroundImage: {
        "grid-fade":
          "linear-gradient(rgba(8,25,35,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(8,25,35,0.06) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};

export default config;
