import {build} from 'esbuild';
import {readFileSync,writeFileSync} from 'node:fs';
await build({entryPoints:['app.jsx'],bundle:true,minify:true,outfile:'bundle.js',define:{'process.env.NODE_ENV':'"production"'}});
const head = '<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Perfect Presentations · grafiekproef</title>';
const root = '<div id="root"></div>';
const script = readFileSync('bundle.js','utf8').replaceAll('</script','<\\/script');
writeFileSync('prototype.html', `${head}<style>${readFileSync('bundle.css','utf8')}</style>${root}<script>${script}</script></html>`);
writeFileSync('route.html', `${head}<link rel="stylesheet" href="./bundle.css">${root}<script defer src="./bundle.js"></script></html>`);
