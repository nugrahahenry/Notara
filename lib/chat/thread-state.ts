export function shouldLoadChatThreadHistory(
  activeThreadId: string | null,
  locallyInitializedThreadId: string | null,
): boolean {
  return Boolean(
    activeThreadId && activeThreadId !== locallyInitializedThreadId,
  );
}
