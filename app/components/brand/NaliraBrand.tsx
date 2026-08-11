'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { PRODUCT_IDENTITY } from '../../../lib/brand/identity';
import { BrandMark, ProcessingMark, Wordmark } from './BrandPrimitives';

export type NaliraBrandVariant = 'icon' | 'horizontal' | 'stacked' | 'processing';
export type NaliraBrandState =
  | 'idle'
  | 'loading'
  | 'recording'
  | 'transcribing'
  | 'summarizing'
  | 'thinking';

export interface NaliraBrandProps
  extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  variant?: NaliraBrandVariant;
  size?: number;
  animated?: boolean;
  motionState?: NaliraBrandState;
  showGlow?: boolean;
}

/**
 * Public brand facade for application surfaces.
 *
 * The current code-native geometry remains intentionally replaceable while
 * the final Nalira asset system is still being defined.
 */
export function NaliraBrand({
  variant = 'icon',
  size = 32,
  animated = false,
  motionState = 'idle',
  showGlow = false,
  className = '',
  ...props
}: NaliraBrandProps) {
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
      aria-label={PRODUCT_IDENTITY.name}
      {...props}
    >
      <BrandMark size={size} animated={animated} aria-hidden="true" />
      {variant !== 'icon' && <Wordmark compact={size < 32} />}
    </span>
  );
}

export default NaliraBrand;
