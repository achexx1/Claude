import { loadDotEnv, loadConfig, loadPrompt, loadKnowledge } from './config.js';
import { createClient } from './claude.js';
import { createAgentServer } from './server.js';

loadDotEnv();
const config = loadConfig();
const prompt = loadPrompt(config.promptPath);
const knowledge = loadKnowledge(config.knowledgeDir);
const kbChars = knowledge.reduce((n, d) => n + d.text.length, 0);

const server = createAgentServer({ config, client: createClient(config), prompt, knowledge });
server.listen(config.port, () => {
  console.log(`Агент слушает http://localhost:${config.port}/agent`);
  console.log(`Модель: ${config.model}, effort: ${config.effort}, база знаний: ${knowledge.length} файл(ов), ${kbChars} символов`);
  if (!config.secret) console.log('⚠ AGORA_SECRET не задан: агент принимает задачи от кого угодно. Только для локальных опытов.');
  if (kbChars > 2_000_000) console.log('⚠ База знаний очень большая: задачи будут дорогими и медленными. Оставьте самое нужное.');
});
