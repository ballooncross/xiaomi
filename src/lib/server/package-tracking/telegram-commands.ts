export type PackageBotCommand =
  | { type: 'track' | 'untrack'; trackingNumber: string }
  | { type: 'packages' | 'help' }
  | { type: 'unknown' };

export function parsePackageBotCommand(text: string): PackageBotCommand {
  const match = text.trim().match(/^\/(track|untrack|packages|help)(?:@\w+)?(?:\s+(.+))?$/i);
  if (!match) return { type: 'unknown' };
  const type = match[1].toLowerCase() as 'track' | 'untrack' | 'packages' | 'help';
  if (type === 'track' || type === 'untrack') return { type, trackingNumber: (match[2] ?? '').trim() };
  return { type };
}
