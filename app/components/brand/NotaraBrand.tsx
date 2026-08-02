'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { BrandMark, ProcessingMark, Wordmark } from './BrandPrimitives';

export type NotaraBrandVariant = 'icon' | 'horizontal' | 'stacked' | 'processing';
export type NotaraBrandState =
  | 'idle'
  | 'loading'
  | 'recording'
  | 'transcribing'
  | 'summarizing'
  | 'thinking';

export interface NotaraBrandProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  variant?: NotaraBrandVariant;
  size?: number;
  animated?: boolean;
  motionState?: NotaraBrandState;
  showGlow?: boolean;
}

/**
 * The only public brand facade used by application surfaces.
 *
 * Its temporary code-native geometry can be replaced by Brand HQ without
 * changing consumers, shell layout, capture state, or product capabilities.
 */
export function NotaraBrand({
  variant = 'icon',
  size = 32,
  animated = false,
  motionState = 'idle',
  showGlow = false,
  className = '',
  ...props
}: NotaraBrandProps) {
  const layoutClass = variant === 'stacked'
    ? 'notara-brand--stacked'
    : variant === 'horizontal'
      ? 'notara-brand--horizontal'
      : 'notara-brand--icon';

  if (variant === 'processing') {
    return (
      <span
        className={`notara-brand notara-brand--processing ${showGlow ? 'notara-brand--glow' : ''} ${className}`}
        data-motion-state={motionState}
        {...props}
      >
        <ProcessingMark size={size} />
      </span>
    );
  }

  return (
    <span
      className={`notara-brand ${layoutClass} ${showGlow ? 'notara-brand--glow' : ''} ${className}`}
      data-motion-state={motionState}
      role="img"
      aria-label="Notara"
      {...props}
    >
      <BrandMark size={size} animated={animated} aria-hidden="true" />
      {variant !== 'icon' && <Wordmark compact={size < 32} />}
    </span>
  );
}

export default NotaraBrand;
