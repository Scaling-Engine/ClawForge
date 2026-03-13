/**
 * Built-in LLM provider definitions for the settings UI.
 * These list available models per provider — they are NOT the same as
 * lib/ai/model.js DEFAULT_MODELS (which govern runtime model selection).
 */
export const BUILTIN_PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    defaultModel: 'claude-sonnet-4-5',
    models: [
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
      { id: 'claude-opus-4-0', name: 'Claude Opus 4.0' },
      { id: 'claude-sonnet-4-0', name: 'Claude Sonnet 4.0' },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    ],
  },
  openai: {
    name: 'OpenAI',
    defaultModel: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'gpt-4', name: 'GPT-4' },
      { id: 'o1', name: 'o1' },
      { id: 'o1-mini', name: 'o1 Mini' },
      { id: 'o3-mini', name: 'o3 Mini' },
    ],
  },
  google: {
    name: 'Google',
    defaultModel: 'gemini-2.5-pro',
    models: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    ],
  },
};

/**
 * Get the default model ID for a given provider key.
 * Falls back to the first anthropic model if the provider is unknown.
 * @param {string} providerKey
 * @returns {string} Model ID
 */
export function getDefaultModel(providerKey) {
  const provider = BUILTIN_PROVIDERS[providerKey];
  if (provider) return provider.defaultModel;
  // Fallback to anthropic default
  return BUILTIN_PROVIDERS.anthropic.defaultModel;
}
