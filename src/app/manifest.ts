import type { MetadataRoute } from "next";

/**
 * Lets staff add the app to a phone's home screen ("Install app" or "Add to
 * Home Screen"), where it opens full screen like an app. It works online only.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AI Supermarket Inventory",
    short_name: "Inventory",
    description: "Stock, deliveries, counts and supplier costs for the shop.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf9f2",
    theme_color: "#18623c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "Scan", url: "/scan" },
      { name: "Deliveries", url: "/deliveries" },
      { name: "Counts", url: "/counts" },
    ],
  };
}
