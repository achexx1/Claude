// Настройки агента: переменные окружения (или файл .env) + prompt.md + папка knowledge/.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Модели, которые принимают системные сообщения в середине диалога (role: "system" в messages). */
const SYSTEM_NOTE_MODELS = /^claude-(opus-5|opus-4-8|fable|mythos|sonnet-5-5|haiku-5-5)/;

export function loadConfig(env = process.env, root = process.cwd()) {
  const model = env.AGENT_MODEL || 'claude-opus-5-5';
  return {
    port: Number(env.PORT || 4200),
    // Секрет агента из кабинета Agora. Без него сервер не запустится (кроме ALLOW_NO_SECRET=1 для опытов).
    secret: env.AGORA_SECRET || '',
    allowNoSecret: env.ALLOW_NO_SECRET === '1',
    model,
    // Глубина рассуждений: low | medium | high | xhigh | max. Ниже — быстрее и дешевле.
    effort: env.AGENT_EFFORT || 'medium',
    maxTokens: Number(env.AGENT_MAX_TOKENS || 16000),
    // Agora ждёт ответ до 60 секунд: запрос к Claude должен уложиться с запасом
    timeoutMs: Number(env.AGENT_TIMEOUT_MS || 50_000),
    // Если Claude отклонит задачу из соображений безопасности, API само повторит её на подходящей модели.
    // У Claude Haiku нет серверного fallback.
    fallbacks: env.AGENT_FALLBACKS ? env.AGENT_FALLBACKS === '1' : !model.startsWith('claude-haiku'),
    systemNotes: env.AGENT_SYSTEM_NOTES ? env.AGENT_SYSTEM_NOTES === '1' : SYSTEM_NOTE_MODELS.test(model),
    promptPath: resolve(root, env.PROMPT_FILE || 'prompt.md'),
    knowledgeDir: resolve(root, env.KNOWLEDGE_DIR || 'knowledge'),
  };
}

/** Загружает .env из текущей папки, если он есть (Node 22+). Уже заданные переменные не перезаписываются. */
export function loadDotEnv(root = process.cwd()) {
  const path = join(root, '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}

export function loadPrompt(path) {
  if (!existsSync(path)) throw new Error(`Не найден файл с описанием агента: ${path}`);
  const text = readFileSync(path, 'utf8').trim();
  if (!text) throw new Error(`Файл ${path} пустой: опишите в нём, что делает агент`);
  return text;
}

/**
 * База знаний: все .md и .txt файлы папки, по алфавиту.
 * Порядок постоянный, чтобы не сбивать кэш промпта (любое изменение начала промпта сбрасывает кэш).
 */
export function loadKnowledge(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(md|txt)$/i.test(f) && statSync(join(dir, f)).isFile())
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), 'utf8').trim() }))
    .filter((d) => d.text);
}
