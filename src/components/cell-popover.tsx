"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
export default function CellPopover({ label, children, className = "", ariaLabel }: { label: ReactNode; children: ReactNode; className?: string; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const pinned = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const id = useId();
  const cancelClose = () => { clearTimeout(closeTimer.current); };
  const close = useCallback(() => { pinned.current = false; setOpen(false); }, []);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => { if (!pinned.current) setOpen(false); }, 150);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      const box = panel.current?.getBoundingClientRect();
      if (!rect || !box) return;
      const left = Math.max(12, Math.min(rect.right - box.width, window.innerWidth - box.width - 12));
      const top = rect.bottom + box.height + 8 <= window.innerHeight - 12 ? rect.bottom + 8 : Math.max(12, rect.top - box.height - 8);
      setPosition({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: Event) => {
      if (!anchor.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("focusin", outside); document.removeEventListener("keydown", key); };
  }, [open, close]);
  return <>
    <button ref={anchor} type="button" className={`nw-cell-trigger ${className}`} aria-label={ariaLabel} aria-describedby={open ? id : undefined} aria-expanded={open}
      onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose}
      onFocus={() => { cancelClose(); setOpen(true); }} onBlur={scheduleClose}
      onClick={() => { cancelClose(); if (pinned.current) close(); else { pinned.current = true; setOpen(true); } }}>
      {label}
    </button>
    {open && createPortal(<div id={id} ref={panel} role="tooltip" className="nw-cell-popover" style={position} onMouseEnter={cancelClose} onMouseLeave={scheduleClose}>{children}<small className="nw-popover-hint">Click the cell to pin/unpin · Escape to close</small></div>, document.body)}
  </>;
}
