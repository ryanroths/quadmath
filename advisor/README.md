# Tune Advisor Worker

Cloudflare Worker behind `advisor.quadmath.com`. Takes the metrics JSON that
`blackbox.html` computes in the browser, asks the Anthropic API for a tuning
read, returns plain text. Logs never leave the pilot's browser; only numbers
reach the Worker.

## First deploy (once)

```
npm i -g wrangler
cd advisor
wrangler login                                  # opens a browser
wrangler kv namespace create ADVISOR_RL         # paste the id into wrangler.toml
wrangler secret put ANTHROPIC_API_KEY           # paste the key
wrangler deploy
curl https://advisor.quadmath.com/health
```

## Every later deploy

```
cd advisor && wrangler deploy
```

## Knobs (wrangler.toml [vars])

- `MODEL` — Anthropic model id.
- `MAX_OUTPUT_TOKENS` — reply cap; 700 ≈ 300 words.
- `RATE_LIMIT_PER_HOUR` — per IP, counted in KV.
- `ALLOWED_ORIGINS` — CORS allow-list; requests from anywhere else get 403.

Cost is roughly 3k input + 0.5k output tokens per read.
