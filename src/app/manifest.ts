import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "A Minha Coleção",
    short_name: "Coleção",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f3",
    theme_color: "#2c5b60",
    lang: "pt-PT",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
