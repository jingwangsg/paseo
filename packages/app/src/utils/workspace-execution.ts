import { isAbsolutePath } from "@/utils/path";

function trimNonEmpty(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isSshWorkspaceId(value: string): boolean {
  const normalized = trimNonEmpty(value);
  if (!normalized || !normalized.startsWith("ssh:")) {
    return false;
  }

  const secondSeparatorIndex = normalized.indexOf(":", 4);
  return secondSeparatorIndex > 4 && secondSeparatorIndex < normalized.length - 1;
}

export function stripSshWorkspaceId(value: string): string {
  const normalized = trimNonEmpty(value);
  if (!normalized) {
    return "";
  }
  if (!isSshWorkspaceId(normalized)) {
    return normalized;
  }

  return normalized.slice(normalized.indexOf(":", 4) + 1);
}

export function getSshWorkspaceHostAlias(value: string): string | null {
  const normalized = trimNonEmpty(value);
  if (!normalized || !isSshWorkspaceId(normalized)) {
    return null;
  }

  const separator = normalized.indexOf(":", 4);
  if (separator <= 4) {
    return null;
  }

  return normalized.slice(4, separator);
}

export function canUseWorkspaceFilesystemFeatures(value: string): boolean {
  return isAbsolutePath(value) || isSshWorkspaceId(value);
}

export function getCopyableWorkspacePath(value: string): string | null {
  if (isSshWorkspaceId(value)) {
    return stripSshWorkspaceId(value);
  }
  if (isAbsolutePath(value)) {
    return value;
  }
  return null;
}
