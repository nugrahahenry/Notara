'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from './ThemeProvider';

const themeOptions: Array<{ value: ThemePreference; label: string; description: string; icon: typeof Monitor }> = [
  { value: 'system', label: 'System', description: 'Ikuti perangkat', icon: Monitor },
  { value: 'light', label: 'Light', description: 'Latar terang', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'Latar gelap', icon: Moon },
];

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeOption = themeOptions.find((option) => option.value === preference) ?? themeOptions[0];
  const Icon = activeOption.icon;

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="notara-theme-switcher">
      <button
        ref={triggerRef}
        type="button"
        className="notara-theme-trigger"
        aria-label="Pilih tema tampilan"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="notara-theme-menu"
        onClick={() => setOpen((value) => !value)}
      >
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="notara-theme-label">{activeOption.label}</span>
        <ChevronDown aria-hidden="true" className="notara-theme-chevron h-3.5 w-3.5" />
      </button>

      {open && (
        <div id="notara-theme-menu" className="notara-theme-menu" role="listbox" aria-label="Tema tampilan">
          {themeOptions.map((option) => {
            const OptionIcon = option.icon;
            const selected = option.value === preference;
            return (
              <button
                key={option.value}
                type="button"
                className="notara-theme-option"
                role="option"
                aria-selected={selected}
                onClick={() => {
                  setPreference(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
              >
                <OptionIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                {selected && <Check aria-hidden="true" className="notara-theme-option-check h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
