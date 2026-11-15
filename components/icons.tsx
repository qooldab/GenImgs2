import type { CSSProperties } from "react";

type P = { className?: string; strokeWidth?: number; style?: CSSProperties };

const base = (p: P) => ({
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: p.strokeWidth ?? 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: p.className,
  style: p.style,
  "aria-hidden": true,
  focusable: false as const,
});

export const Aperture = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3v9l7.8 4.5M4.2 16.5 12 12l7.8-4.5M4.2 7.5 12 12v9" />
  </svg>
);
export const Zap = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
  </svg>
);
export const ImageIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <circle cx="8.6" cy="8.6" r="1.6" />
    <path d="m21 15.5-4.6-4.6L5 21" />
  </svg>
);
export const Clip = (p: P) => (
  <svg {...base(p)}>
    <path d="M20.4 11.6 12 20a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
  </svg>
);
export const Upload = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 9 5-5 5 5M12 4v12" />
  </svg>
);
export const Download = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5M12 15V3" />
  </svg>
);
export const External = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6M10 14 21 3" />
  </svg>
);
export const Copy = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);
export const Trash = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6" />
  </svg>
);
export const Refresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 4v6h-6" />
    <path d="M20.5 14a8.5 8.5 0 1 1-2-8.7L21 8" />
  </svg>
);
export const Clock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.4 2" />
  </svg>
);
export const Check = (p: P) => (
  <svg {...base(p)}>
    <path d="m20 6.5-11 11L4 12.5" />
  </svg>
);
export const X = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const Plus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const Pencil = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
  </svg>
);
export const Eye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const EyeOff = (p: P) => (
  <svg {...base(p)}>
    <path d="M17.9 17.9A10.4 10.4 0 0 1 12 19c-6.4 0-10-7-10-7a19 19 0 0 1 5.1-5.9M9.9 4.2A9.6 9.6 0 0 1 12 4c6.4 0 10 7 10 7a19 19 0 0 1-2.2 3.2M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
  </svg>
);
export const Search = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </svg>
);
export const Alert = (p: P) => (
  <svg {...base(p)}>
    <path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4.5M12 17.2h.01" />
  </svg>
);
export const Info = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 16v-4.5M12 8h.01" />
  </svg>
);
export const Lock = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
);
export const Gift = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7" />
    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7ZM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7Z" />
  </svg>
);
export const Grid = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </svg>
);
export const Rows = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
);
export const Chart = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 21h18M7 21V11M12 21V4M17 21v-7" />
  </svg>
);
export const Key = (p: P) => (
  <svg {...base(p)}>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="m10.8 12.2 8.2-8.2M16 7l2.5 2.5M13.5 9.5 16 12" />
  </svg>
);
export const Logout = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </svg>
);
export const ArrowLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);
export const Chevron = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);
export const Film = (p: P) => (
  <svg {...base(p)}>
    <rect x="2.5" y="4" width="19" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M2.5 12h19M2.5 8h4.5M2.5 16h4.5M17 8h4.5M17 16h4.5" />
  </svg>
);
export const Sliders = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
  </svg>
);
export const Sort = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
  </svg>
);
export const Undo = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8h11a6 6 0 0 1 0 12H8" />
    <path d="m7 4-4 4 4 4" />
  </svg>
);