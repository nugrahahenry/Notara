'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { PRODUCT_IDENTITY } from '../../../lib/brand/identity';
import { BrandLockup, BrandMark, ProcessingMark } from './BrandPrimitives';

export type NaliraBrandVariant = 'icon' | 'horizontal' | 'stacked' | 'processing';
export type NaliraBrandState = 'idle' | 'loading' | 'recording' | 'transcribing' | 'summarizing' | 'thinking';

export interface NaliraBrandProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
  variant?: NaliraBrandVariant;
  size?: number;
  animated?: boolean;
  motionState?: NaliraBrandState;
  showGlow?: boolean;
}

/** Compatibility facade while legacy internal identifiers remain intentionally stable. */
export function NaliraBrand({
  variant = 'icon',
  size = 32,
  animated = false,
  motionState = 'idle',
  showGlow = false,
  className = '',
  ...props
}: NaliraBrandProps) {
  const glowClass = showGlow ? 'notara-brand--glow' : '';

  if (variant === 'processing') {
    return (
      <span className={`notara-brand notara-brand--processing ${glowClass} ${className}`} data-motion-state={motionState} {...props}>
        <ProcessingMark size={size} />
      </span>
    );
  }

  if (variant === 'horizontal' || variant === 'stacked') {
    return (
      <span className={`${glowClass} ${className}`} data-motion-state={motionState} {...props}>
        <BrandLockup size={size} orientation={variant} animated={animated} compact={size < 32} />
      </span>
    );
  }

  return (
    <span className={`notara-brand notara-brand--icon ${glowClass} ${className}`} data-motion-state={motionState} role="img" aria-label={PRODUCT_IDENTITY.name} {...props}>
      <BrandMark size={size} animated={animated} aria-hidden="true" />
    </span>
  );
}

export default NaliraBrand;
