import { readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
const html=readFileSync('dist/index.html','utf8'),server=readFileSync('dist/server.cjs');
const id=crypto.createHash('sha256').update(html).update(server).digest('hex').slice(0,16);
const entryAssets=[...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(match=>match[1]);
writeFileSync('dist/build-info.json',JSON.stringify({id,builtAt:new Date().toISOString(),commit:process.env.APP_COMMIT || null,entryAssets}));
