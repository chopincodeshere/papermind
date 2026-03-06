import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/chats": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/pdf": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
