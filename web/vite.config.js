import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Use /cagupta/ for GitHub Pages, and / for cPanel (custom domain root)
  base: mode === "github" ? "/cagupta/" : "/",
}));
