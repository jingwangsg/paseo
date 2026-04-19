function hasMacSigningCredentials(env = process.env) {
  return Boolean(env.CSC_LINK && env.CSC_KEY_PASSWORD);
}

function hasMacNotarizationCredentials(env = process.env) {
  return Boolean(
    hasMacSigningCredentials(env) &&
      env.APPLE_ID &&
      env.APPLE_APP_SPECIFIC_PASSWORD &&
      env.APPLE_TEAM_ID,
  );
}

function createConfig(env = process.env) {
  const enableHardenedRuntime = hasMacSigningCredentials(env);
  const enableNotarization = hasMacNotarizationCredentials(env);

  return {
    npmRebuild: false,
    appId: "sh.paseo.desktop",
    productName: "Paseo",
    executableName: "Paseo",
    afterPack: "./scripts/after-pack.js",
    directories: {
      output: "release",
    },
    files: ["dist/**/*"],
    asarUnpack: [
      "dist/daemon/node-entrypoint-runner.js",
      // The Claude Agent SDK resolves a platform-specific native binary via
      // require.resolve(). In a packaged Electron app the binary lives inside
      // app.asar, which child_process.spawn() cannot traverse (ENOTDIR).
      // Unpacking ensures the binary is on the real filesystem.
      "node_modules/@anthropic-ai/claude-agent-sdk-*/*",
    ],
    extraResources: [
      {
        from: "../app/dist",
        to: "app-dist",
      },
      {
        from: "../../skills",
        to: "skills",
      },
    ],
    publish: {
      provider: "github",
      owner: "getpaseo",
      repo: "paseo",
    },
    mac: {
      artifactName: "Paseo-${version}-${arch}.${ext}",
      category: "public.app-category.developer-tools",
      icon: "assets/icon.icns",
      hardenedRuntime: enableHardenedRuntime,
      notarize: enableNotarization,
      entitlements: "build/entitlements.mac.plist",
      entitlementsInherit: "build/entitlements.mac.inherit.plist",
      extraResources: [
        {
          from: "bin/paseo",
          to: "bin/paseo",
        },
      ],
      target: ["dmg", "zip"],
    },
    linux: {
      category: "Development",
      icon: "assets",
      artifactName: "Paseo-${version}-${arch}.${ext}",
      maintainer: "Mohamed Boudra <hello@moboudra.com>",
      vendor: "Paseo",
      extraResources: [
        {
          from: "bin/paseo",
          to: "bin/paseo",
        },
      ],
      target: ["AppImage", "deb", "rpm", "tar.gz"],
    },
    win: {
      icon: "assets/icon.ico",
      extraResources: [
        {
          from: "bin/paseo.cmd",
          to: "bin/paseo.cmd",
        },
      ],
      target: ["nsis", "zip"],
    },
    nsis: {
      oneClick: false,
      perMachine: false,
      allowToChangeInstallationDirectory: true,
    },
  };
}

module.exports = {
  createConfig,
};
