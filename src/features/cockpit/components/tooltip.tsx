"use client";

import {
  cloneElement,
  useId,
  useState,
  type FocusEvent,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from "react";

type TooltipAlign = "center" | "left" | "right";

const ALIGN: Record<TooltipAlign, string> = {
  center: "left-1/2 -translate-x-1/2",
  left: "left-0",
  right: "right-0",
};

type TooltipTriggerProps = {
  "aria-describedby"?: string;
  className?: string;
  href?: unknown;
  onBlur?: FocusEventHandler<HTMLElement>;
  onFocus?: FocusEventHandler<HTMLElement>;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  onMouseEnter?: MouseEventHandler<HTMLElement>;
  onMouseLeave?: MouseEventHandler<HTMLElement>;
  role?: string;
  tabIndex?: number;
};

const NATIVE_INTERACTIVE_ELEMENTS = new Set([
  "a",
  "button",
  "input",
  "select",
  "summary",
  "textarea",
]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "checkbox",
  "link",
  "menuitem",
  "option",
  "radio",
  "slider",
  "switch",
  "tab",
  "textbox",
]);

function hasFocusWithin(event: FocusEvent<HTMLElement>): boolean {
  return (
    event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)
  );
}

export function Tooltip({
  children,
  title,
  detail,
  meta,
  align = "center",
  className = "",
}: {
  children: ReactElement<TooltipTriggerProps>;
  title: string;
  detail: string;
  meta?: ReactNode;
  align?: TooltipAlign;
  className?: string;
}) {
  const tooltipId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const isOpen = !dismissed && (hovered || focused);

  const nativeType = typeof children.type === "string" ? children.type : null;
  const isInteractive =
    (nativeType !== null && NATIVE_INTERACTIVE_ELEMENTS.has(nativeType)) ||
    children.props.href !== undefined ||
    (children.props.role !== undefined && INTERACTIVE_ROLES.has(children.props.role)) ||
    children.props.tabIndex !== undefined;
  const describedBy = [children.props["aria-describedby"], tooltipId]
    .filter(Boolean)
    .join(" ");

  const trigger = cloneElement(children, {
    "aria-describedby": describedBy,
    className:
      `${children.props.className ?? ""} ` +
      "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400",
    // A non-interactive visual becomes focusable only because focus and Escape
    // now have concrete tooltip behaviour. Existing interactive children keep
    // their native keyboard semantics.
    tabIndex: isInteractive ? children.props.tabIndex : 0,
    onMouseEnter(event) {
      children.props.onMouseEnter?.(event);
      setHovered(true);
      setDismissed(false);
    },
    onMouseLeave(event) {
      children.props.onMouseLeave?.(event);
      setHovered(false);
    },
    onFocus(event) {
      children.props.onFocus?.(event);
      setFocused(true);
      setDismissed(false);
    },
    onBlur(event) {
      children.props.onBlur?.(event);
      if (!hasFocusWithin(event)) {
        setFocused(false);
        setDismissed(false);
      }
    },
    onKeyDown(event) {
      children.props.onKeyDown?.(event);
      if (event.key === "Escape") {
        setDismissed(true);
      }
    },
  });

  return (
    <div className={`relative inline-flex ${isOpen ? "z-50" : ""} ${className}`}>
      {trigger}
      <span
        id={tooltipId}
        role="tooltip"
        hidden={!isOpen}
        aria-hidden={!isOpen}
        className={`pointer-events-none absolute top-[calc(100%+10px)] z-50 w-60 rounded-xl border border-violet-500/40 bg-[#171b32]/95 p-3 text-left shadow-[0_24px_60px_-16px_rgba(0,0,0,.85)] backdrop-blur-md ${ALIGN[align]}`}
      >
        <span className="block text-[9.5px] font-bold uppercase tracking-[0.16em] text-violet-300">
          {title}
        </span>
        <span className="mt-1.5 block text-xs leading-relaxed text-[#98a1c4]">{detail}</span>
        {meta ? (
          <span className="mt-2 block border-t border-white/10 pt-2 text-[11px] text-[#646c8e]">
            {meta}
          </span>
        ) : null}
      </span>
    </div>
  );
}
