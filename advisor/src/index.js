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
- D-term scheme: the JSON's dScheme says which this firmware uses. kind "d_max" (the 2025.x/2026.x date-versioned releases): d_<axis> is the FLOOR and d_max_<axis> the CEILING; d_min_* does not exist — never emit it. kind "d_min" (4.2 through 4.5): d_min_<axis> is the floor, d_<axis> the ceiling; d_max_* does not exist there. Trust dScheme over the version number. dScheme.current lists every current value under its exact CLI name — read from there, never guess. In either scheme floor must stay <= ceiling; if you move one, move the other to keep that true.
- Overshoot or ringing on an axis is damping shortfall: raise that axis's D ceiling (and floor with it) or lower P. Never lower D to fix overshoot. Slow, mushy response with no overshoot is the case for lowering D or raising P.
- Use the exact parameter names in cliNames for filters and feedforward.
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
    const blocks = out.content || [];
    const text = blocks.filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    if (!text) {
      // A model that answers only with non-text blocks (thinking, tool use) or
      // stops before emitting text must fail loudly, not as a blank card.
      return json({
        error: `empty reply from ${out.model || env.MODEL} (stop_reason ${out.stop_reason || '?'}, blocks: ${blocks.map(b => b.type).join(',') || 'none'})`,
      }, 502, cors);
    }
    return json({ text: lintCli(text, slim), model: out.model, usage: out.usage, stop_reason: out.stop_reason }, 200, cors);
  },
};

/* Cheap sanity checks on the CLI the model wrote. Appends a CHECK section
   rather than editing the advice: the pilot should see the model's words and
   the objection side by side. */
function lintCli(text, m) {
  const warns = [];
  const ds = m.dScheme || {};
  const kind = ds.kind, cur = ds.current || {};
  const sets = {};
  for (const mt of text.matchAll(/^\s*set\s+([a-z0-9_]+)\s*=\s*(-?\d+)/gim)) sets[mt[1].toLowerCase()] = +mt[2];
  const keys = Object.keys(sets);
  if (kind === 'd_max' && keys.some(k => k.startsWith('d_min_'))) warns.push('this firmware has no d_min_* — it uses d_<axis> as the floor and d_max_<axis> as the ceiling. That line will be rejected by the CLI.');
  if (kind === 'd_min' && keys.some(k => k.startsWith('d_max_'))) warns.push('this firmware has no d_max_* — it uses d_min_<axis> as the floor and d_<axis> as the ceiling.');
  const overshoot = new Set((m.findings || []).filter(f => /overshoot|ringing/i.test(f.title)).map(f => (f.title.match(/^(roll|pitch|yaw)/i) || [,''])[1].toLowerCase()));
  for (const ax of ['roll', 'pitch', 'yaw']) {
    const fk = kind === 'd_max' ? `d_${ax}` : `d_min_${ax}`;
    const ck = kind === 'd_max' ? `d_max_${ax}` : `d_${ax}`;
    const floor = sets[fk] ?? cur[fk], ceil = sets[ck] ?? cur[ck];
    if (floor != null && ceil != null && ceil > 0 && floor > ceil) warns.push(`${ax}: D floor ${floor} is above the D ceiling ${ceil}. Betaflight will clamp it — set both.`);
    if (overshoot.has(ax)) {
      for (const k of [fk, ck]) if (sets[k] != null && cur[k] != null && sets[k] < cur[k]) warns.push(`${ax}: ${k} lowered ${cur[k]}→${sets[k]} on an axis that overshoots. Less D means more overshoot — this is backwards unless D is also the noise problem.`);
    }
  }
  if (!warns.length) return text;
  return text + '\n\nCHECK\n' + warns.map(w => '- ' + w).join('\n');
}

function slimMetrics(m) {
  const axes = (m.axes || []).map(a => ({
    name: a.name, peaks: a.peaks, peaksRaw: a.peaksRaw, noise: a.noise, step: a.step,
  }));
  return {
    firmware: m.firmware, board: m.board, craft: m.craft, debugMode: m.debugMode,
    log: m.log, pids: m.pids, ff: m.ff, dScheme: m.dScheme, cliNames: m.cliNames, filters: m.filters, simplified: m.simplified,
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
