// Usage: pnpm db:generate <MigrationName>
import { execSync } from 'node:child_process';

const name = process.argv[2];
if (!name || !/^[A-Za-z][A-Za-z0-9]*$/.test(name)) {
  console.error('Usage: pnpm db:generate <MigrationName>   (PascalCase, letters and digits)');
  process.exit(1);
}
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
run('pnpm build');
run(`pnpm exec typeorm migration:generate -d dist/data-source.js --pretty src/migrations/${name}`);
