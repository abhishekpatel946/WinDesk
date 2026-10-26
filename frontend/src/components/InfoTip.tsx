import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface Info {
  /** What the number / chart is. */
  what: ReactNode;
  /** How to interpret it (direction, units, what is good or bad). */
  read?: ReactNode;
  /** The current value explained in plain words. */
  now?: ReactNode;
}

const WIDTH = 300;
const GAP = 8;
const MARGIN = 8;
const CLOSE_DELAY_MS = 120;

/**
 * "ⓘ" button with an explanation popover. Opens on hover or keyboard focus; click/tap pins it
 * open (touch has no hover). Rendered in a portal with fixed positioning so scroll containers
 * and table overflow cannot clip it.
 */
export function InfoTip({ info, label }: { info: Info; label: string }) {
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = hover || pinned;

  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const h = popRef.current?.offsetHeight ?? 0;
    const width = Math.min(WIDTH, window.innerWidth - 2 * MARGIN);
    const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, MARGIN), window.innerWidth - width - MARGIN);
    const below = r.bottom + GAP;
    const top = below + h > window.innerHeight - MARGIN && r.top - GAP - h > MARGIN ? r.top - GAP - h : below;
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPinned(false);
        setHover(false);
        btnRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) {
        setPinned(false);
        setHover(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const enter = () => {
    window.clearTimeout(closeTimer.current);
    setHover(true);
  };
  const leave = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setHover(false), CLOSE_DELAY_MS);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`About ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((p) => !p)}
        onMouseEnter={enter}
        onMouseLeave={leave}
        onFocus={enter}
        onBlur={leave}
        className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full align-middle normal-case tracking-normal transition ${
          open ? "text-sky-300" : "text-slate-500 hover:text-slate-300"
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 7.2v4" strokeLinecap="round" />
          <circle cx="8" cy="4.9" r="0.4" fill="currentColor" />
        </svg>
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            id={id}
            role="tooltip"
            onMouseEnter={enter}
            onMouseLeave={leave}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: Math.min(WIDTH, window.innerWidth - 2 * MARGIN),
            }}
            className="z-50 space-y-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-left text-xs normal-case leading-relaxed tracking-normal text-slate-300 shadow-2xl"
          >
            <div className="font-semibold text-slate-100">{label}</div>
            <p>{info.what}</p>
            {info.read && (
              <p>
                <span className="font-medium text-slate-200">How to read it: </span>
                {info.read}
              </p>
            )}
            {info.now && (
              <p className="rounded-md bg-sky-500/10 px-2 py-1.5 text-sky-100">
                <span className="font-medium">Right now: </span>
                {info.now}
              </p>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
