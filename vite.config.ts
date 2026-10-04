import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5201,
    strictPort: true,
    headers: {
      "Access-Control-Allow-Origin": "*"
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 5202,
    strictPort: true,
    allowedHosts: ["wanderers-owlbear.unwhelm.online"],
    headers: {
      "Access-Control-Allow-Origin": "*"
    }
  }
});
