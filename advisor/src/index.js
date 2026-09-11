/* QuadMath Tune Advisor.
   POST /v1/blackbox  { metrics JSON from blackbox.html }  ->  { text, model, usage }

   The browser never sees the Anthropic key. The Worker never sees a log:
   the page sends the metrics JSON only (settings, spectra peaks, step
   metrics, findings) — a few KB of numbers. */

const MAX_BODY = 32 * 1024;

const SYSTEM = `You are the QuadMath Tune Advisor: a Betaflight tuning reviewer who reads blackbox-derived metrics and gives a pilot one clear next step.

You receive JSON produced by quadmath.com/blackbox.html: firmware, PID/filter settings, per-axis noise spectrum peaks (filtered and, when present, unfiltered), step-response metrics (rise ms to 90%, overshoot %, settle ms, steady-state, oscillation count, window count), motor saturation/spread, battery sag, a propwash ratio, and the rule-engine's own findings.

Rules:
- Think like a tuner, not a manual. Whoops (65–85mm, 1S/2S, 0702–1103 motors) behave differently from 5": more propwash, lower log rates, packs sag hard, D is heat-limited. Use craft name, cell count, motor KV and PID magnitudes to infer the class; say which you assumed.
- Trust numbers over the rule engine. If a rule finding looks wrong given the data (few windows, short log, low log rate, no unfiltered gyro), say so plainly.
- Recommend ONE change to fly next, with the exact Betaflight CLI line using names correct for the firmware version in the JSON (4.2 names differ from 4.3+; 2025.x/2026.x use 4.5 names). Then at most two "after that" items.
- Never invent measurements. If something needed is missing, name the log setting to enable (e.g. debug_mode = GYRO_SCALED, blackbox_sample_rate).
- Plain text with short headers, no markdown tables, under 300 words. No preamble, no sign-off.

Format exactly:
READ
<2–4 sentences: what this log says about the tune>

FINDINGS CHECK
<one line per notable rule finding: agree / disagree / can't tell, and why>

FLY THIS NEXT
<one CLI block, then one sentence on what to feel for>

AFTER THAT
<up to two bullets>`;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = corsHeaders(origin, allowed);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (url.pathname === '/health') return json({ ok: true, model: env.MODEL }, 200, cors);
    if (req.method !== 'POST' || url.pathname !== '/v1/blackbox') return json({ error: 'not found' }, 404, cors);
    if (allowed.length && !allowed.includes(origin)) return json({ error: 'origin not allowed' }, 403, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'advisor not configured' }, 503, cors);

    // Size guard before reading the body.
    const len = +(req.headers.get('Content-Length') || 0);
    if (len > MAX_BODY) return json({ error: 'payload too large' }, 413, cors);
    let body;
    try { body = await req.text(); } catch { return json({ error: 'bad body' }, 400, cors); }
    if (body.length > MAX_BODY) return json({ error: 'payload too large' }, 413, cors);
    let metrics;
    try { metrics = JSON.parse(body); } catch { return json({ error: 'body must be JSON' }, 400, cors); }
    if (!metrics || typeof metrics !== 'object' || !Array.isArray(metrics.axes) || typeof metrics.firmware !== 'string') {
      return json({ error: 'not a QuadMath blackbox metrics payload' }, 400, cors);
    }

    // Per-IP hourly rate limit in KV. Best-effort: if KV is missing, allow.
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const limit = +(env.RATE_LIMIT_PER_HOUR || 10);
    if (env.ADVISOR_RL) {
      const key = `rl:${ip}:${Math.floor(Date.now() / 3600000)}`;
      const n = +((await env.ADVISOR_RL.get(key)) || 0);
      if (n >= limit) return json({ error: `rate limit: ${limit} reads per hour` }, 429, cors);
      await env.ADVISOR_RL.put(key, String(n + 1), { expirationTtl: 3700 });
    }

    // Strip anything bulky the page might have left in; the model only needs numbers.
    const slim = slimMetrics(metrics);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.MODEL || 'claude-sonnet-4-5',
        max_tokens: +(env.MAX_OUTPUT_TOKENS || 700),
        system: SYSTEM,
        messages: [{ role: 'user', content: `Blackbox metrics JSON:\n${JSON.stringify(slim)}` }],
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return json({ error: `upstream ${r.status}`, detail: t.slice(0, 300) }, 502, cors);
    }
    const out = await r.json();
    const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    return json({ text, model: out.model, usage: out.usage }, 200, cors);
  },
};

function slimMetrics(m) {
  const axes = (m.axes || []).map(a => ({
    name: a.name, peaks: a.peaks, peaksRaw: a.peaksRaw, noise: a.noise, step: a.step,
  }));
  return {
    firmware: m.firmware, board: m.board, craft: m.craft, debugMode: m.debugMode,
    log: m.log, pids: m.pids, ff: m.ff, dMin: m.dMin, filters: m.filters, simplified: m.simplified,
    axes, motors: m.motors, battery: m.battery, propwash: m.propwash, throttle: m.throttle,
    findings: (m.findings || []).slice(0, 20),
  };
}

function corsHeaders(origin, allowed) {
  const h = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
  if (!allowed.length || allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin || '*';
  return h;
}

function json(obj, status, extra) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...extra } });
}
