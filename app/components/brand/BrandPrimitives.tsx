'use client';

import type { ComponentPropsWithoutRef } from 'react';
import { PRODUCT_IDENTITY } from '../../../lib/brand/identity';

export interface BrandMarkProps extends ComponentPropsWithoutRef<'svg'> {
  size?: number;
  animated?: boolean;
}

export function BrandMark({ size = 32, animated = false, className = '', ...props }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={`notara-brand-mark ${animated ? 'notara-brand-mark--animated' : ''} ${className}`}
      role="img"
      aria-label={`${PRODUCT_IDENTITY.name} placeholder mark`}
      data-brand-placeholder="neutral"
      {...props}
    >
      <rect className="notara-brand-mark__frame" x="4" y="4" width="24" height="24" rx="9" />
      <path className="notara-brand-mark__signal" d="M10 11.5h12" />
      <path className="notara-brand-mark__fold" d="M10 16h8" />
      <path className="notara-brand-mark__note" d="M10 20.5h12" />
      <circle className="notara-brand-mark__source" cx="22" cy="16" r="1.75" />
    </svg>
  );
}

export interface BrandWordmarkProps {
  compact?: boolean;
  className?: string;
}

export function BrandWordmark({ compact = false, className = '' }: BrandWordmarkProps) {
  return (
    <span className={`notara-wordmark-v4 ${compact ? 'notara-wordmark-v4--compact' : ''} ${className}`}>
      nalira
    </span>
  );
}

export const Wordmark = BrandWordmark;

export interface BrandLockupProps {
  size?: number;
  orientation?: 'horizontal' | 'stacked';
  animated?: boolean;
  compact?: boolean;
  className?: string;
}

export function BrandLockup({
  size = 32,
  orientation = 'horizontal',
  animated = false,
  compact = false,
  className = '',
}: BrandLockupProps) {
  return (
    <span
      className={`notara-brand notara-brand--${orientation} ${className}`}
      role="img"
      aria-label={PRODUCT_IDENTITY.name}
    >
      <BrandMark size={size} animated={animated} aria-hidden="true" />
      <BrandWordmark compact={compact || size < 32} />
    </span>
  );
}

export function ProcessingMark({ size = 112 }: { size?: number }) {
  return (
    <span
      className="notara-processing-mark"
      role="status"
      aria-label={`${PRODUCT_IDENTITY.name} sedang memproses`}
    >
      <BrandMark size={size} animated aria-hidden="true" />
    </span>
  );
}
