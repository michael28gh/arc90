import { cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const nativePublic = join(root, 'ios', 'App', 'App', 'public');

// OTA archives are hosted by Vercel and should not be embedded in the iOS binary.
await rm(join(nativePublic, 'updates'), { recursive: true, force: true });
await cp(join(root, 'dist', 'app.html'), join(nativePublic, 'index.html'));

console.log('Arc90 native web bundle prepared without hosted OTA archives.');
