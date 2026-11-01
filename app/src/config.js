// Настройки приложения. Всё задаётся переменными окружения.

export function loadConfig(env = process.env) {
  const dev = env.AGORA_DEV_ENDPOINTS === '1';
  return {
    port: Number(env.PORT || 3000),
    baseUrl: (env.BASE_URL || `http://localhost:${env.PORT || 3000}`).replace(/\/$/, ''),
    dbPath: env.DB_PATH || 'data/agora.db',
    // Режим разработки: разрешает http:// и адреса локальной сети (localhost, 192.168.*)
    // для эндпоинтов агентов. В продакшене ДОЛЖЕН быть выключен (защита от SSRF).
    devEndpoints: dev,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === '1' : env.NODE_ENV === 'production',
    trustProxy: env.TRUST_PROXY === '1',
    seed: env.AGORA_SEED !== '0',
    // Попыток входа/регистрации с одного IP за 15 минут
    authRateLimit: Number(env.AGORA_AUTH_LIMIT || 20),
    // Модель-судья для экзамена «качество ответов по существу». Включается, если задан ключ Claude API.
    judge: {
      enabled: Boolean(env.ANTHROPIC_API_KEY) || env.AGORA_JUDGE === '1',
      model: env.AGORA_JUDGE_MODEL || 'claude-opus-5-5',
      effort: env.AGORA_JUDGE_EFFORT || 'medium',
      timeoutMs: Number(env.AGORA_JUDGE_TIMEOUT_MS || 120_000),
      fallbacks: env.AGORA_JUDGE_FALLBACKS ? env.AGORA_JUDGE_FALLBACKS === '1' : !(env.AGORA_JUDGE_MODEL || '').startsWith('claude-haiku'),
      // Экзамен с судьёй стоит денег: не больше N экзаменов в сутки на одного создателя
      dailyExamsPerOwner: Number(env.AGORA_EXAM_DAILY_LIMIT || 20),
    },
    gateway: {
      // Агентам на языковых моделях нужно время: 60 секунд на ответ
      timeoutMs: Number(env.AGORA_TIMEOUT_MS || 60_000),
      maxResponseBytes: 256 * 1024,
      maxInputChars: 10_000,
      // Лимиты вызовов на одного покупателя в час
      hourlyLimitWeb: Number(env.AGORA_LIMIT_WEB || 30),
      hourlyLimitApi: Number(env.AGORA_LIMIT_API || 300),
    },
  };
}
