import { readFileSync } from "node:fs";

const SIMULATOR_ID_PATTERN = /\(([0-9A-F-]{36})\)/i;

function parseCandidate(line: string): { id: string; booted: boolean; isIPhone: boolean } | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const match = SIMULATOR_ID_PATTERN.exec(trimmed);
  if (!match?.[1]) {
    return null;
  }

  return {
    id: match[1],
    booted: trimmed.includes("(Booted)"),
    isIPhone: trimmed.startsWith("iPhone "),
  };
}

export function selectPreferredIPhoneSimulatorId(simctlOutput: string): string | null {
  const candidates = simctlOutput
    .split(/\r?\n/)
    .map(parseCandidate)
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const bootedIPhone = candidates.find((candidate) => candidate.isIPhone && candidate.booted);
  if (bootedIPhone) {
    return bootedIPhone.id;
  }

  const availableIPhone = candidates.find((candidate) => candidate.isIPhone);
  return availableIPhone?.id ?? null;
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file://").href) {
  const output = readFileSync(0, "utf8");
  const selectedId = selectPreferredIPhoneSimulatorId(output);

  if (!selectedId) {
    console.error(
      "No iPhone simulator is available. This runner is intentionally iPhone-oriented because the Maestro flow assumes a phone layout.",
    );
    process.exit(1);
  }

  process.stdout.write(selectedId);
}
