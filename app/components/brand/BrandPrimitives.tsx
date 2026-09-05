'use client';

import type { ComponentPropsWithoutRef, CSSProperties } from 'react';
import Image from 'next/image';
import { PRODUCT_IDENTITY } from '../../../lib/brand/identity';

export interface BrandMarkProps extends ComponentPropsWithoutRef<'span'> {
  size?: number;
  animated?: boolean;
}

export function BrandMark({ size = 32, animated = false, className = '', style, ...props }: BrandMarkProps) {
  const visualStyle = {
    '--nalira-brand-size': `${size}px`,
    ...style,
  } as CSSProperties;

  return (
    <span
      className={`notara-brand-mark ${animated ? 'notara-brand-mark--animated' : ''} ${className}`}
      role="img"
      aria-label={`${PRODUCT_IDENTITY.name} mark`}
      data-nl-identity="mark"
      style={visualStyle}
      {...props}
    >
      <Image
        className="notara-brand-asset notara-brand-asset--light"
        src="/assets/nalira/brand/nalira-mark-standard.svg"
        alt=""
        width={size}
        height={size}
      />
      <Image
        className="notara-brand-asset notara-brand-asset--dark"
        src="/assets/nalira/brand/nalira-mark-reversed-indigo.svg"
        alt=""
        width={size}
        height={size}
      />
    </span>
  );
}

export interface BrandWordmarkProps {
  compact?: boolean;
  className?: string;
}

export function BrandWordmark({ compact = false, className = '' }: BrandWordmarkProps) {
  return (
    <span data-nl-identity="wordmark" className={`notara-wordmark-v4 ${compact ? 'notara-wordmark-v4--compact' : ''} ${className}`}>
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
      <BrandMark size={size} aria-hidden="true" />
    </span>
  );
}
