export type RecordingBoundaryAction = 'continue' | 'remind' | 'stop';

const DEFAULT_REMINDER_INTERVAL_SECONDS = 30 * 60;

export function getRecordingBoundaryAction(
  elapsedSeconds: number,
  limitSeconds: number,
  reminderIntervalSeconds = DEFAULT_REMINDER_INTERVAL_SECONDS,
): RecordingBoundaryAction {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 'continue';
  if (!Number.isFinite(limitSeconds) || limitSeconds <= 0) return 'stop';
  if (elapsedSeconds >= limitSeconds) return 'stop';

  if (
    Number.isFinite(reminderIntervalSeconds) &&
    reminderIntervalSeconds > 0 &&
    elapsedSeconds % reminderIntervalSeconds === 0
  ) {
    return 'remind';
  }

  return 'continue';
}

interface StoppableMediaRecorder {
  state: string;
  stop: () => void;
}

/** Finalize the live recorder from refs, even when React state in a timer is stale. */
export function stopActiveRecorder(
  recorder: StoppableMediaRecorder | null,
): boolean {
  if (!recorder || recorder.state === 'inactive') return false;
  recorder.stop();
  return true;
}

