import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { moderok: "src/index.ts" },
    format: ["esm", "cjs"],
    target: "es2020",
    clean: true,
    dts: true,
  },
  {
    entry: { "moderok.min": "src/index.ts" },
    format: ["esm"],
    target: "es2020",
    minify: true,
  },
]);
