import { configDefaults, defineConfig } from "vitest/config";
import config from "./vitest.config";

export default defineConfig({
  ...config,
  test: {
    ...config.test,
    include: ["src/**/*.integration.test.ts"],
    exclude: configDefaults.exclude,
  },
});
