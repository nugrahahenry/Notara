'use client';

import type { ComponentPropsWithoutRef } from 'react';

interface BrandMarkProps extends ComponentPropsWithoutRef<'svg'> {
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
      aria-label="Notara"
      {...props}
    >
      <path
        className="notara-brand-mark__signal"
        d="M4 8.5h5.2c2.2 0 3.1 1.2 4.2 3.5l1.4 3.2c1 2.3 2.1 3.5 4.4 3.5H28"
      />
      <path
        className="notara-brand-mark__fold"
        d="M4 15.9h5.1c2.3 0 3.5 1.1 4.6 3.2l1.2 2.2c1.1 2 2.3 2.8 4.6 2.8H25a3 3 0 0 0 3-3V8.5"
      />
      <path className="notara-brand-mark__note" d="M19.5 8.5H28v8.4" />
      <circle className="notara-brand-mark__source" cx="4" cy="8.5" r="1.75" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`notara-wordmark-v4 ${compact ? 'notara-wordmark-v4--compact' : ''}`}>
      notara
    </span>
  );
}

export function ProcessingMark({ size = 112 }: { size?: number }) {
  return (
    <span className="notara-processing-mark" role="status" aria-label="Notara sedang memproses">
      <BrandMark size={size} animated aria-hidden="true" />
    </span>
  );
}
