# AI Configuration

The deployed app (Cloudflare Pages and the cron Worker) does not call any AI service. Fetching, matching, scoring, dedupe, digests, and notifications are rule-based.

AI runs only in the local agent (`scripts/agent.ts`), with the backend chosen by `AI_BACKEND` in `scripts/.env`:

| Backend | How it authenticates | Reads banner images |
| --- | --- | --- |
| `codex` (default) | logged-in Codex CLI | yes |
| `claude-code` | logged-in Claude Code CLI | yes |
| `chatgpt` | `OPENAI_API_KEY` | yes |
| `claude` | `ANTHROPIC_API_KEY` | yes |
| `deepseek` | `DEEPSEEK_API_KEY` | no |
| `ollama` | local server | no |
| `none` | AI disabled | no |

The local agent uses AI for:

- trend discovery from the model's own knowledge, and source suggestions
- refining newly added interests into searchable topics
- reading The Ride Side banner images that the promotion check queued

When a backend cannot read images, queued banners stay queued and the agent reports an `error` tick until `AI_BACKEND` changes.

Keep sensitive private notes out of AI prompts until privacy requirements are explicit.
