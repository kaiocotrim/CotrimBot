// Derive the color from a stable identity so pagination and reloads keep it.
export function participantColor(identity: string, lightBackground = false) {
  let hash = 2166136261;
  for (const character of identity) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }
  const hue = (hash >>> 0) % 3600 / 10;
  return `hsl(${hue} 70% ${lightBackground ? 32 : 74}%)`;
}
