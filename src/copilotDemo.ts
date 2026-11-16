export function isStaticCopilotDemo(
  flag: unknown = import.meta.env.VITE_COPILOT_DEMO,
): boolean {
  return flag === true || flag === 'true';
}
