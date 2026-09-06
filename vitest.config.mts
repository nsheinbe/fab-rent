import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx", "lib/**/*.test.ts"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    globals: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
