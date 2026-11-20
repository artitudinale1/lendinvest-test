export const COPILOT_MODELS = [
  { id: 'openrouter/free', label: 'Automatic (free)' },
  { id: 'nvidia/nemotron-3.5-super-vl:free', label: 'Nemotron 3.5 Super' },
  { id: 'particle-ai/particle-1:free', label: 'Particle-1' },
] as const;

export type CopilotModelId = (typeof COPILOT_MODELS)[number]['id'];

export const DEFAULT_COPILOT_MODEL: CopilotModelId = 'openrouter/free';

const ALLOWED_MODELS = new Set<string>(COPILOT_MODELS.map((model) => model.id));

export function allowedCopilotModel(value: unknown): CopilotModelId | null {
  return typeof value === 'string' && ALLOWED_MODELS.has(value) ? (value as CopilotModelId) : null;
}
