export function createChannelRuntimeRequestSignal(
  runtimeSignal: AbortSignal,
  timeoutMs: number,
): {
  signal: AbortSignal;
  timedOut(): boolean;
} {
  const timeoutSignal = AbortSignal.timeout(Math.max(1, timeoutMs));
  return {
    signal: AbortSignal.any([runtimeSignal, timeoutSignal]),
    timedOut: () => timeoutSignal.aborted && !runtimeSignal.aborted,
  };
}
