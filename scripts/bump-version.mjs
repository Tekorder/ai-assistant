// Increments package.json version by 0.01, base-10:
// major.minor.patch is read as the number (major).(minor)(patch),
// so 0.1.5 -> 0.1.6, 0.1.9 -> 0.2.0, 0.9.9 -> 1.0.0.
import fs from 'fs';

const pkgPath = new URL('../package.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const [maj = 0, min = 0, pat = 0] = pkg.version.split('.').map(n => parseInt(n, 10) || 0);
const total = maj * 100 + min * 10 + pat + 1;
pkg.version = `${Math.floor(total / 100)}.${Math.floor(total / 10) % 10}.${total % 10}`;

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`version -> ${pkg.version}`);
