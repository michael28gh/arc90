import { readFile, writeFile, mkdir } from 'node:fs/promises';
import demo from './seed-purpose-demo.cjs';

const root = new URL('../dist/__dev/', import.meta.url);
await mkdir(root, { recursive: true });
const template = await readFile(new URL('./fixtures/brain-map-gallery.html', import.meta.url), 'utf8');
await writeFile(new URL('brain-map.html', root), template.replace('/* DEMO_DATA */', JSON.stringify(demo).replace(/</g, '\\u003c')));
console.log('Isolated Arc map gallery: http://127.0.0.1:5180/__dev/brain-map.html');
