import { protect } from 'minigame-code-fortify-cli';
import { join } from 'node:path';

const [input, output, secretConfigPath, minutes] = process.argv.slice(2);
try {
  const ok = await protect(input, output, {
    secretConfigPath, protectConfigPath: join(input, 'code.fortify.config.json'),
    networkOptions: { timeout_minute: Number(minutes) }
  });
  process.exitCode = ok === true ? 0 : 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
