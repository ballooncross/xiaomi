import { config } from '../config';
import { log } from '../utils';
import { buildTrendPrompt, parseAiResponse, type AiSearchResult } from './prompts';
import type { AgentContext } from '../types';

/**
 * Ask the configured AI backend for trends from its own knowledge.
 * Backends: chatgpt (default) | deepseek | ollama | claude | none.
 */
export async function runAiSearch(context: AgentContext): Promise<AiSearchResult> {
  const empty: AiSearchResult = { items: [], suggestedSources: [] };
  const backend = config.aiBackend;
  if (backend === 'none') return empty;

  const prompt = buildTrendPrompt(context);
  let text: string | undefined;

  try {
    if (backend === 'chatgpt') text = await callOpenAiCompatible('https://api.openai.com/v1/chat/completions', config.openaiApiKey, config.openaiModel, prompt);
    else if (backend === 'deepseek') text = await callOpenAiCompatible('https://api.deepseek.com/chat/completions', config.deepseekApiKey, config.deepseekModel, prompt);
    else if (backend === 'claude') text = await callClaude(prompt);
    else if (backend === 'ollama') text = await callOllama(prompt);
    else {
      log(`Unknown AI_BACKEND "${backend}", skipping AI search`);
      return empty;
    }
  } catch (error) {
    log(`AI search error (${backend}): ${error}`);
    return empty;
  }

  if (!text) return empty;
  const result = parseAiResponse(text, backend);
  log(`AI search (${backend}): ${result.items.length} items, ${result.suggestedSources.length} source suggestions`);
  return result;
}

async function callOpenAiCompatible(url: string, apiKey: string, model: string, prompt: string): Promise<string | undefined> {
  if (!apiKey) {
    log(`AI backend "${config.aiBackend}" has no API key configured, skipping AI search`);
    return undefined;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.4
    })
  });
  if (!response.ok) {
    log(`AI request failed: ${response.status} ${await response.text().catch(() => '')}`);
    return undefined;
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content;
}

async function callClaude(prompt: string): Promise<string | undefined> {
  if (!config.anthropicApiKey) {
    log('AI backend "claude" has no ANTHROPIC_API_KEY, skipping AI search');
    return undefined;
  }
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!response.ok) {
    log(`Claude request failed: ${response.status}`);
    return undefined;
  }
  const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  return data.content?.find((block) => block.type === 'text')?.text;
}

async function callOllama(prompt: string): Promise<string | undefined> {
  const response = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
      stream: false
    })
  }).catch(() => undefined);
  if (!response?.ok) {
    log(`Ollama not reachable at ${config.ollamaUrl}, skipping AI search`);
    return undefined;
  }
  const data = (await response.json()) as { message?: { content?: string } };
  return data.message?.content;
}
