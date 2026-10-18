#!/usr/bin/env node
// Headless Chrome shots of the sim / mood preview. Node 22 + system Chrome.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function flag(name, fb) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : fb;
}
const outDir = flag('out', '/opt/cursor/artifacts');
const prefix = flag('prefix', 'shot');
const url = flag('url', 'http://127.0.0.1:8000/sim.html?track=city-loop&look=roof&quality=high&menu=1');
const waitMs = Number(flag('wait', '8000')) || 8000;
const w = Number(flag('w', '1400')) || 1400;
const h = Number(flag('h', '800')) || 800;
const chrome = process.env.CHROME || 'google-chrome';

mkdirSync(outDir, { recursive: true });

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function cdp(ws, method, params) {
  const id = cdp._n = (cdp._n || 0) + 1;
  ws.send(JSON.stringify({ id, method, params: params || {} }));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('cdp timeout ' + method)), 20000);
    function on(msg) {
      try {
        const raw = typeof msg.data === 'string' ? msg.data : msg.data && msg.data.toString();
        const o = JSON.parse(raw);
        if (o.id === id) {
          clearTimeout(t);
          ws.removeEventListener('message', on);
          if (o.error) reject(new Error(method + ': ' + JSON.stringify(o.error)));
          else resolve(o.result || {});
        }
      } catch (e) { /* ignore */ }
    }
    ws.addEventListener('message', on);
  });
}

const port = 9223 + Math.floor(Math.random() * 40);
const userData = '/tmp/qm-chrome-' + process.pid;
const child = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu-sandbox',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--hide-scrollbars',
  '--window-size=' + w + ',' + h,
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + userData,
  url,
], { stdio: ['ignore', 'pipe', 'pipe'] });

let stderr = '';
child.stderr.on('data', (d) => { stderr += d.toString(); });

let wsUrl = null;
for (let i = 0; i < 40 && !wsUrl; i++) {
  await sleep(200);
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/json/list');
    const pages = await r.json();
    const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
    if (page) wsUrl = page.webSocketDebuggerUrl;
  } catch (e) { /* chrome not up yet */ }
}
if (!wsUrl) {
  child.kill();
  throw new Error('no CDP page\n' + stderr.slice(-800));
}

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = () => rej(new Error('ws failed'));
});
try {
  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Runtime.enable');
  await sleep(waitMs);
  try {
    await cdp(ws, 'Runtime.evaluate', {
      expression: `(function(){
        document.body.style.cursor='none';
        var ids=['startMenu','feelPrompt','menuLayer','legend','audioHint','toast','panel'];
        ids.forEach(function(id){var el=document.getElementById(id);if(!el)return;
          el.classList.remove('open','show');el.style.display='none';});
        document.body.classList.remove('menu-open');
        if(window._sim&&window._sim.looks) window._sim.looks.menuOpen=false;
        if(window._sim&&window._sim.setLookSpot){
          var look=new URLSearchParams(location.search).get('look');
          if(look)window._sim.setLookSpot(look);
        }
        return true;
      })()`,
    });
    await sleep(800);
  } catch (e) { /* ignore */ }
  const shot = await cdp(ws, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
  const dest = join(outDir, prefix + '.png');
  writeFileSync(dest, Buffer.from(shot.data, 'base64'));
  console.log(dest);
  try {
    const info = await cdp(ws, 'Runtime.evaluate', {
      expression: `JSON.stringify((function(){
        var s = window._sim || {};
        var looks = s.looks || {};
        var fps = looks.fps || {};
        var stats = s.artStats ? s.artStats() : null;
        return {
          vibe: s.vibe ? s.vibe() : (window._mood && window._mood.vibe),
          stats: stats,
          fpsAvg: fps.avg || null,
          quality: looks.applied || null,
          bloom: !!(looks.bloomPass && looks.bloomPass.enabled),
        };
      })())`,
      returnByValue: true,
    });
    if (info && info.result && info.result.value) {
      const dump = join(outDir, prefix + '.json');
      writeFileSync(dump, String(info.result.value));
      console.log(dump, info.result.value);
    }
  } catch (e) { console.log('stats skip', e.message); }
} finally {
  try { ws.close(); } catch (e) { /* ignore */ }
  child.kill();
}
void here;
