import { PackageVersionResolutionError, resolvePackageVersion } from "./package-version.js";

const SERVER_PACKAGE_NAME = "@getpaseo/server";

export class DaemonVersionResolutionError extends PackageVersionResolutionError {}

export function resolveDaemonVersion(moduleUrl: string = import.meta.url): string {
  // SEA/bundled builds inject the version at build time
  if (process.env.PASEO_SEA_VERSION) {
    return process.env.PASEO_SEA_VERSION;
  }
  try {
    return resolvePackageVersion({
      moduleUrl,
      packageName: SERVER_PACKAGE_NAME,
    });
  } catch (error) {
    if (error instanceof PackageVersionResolutionError) {
      throw new DaemonVersionResolutionError({
        moduleUrl,
        packageName: SERVER_PACKAGE_NAME,
      });
    }
    throw error;
  }
}
