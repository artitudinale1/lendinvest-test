import { describe, expect, it } from 'vitest';
import { isStaticCopilotDemo } from './copilotDemo';

describe('static copilot demo', () => {
  it('is enabled only for the public demo flag', () => {
    expect(isStaticCopilotDemo(undefined)).toBe(false);
    expect(isStaticCopilotDemo('')).toBe(false);
    expect(isStaticCopilotDemo('false')).toBe(false);
    expect(isStaticCopilotDemo('true')).toBe(true);
    expect(isStaticCopilotDemo(true)).toBe(true);
  });
});
