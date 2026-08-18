'use client';

import type { ComponentPropsWithoutRef } from 'react';

export type NaliraSemanticIconName =
  | 'ask-nalira'
  | 'checkpoint'
  | 'concept'
  | 'cross-material'
  | 'formula'
  | 'learning-path'
  | 'quiz'
  | 'relationship'
  | 'review'
  | 'source-evidence'
  | 'speaker-context'
  | 'summary-clarity';

interface SemanticIconProps extends Omit<ComponentPropsWithoutRef<'svg'>, 'children'> {
  name: NaliraSemanticIconName;
  size?: 16 | 18 | 20 | 24;
}

/** Approved Nalira semantic sprite facade. Functional controls still use Lucide. */
export function SemanticIcon({
  name,
  size = 20,
  className = '',
  ...props
}: SemanticIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`nalira-semantic-icon ${className}`}
      aria-hidden="true"
      focusable="false"
      data-semantic-icon={name}
      {...props}
    >
      <use href={`/assets/nalira/sprites/nalira-semantic-icons.svg#nalira-icon-${name}`} />
    </svg>
  );
}
