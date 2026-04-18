export function runModeCycleShortcut(input: {
  dispatchWorkspaceModeCycle: () => boolean;
  runRunningAgentModeCycle: () => { didCycle: boolean; shouldConsume: boolean };
}): { shouldConsume: boolean } {
  if (input.dispatchWorkspaceModeCycle()) {
    return { shouldConsume: true };
  }

  return {
    shouldConsume: input.runRunningAgentModeCycle().shouldConsume,
  };
}
