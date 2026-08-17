export function ensureUniqueChatMessageIds<T extends { id: string }>(messages: T[]): T[] {
  const usedIds = new Set<string>();
  const occurrences = new Map<string, number>();

  return messages.map((message) => {
    const originalId = message.id;
    let occurrence = (occurrences.get(originalId) ?? 0) + 1;
    occurrences.set(originalId, occurrence);
    if (!usedIds.has(originalId)) {
      usedIds.add(originalId);
      return message;
    }

    let uniqueId = `${originalId}--${occurrence}`;
    while (usedIds.has(uniqueId)) {
      occurrence += 1;
      occurrences.set(originalId, occurrence);
      uniqueId = `${originalId}--${occurrence}`;
    }
    usedIds.add(uniqueId);
    return { ...message, id: uniqueId };
  });
}
