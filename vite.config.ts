import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Corre el Worker en workerd real durante `vite dev`, con los bindings
    // de verdad (env.AI, secretos). No es una emulacion.
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: {
        name: "Palabro",
        short_name: "Palabro",
        description: "Aprende a usar el ingles, no solo a reconocerlo.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("./src/shared", import.meta.url)),
      "@server": fileURLToPath(new URL("./src/server", import.meta.url)),
      "@client": fileURLToPath(new URL("./src/client", import.meta.url)),
    },
  },
  // Sin outDir explícito: el plugin de Cloudflare ya emite cada entorno en
  // dist/<nombre-del-entorno>, así que el cliente cae en dist/client. Fijarlo
  // a mano producía dist/client/client y wrangler no encontraba el index.html.
});
