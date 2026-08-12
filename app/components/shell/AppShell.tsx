'use client';

import {
  useEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';

interface AppShellRootProps {
  children: ReactNode;
}

export function AppShellRoot({ children }: AppShellRootProps) {
  return (
    <div className="notara-app-shell">
      <a className="notara-skip-link" href="#notara-main-content">
        Lewati ke konten utama
      </a>
      {children}
    </div>
  );
}

interface AppShellSidebarProps {
  mobileOpen: boolean;
  expanded: boolean;
  onCloseMobile: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function AppShellSidebar({
  mobileOpen,
  expanded,
  onCloseMobile,
  triggerRef,
  children,
}: AppShellSidebarProps) {
  const sidebarRef = useRef<HTMLElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!mobileOpen) {
      if (wasOpenRef.current) triggerRef.current?.focus();
      wasOpenRef.current = false;
      return;
    }

    wasOpenRef.current = true;
    const sidebar = sidebarRef.current;
    const focusableElements = sidebar
      ? Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector)).filter(
          (element) => element.offsetParent !== null && element.getAttribute('aria-hidden') !== 'true',
        )
      : [];
    // Let the trigger's native click focus settle before moving focus into the drawer.
    const focusTimer = window.setTimeout(() => focusableElements[0]?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseMobile();
        return;
      }

      if (event.key !== 'Tab' || focusableElements.length === 0) return;
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [mobileOpen, onCloseMobile, triggerRef]);

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="notara-shell-backdrop"
          aria-label="Tutup navigasi"
          onClick={onCloseMobile}
        />
      )}
      <aside
        ref={sidebarRef}
        id="notara-navigation"
        aria-label="Navigasi utama"
        data-expanded={expanded}
        data-mobile-open={mobileOpen}
        className="notara-shell-sidebar"
      >
        {children}
      </aside>
    </>
  );
}

interface AppShellWorkspaceProps {
  sidebarExpanded: boolean;
  mobileNavigationOpen: boolean;
  children: ReactNode;
}

export function AppShellWorkspace({ sidebarExpanded, mobileNavigationOpen, children }: AppShellWorkspaceProps) {
  return (
    <div
      className="notara-shell-workspace"
      data-sidebar-expanded={sidebarExpanded}
      aria-hidden={mobileNavigationOpen || undefined}
      inert={mobileNavigationOpen || undefined}
    >
      {children}
    </div>
  );
}

export function AppShellTopbar({ children }: { children: ReactNode }) {
  return <header className="notara-shell-topbar">{children}</header>;
}
