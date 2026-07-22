export function timeAgo(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return "unknown";
  const diff = Date.now() / 1000 - epochSeconds;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}
