# AI Configuration

AI is optional. The app is designed to work with deterministic matching, scoring, feedback, and template digests.

## Recommended MVP Settings

```env
AI_ENABLED=auto
AI_PROVIDER=gemini
AI_FALLBACK_PROVIDER=deepseek
AI_MAX_ITEMS_PER_DAY=20
AI_MONTHLY_BUDGET_USD=1
```

When AI is available, the app uses it only for:

- short item summaries
- relevance reason text
- future digest wording improvements

The app does not use AI for:

- fetching
- source truth
- core matching
- critical notification decisions
- processing every item

## AI-Off Mode

```env
AI_ENABLED=false
```

This is fully supported.

## Provider Notes

Gemini is the free-first provider when `GEMINI_API_KEY` is present.

Gemini does not appear to expose a separate sandbox/dev key type. Treat local and production as separate operational keys: create a separate API key, or a separate Google Cloud project if you want cleaner quota and billing separation.

DeepSeek is a cheap fallback when `DEEPSEEK_API_KEY` is present:

```env
DEEPSEEK_MODEL=deepseek-v4-flash
```

Keep sensitive private notes out of AI prompts until privacy requirements are explicit.

## Getting A Gemini API Key

1. Go to Google AI Studio.
2. Open the API keys page.
3. Create an API key for a Google Cloud project.
4. Copy the key.

Use it locally:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```env
AI_ENABLED=auto
AI_PROVIDER=gemini
GEMINI_API_KEY=your_local_gemini_key
```

For Cloudflare production:

```bash
npx wrangler pages secret put GEMINI_API_KEY --project-name personal-radar
npx wrangler secret put GEMINI_API_KEY --config wrangler.cron.toml
```

The first command sets the key for the deployed SvelteKit Pages app. The second sets the key for the separate scheduled cron Worker.

## Getting A DeepSeek API Key

1. Go to the DeepSeek platform.
2. Sign in.
3. Open API keys.
4. Create a new key.
5. Add balance if your account has no granted balance.

Use it locally in `.env.local`:

```env
AI_FALLBACK_PROVIDER=deepseek
DEEPSEEK_API_KEY=your_local_deepseek_key
DEEPSEEK_MODEL=deepseek-v4-flash
```

For Cloudflare production:

```bash
npx wrangler pages secret put DEEPSEEK_API_KEY --project-name personal-radar
npx wrangler secret put DEEPSEEK_API_KEY --config wrangler.cron.toml
```

## Local Key Files

For normal SvelteKit local development:

```bash
cp .env.example .env.local
npm run dev
```

For Cloudflare-like local development with Wrangler:

```bash
cp .env.example .dev.vars
npx wrangler pages dev .svelte-kit/cloudflare --d1 DB=personal-radar
```

For local vs production API keys, create separate keys where the provider allows it and put only the local/dev key in `.env.local`. Production keys should be set as Cloudflare secrets, not committed files.

Never commit `.env`, `.env.local`, or `.dev.vars`.
