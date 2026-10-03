// ============================================================
// Custom icon set — no external icon library, so this file has
// zero dependencies beyond React (and, only if you choose local
// AI, the model library loaded on demand).
// ============================================================

function makeIcon(renderChildren) {
  return function IconCmp({ size = 16, color = "currentColor", strokeWidth = 1.8, className, style }) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        style={style}
      >
        {renderChildren()}
      </svg>
    );
  };
}

export const Icon = {
  EyeOff: makeIcon(() => (
    <>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </>
  )),
  Plus: makeIcon(() => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  )),
  Search: makeIcon(() => (
    <>
      <circle cx="10" cy="10" r="6" />
      <line x1="15" y1="15" x2="20" y2="20" />
    </>
  )),
  Layers: makeIcon(() => (
    <>
      <rect x="5" y="4.5" width="14" height="4" rx="1" />
      <rect x="5" y="10" width="14" height="4" rx="1" />
      <rect x="5" y="15.5" width="14" height="4" rx="1" />
    </>
  )),
  Camera: makeIcon(() => (
    <>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <circle cx="12" cy="13" r="3.3" />
      <rect x="9" y="4" width="6" height="3" rx="1" />
    </>
  )),
  Lightbulb: makeIcon(() => (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5c.7.8 1 1.4 1 2.5h6c0-1.1.3-1.7 1-2.5A6 6 0 0 0 12 3z" />
    </>
  )),
  HelpCircle: makeIcon(() => (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="M9.3 9.3a2.7 2.7 0 1 1 3.9 2.4c-.9.5-1.2 1-1.2 2" />
      <line x1="12" y1="17" x2="12" y2="17.01" />
    </>
  )),
  ArrowUp: makeIcon(() => (
    <>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="6,11 12,5 18,11" />
    </>
  )),
  ArrowDown: makeIcon(() => (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="6,13 12,19 18,13" />
    </>
  )),
  ChevronUp: makeIcon(() => <polyline points="5,15 12,8 19,15" />),
  ChevronDown: makeIcon(() => <polyline points="5,9 12,16 19,9" />),
  Volume2: makeIcon(() => (
    <>
      <polygon points="3,9 3,15 8,15 13,20 13,4 8,9" />
      <path d="M16 8a5 5 0 0 1 0 8" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  )),
  Check: makeIcon(() => <polyline points="4,12 9,17 20,6" />),
  X: makeIcon(() => (
    <>
      <line x1="5" y1="5" x2="19" y2="19" />
      <line x1="19" y1="5" x2="5" y2="19" />
    </>
  )),
  Tag: makeIcon(() => (
    <>
      <rect x="3" y="6" width="14" height="12" rx="2" />
      <circle cx="8" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  )),
  RotateCcw: makeIcon(() => (
    <>
      <circle cx="12" cy="13" r="7" />
      <polyline points="8,5 8,9 12,9" />
    </>
  )),
  Trash2: makeIcon(() => (
    <>
      <rect x="6" y="8" width="12" height="12" rx="1" />
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="10" y1="3" x2="14" y2="3" />
      <line x1="9" y1="11" x2="9" y2="17" />
      <line x1="15" y1="11" x2="15" y2="17" />
    </>
  )),
  Edit3: makeIcon(() => (
    <>
      <line x1="4" y1="20" x2="20" y2="4" />
      <line x1="16" y1="4" x2="20" y2="8" />
    </>
  )),
  Loader2: makeIcon(() => <circle cx="12" cy="12" r="9" strokeDasharray="34 22" />),
  Upload: makeIcon(() => (
    <>
      <line x1="12" y1="4" x2="12" y2="15" />
      <polyline points="7,9 12,4 17,9" />
      <line x1="5" y1="19" x2="19" y2="19" />
    </>
  )),
  GraduationCap: makeIcon(() => (
    <>
      <polygon points="12,4 21,9 12,14 3,9" />
      <line x1="7" y1="11" x2="7" y2="17" />
    </>
  )),
  Wand2: makeIcon(() => (
    <>
      <line x1="4" y1="20" x2="16" y2="8" />
      <line x1="16" y1="4" x2="18" y2="6" />
      <line x1="20" y1="8" x2="18" y2="6" />
    </>
  )),
  Save: makeIcon(() => (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="7" y="4" width="8" height="5" />
      <rect x="7" y="14" width="10" height="6" />
    </>
  )),
  MessageCircle: makeIcon(() => (
    <>
      <circle cx="12" cy="11" r="8" />
      <polygon points="9,18 7,22 13,18" />
    </>
  )),
  Send: makeIcon(() => <polygon points="3,12 21,4 14,21 11,13" />),
  Download: makeIcon(() => (
    <>
      <line x1="12" y1="4" x2="12" y2="15" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="5" y1="19" x2="19" y2="19" />
    </>
  )),
  Menu: makeIcon(() => (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </>
  )),
  Key: makeIcon(() => (
    <>
      <circle cx="8" cy="12" r="4" />
      <line x1="12" y1="12" x2="21" y2="12" />
      <line x1="17" y1="12" x2="17" y2="16" />
      <line x1="20" y1="12" x2="20" y2="15" />
    </>
  )),
  FileText: makeIcon(() => (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <line x1="8" y1="8" x2="16" y2="8" />
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="16" x2="13" y2="16" />
    </>
  )),
};

export function StarIcon({ size = 16, color = "currentColor", filled = false, strokeWidth = 1.8, style, onClick, onPointerDown }) {
  return (
    <svg
      onClick={onClick}
      onPointerDown={onPointerDown}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? color : "none"}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      <polygon points="12,3 14.6,9.2 21.5,9.8 16.2,14.2 17.8,21 12,17.3 6.2,21 7.8,14.2 2.5,9.8 9.4,9.2" />
    </svg>
  );
}

// Small badge check, mirroring StarIcon's outline/filled pattern — outline
// and muted until checked, filled green once marked known.
export function CheckBadgeIcon({ size = 16, filled = false, style, onClick, onPointerDown }) {
  const color = filled ? "#4C8A5E" : "#C9C4B6";
  return (
    <svg onClick={onClick} onPointerDown={onPointerDown} width={size} height={size} viewBox="0 0 24 24" style={style}>
      <circle cx="12" cy="12" r="9.5" fill={filled ? color : "none"} stroke={color} strokeWidth="1.8" />
      <polyline
        points="7.5,12.3 10.5,15.5 16.5,8.5"
        fill="none"
        stroke={filled ? "#FBFAF7" : color}
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
