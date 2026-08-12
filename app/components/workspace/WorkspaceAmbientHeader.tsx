import type { ReactNode } from 'react';

export type WorkspaceAmbientHeaderVariant = 'courses' | 'shared' | 'capture' | 'ask';
export type WorkspaceAmbientHeaderState = 'default' | 'inbound' | 'outbound' | 'upload' | 'record';

interface WorkspaceAmbientHeaderProps {
  variant: WorkspaceAmbientHeaderVariant;
  title: string;
  description: string;
  state?: WorkspaceAmbientHeaderState;
  action?: ReactNode;
  meta?: ReactNode;
}

function CoursesScene() {
  return (
    <span className="notara-workspace-ambient__scene notara-workspace-ambient__scene--courses" aria-hidden="true">
      <span className="notara-workspace-ambient__course-path" />
      <span className="notara-workspace-ambient__course-node notara-workspace-ambient__course-node--one" />
      <span className="notara-workspace-ambient__course-node notara-workspace-ambient__course-node--two" />
      <span className="notara-workspace-ambient__course-node notara-workspace-ambient__course-node--active" />
      <span className="notara-workspace-ambient__course-signal" />
    </span>
  );
}

function SharedScene() {
  return (
    <span className="notara-workspace-ambient__scene notara-workspace-ambient__scene--shared" aria-hidden="true">
      <span className="notara-workspace-ambient__share-boundary" />
      <span className="notara-workspace-ambient__share-core" />
      <span className="notara-workspace-ambient__share-line notara-workspace-ambient__share-line--in" />
      <span className="notara-workspace-ambient__share-line notara-workspace-ambient__share-line--out" />
      <span className="notara-workspace-ambient__share-packet notara-workspace-ambient__share-packet--in" />
      <span className="notara-workspace-ambient__share-packet notara-workspace-ambient__share-packet--out" />
    </span>
  );
}

function CaptureScene() {
  return (
    <span className="notara-workspace-ambient__scene notara-workspace-ambient__scene--capture" aria-hidden="true">
      <span className="notara-workspace-ambient__capture-wave">
        <i /><i /><i /><i /><i /><i /><i />
      </span>
      <span className="notara-workspace-ambient__capture-fold" />
      <span className="notara-workspace-ambient__capture-notes"><i /><i /><i /></span>
    </span>
  );
}

function AskScene() {
  return (
    <span className="notara-workspace-ambient__scene notara-workspace-ambient__scene--ask" aria-hidden="true">
      <span className="notara-workspace-ambient__ask-source notara-workspace-ambient__ask-source--one" />
      <span className="notara-workspace-ambient__ask-source notara-workspace-ambient__ask-source--two" />
      <span className="notara-workspace-ambient__ask-source notara-workspace-ambient__ask-source--three" />
      <span className="notara-workspace-ambient__ask-line notara-workspace-ambient__ask-line--one" />
      <span className="notara-workspace-ambient__ask-line notara-workspace-ambient__ask-line--two" />
      <span className="notara-workspace-ambient__ask-line notara-workspace-ambient__ask-line--three" />
      <span className="notara-workspace-ambient__ask-answer" />
    </span>
  );
}

function AmbientScene({ variant }: { variant: WorkspaceAmbientHeaderVariant }) {
  if (variant === 'courses') return <CoursesScene />;
  if (variant === 'shared') return <SharedScene />;
  if (variant === 'capture') return <CaptureScene />;
  return <AskScene />;
}

export function WorkspaceAmbientHeader({
  variant,
  title,
  description,
  state = 'default',
  action,
  meta,
}: WorkspaceAmbientHeaderProps) {
  return (
    <header
      className="notara-workspace-ambient"
      data-ambient-variant={variant}
      data-ambient-state={state}
    >
      <div className="notara-workspace-ambient__copy">
        <h1>{title}</h1>
        <p>{description}</p>
        {(meta || action) && (
          <div className="notara-workspace-ambient__footer">
            {meta && <div className="notara-workspace-ambient__meta">{meta}</div>}
            {action && <div className="notara-workspace-ambient__action">{action}</div>}
          </div>
        )}
      </div>
      <AmbientScene variant={variant} />
    </header>
  );
}
