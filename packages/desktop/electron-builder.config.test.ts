import { createRequire } from "node:module";

import { describe, expect, test } from "vitest";

const require = createRequire(import.meta.url);

const { createConfig } = require("./electron-builder.config.shared.cjs") as {
  createConfig: (env: NodeJS.ProcessEnv) => {
    mac: {
      hardenedRuntime?: boolean;
      notarize?: boolean;
    };
  };
};

describe("createConfig", () => {
  test("disables hardened runtime and notarization for local unsigned mac builds", () => {
    const config = createConfig({});

    expect(config.mac.hardenedRuntime).toBe(false);
    expect(config.mac.notarize).toBe(false);
  });

  test("keeps hardened runtime and notarization enabled when signing credentials exist", () => {
    const config = createConfig({
      CSC_LINK: "file:///tmp/cert.p12",
      CSC_KEY_PASSWORD: "secret",
      APPLE_ID: "dev@example.com",
      APPLE_APP_SPECIFIC_PASSWORD: "app-password",
      APPLE_TEAM_ID: "TEAM123456",
    });

    expect(config.mac.hardenedRuntime).toBe(true);
    expect(config.mac.notarize).toBe(true);
  });
});
