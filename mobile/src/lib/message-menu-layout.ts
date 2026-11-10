export type MessageAnchor = { x: number; y: number; width?: number; height?: number };

export function messageMenuLayout(anchor: MessageAnchor, viewport: { width: number; height: number; top: number; bottom: number; left: number; right: number }, outgoing: boolean, reactions: boolean, preferredMenuHeight: number) {
  const minX = viewport.left + 12;
  const maxX = viewport.width - viewport.right - 12;
  const minY = viewport.top + 12;
  const maxY = viewport.height - viewport.bottom - 12;
  const availableHeight = maxY - minY;
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));
  const bubbleWidth = Math.min(anchor.width ?? 220, maxX - minX);
  const bubbleHeight = Math.min(anchor.height ?? 80, availableHeight * .28);
  const bubbleLeft = clamp(anchor.x, minX, maxX - bubbleWidth);
  const reactionHeight = reactions ? 58 : 0;
  const menuWidth = Math.min(240, maxX - minX);
  const menuHeight = Math.min(preferredMenuHeight, Math.max(80, availableHeight - bubbleHeight - reactionHeight - 10));
  const groupHeight = reactionHeight + bubbleHeight + 10 + menuHeight;
  const groupTop = clamp(anchor.y - reactionHeight, minY, maxY - groupHeight);
  const bubbleTop = groupTop + reactionHeight;
  const reactionWidth = Math.min(336, maxX - minX);
  return {
    bubble: { left: bubbleLeft, top: bubbleTop, width: bubbleWidth, height: bubbleHeight },
    reactions: { left: clamp(outgoing ? bubbleLeft + bubbleWidth - reactionWidth : bubbleLeft, minX, maxX - reactionWidth), top: groupTop, width: reactionWidth },
    menu: { left: clamp(outgoing ? bubbleLeft + bubbleWidth - menuWidth : bubbleLeft, minX, maxX - menuWidth), top: bubbleTop + bubbleHeight + 10, width: menuWidth, maxHeight: menuHeight },
  };
}
