import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
await build({entryPoints:['app.jsx'],bundle:true,minify:true,outfile:'bundle.js',define:{'process.env.NODE_ENV':'"production"'}});
const html = `<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Perfect Presentations · twee schermen</title><style>${readFileSync('bundle.css','utf8')}</style><div id="root"></div><script>${readFileSync('bundle.js','utf8').replaceAll('</script','<\\/script')}</script></html>`;
writeFileSync('prototype.html',html);
