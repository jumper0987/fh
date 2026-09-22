import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Passe "base" an den Namen deines GitHub-Repos an,
// z.B. "/fh/" wenn das Repo so heißt,
// oder "/" wenn es auf einer eigenen Domain liegt.
export default defineConfig({
  plugins: [react()],
  base: "/fh/",
});
