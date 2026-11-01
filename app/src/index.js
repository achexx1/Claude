import { loadConfig } from './config.js';
import { createApp } from './server.js';

const config = loadConfig();
const { app } = createApp(config);

app.listen(config.port, () => {
  console.log(`Agora запущена: ${config.baseUrl}`);
  if (config.devEndpoints) console.log('⚠ Режим разработки: агенты могут указывать http:// и localhost. Не включайте его в продакшене.');
});
