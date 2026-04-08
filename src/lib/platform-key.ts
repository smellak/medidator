interface AiKeyResult {
  apiKey: string;
  provider: string;
  defaultModel: string;
}

let cachedKey: (AiKeyResult & { fetchedAt: number }) | null = null;
const CACHE_TTL = 30 * 60 * 1000;

const PLATFORM_INTERNAL_URL = process.env.CHS_PLATFORM_URL || '';

export async function getAiKey(provider: string = 'google'): Promise<AiKeyResult> {
  if (cachedKey && (Date.now() - cachedKey.fetchedAt) < CACHE_TTL) {
    return cachedKey;
  }

  if (PLATFORM_INTERNAL_URL) {
    try {
      const response = await fetch(`${PLATFORM_INTERNAL_URL}/api/ai/resolve-key?provider=${provider}`, {
        headers: { 'x-chs-app-slug': 'medidas' },
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const data = await response.json() as Record<string, unknown>;
        if (data.apiKey) {
          cachedKey = {
            apiKey: String(data.apiKey),
            provider: String(data.provider || provider),
            defaultModel: String(data.defaultModel || 'gemini-2.5-flash'),
            fetchedAt: Date.now(),
          };
          console.log(`[AI Key] Fetched from platform: ${cachedKey.apiKey.substring(0, 10)}... (model: ${cachedKey.defaultModel})`);
          return cachedKey;
        }
      }
    } catch (err) {
      console.warn(`[AI Key] Platform fetch failed: ${(err as Error).message}`);
    }
  }

  const localKey = process.env.GEMINI_API_KEY || '';
  if (localKey) {
    console.warn('[AI Key] Using local env var fallback');
    return { apiKey: localKey, provider: 'google', defaultModel: 'gemini-2.5-flash' };
  }

  throw new Error('No AI API key available — platform unreachable and no local env var');
}

export function invalidateKeyCache() { cachedKey = null; }
