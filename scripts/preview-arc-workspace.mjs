import { readFile, writeFile, mkdir } from 'node:fs/promises';
import demo from './seed-purpose-demo.cjs';

// Generated only under dist/__dev; never shares app storage or authentication.
const output = new URL('../dist/__dev/', import.meta.url);
await mkdir(output, { recursive: true });
const seed = { ...demo, onboarded: true, theme: 'dark', profile: { ...demo.profile, start: '2026-09-01', name: 'Preview', goal: 'Pass nursing boards' } };
let app = await readFile(new URL('../js/app.js', import.meta.url), 'utf8');
app = app.replace("const KEY = 'arc90.v1';", "const KEY = 'arc90.qa.arc-workspace.v158';")
  .replace('let S = load();', `let S = localStorage.getItem(KEY) ? load() : normalizeState(${JSON.stringify(seed)});`)
  .replace("let tab = 'today';", "let tab = 'progress';")
  .replace("if ('serviceWorker' in navigator && location.protocol !== 'file:')", 'if (false)')
  .replace('if (!bootNudge) showLaunchQuote();', '/* Welcome disabled in isolated interaction tests. */');
let html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
html = html.replace('<head>', '<head><base href="/">')
  .replace(/<script src="js\/auth\.js[^\"]*"><\/script>/, '')
  .replace(/src="js\/app\.js[^\"]*"/, 'src="/__dev/arc-app.js"');
await writeFile(new URL('arc-app.js', output), app);
await writeFile(new URL('arc-workspace.html', output), html);
console.log('Isolated Arc workflow: http://127.0.0.1:5180/__dev/arc-workspace.html');
