import type { SVGProps } from "react";

export type IconName =
  | "search" | "pin" | "calendar" | "heart" | "heart-filled" | "back" | "close" | "filter" | "chevron-down" | "chevron-right" | "chevron-left" | "check" | "plus" | "minus"
  | "camera" | "lock" | "van" | "message" | "phone" | "share" | "compass" | "box" | "user" | "users" | "clock" | "shield" | "shield-check" | "bell" | "grid" | "tag" | "inventory" | "coins" | "star" | "gear" | "copy" | "edit" | "send" | "barcode" | "drill" | "tent" | "leaf" | "mountain" | "drop" | "truck" | "construction" | "laptop" | "chef" | "bike" | "speaker" | "stroller" | "trailer" | "alert" | "download" | "external" | "bars" | "list" | "map" | "info" | "trash" | "dots" | "warning" | "image" | "file" | "refresh" | "logout" | "sort" | "eye";

const paths: Record<IconName, React.ReactNode> = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  pin: <><path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10Z" /><circle cx="12" cy="11" r="2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  heart: <path d="M12 20.5s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.7a4.5 4.5 0 0 1 7.5 2.8c0 5.4-7.5 10-7.5 10Z" />,
  "heart-filled": <path d="M12 20.5s-7.5-4.6-7.5-10A4.5 4.5 0 0 1 12 7.7a4.5 4.5 0 0 1 7.5 2.8c0 5.4-7.5 10-7.5 10Z" fill="currentColor" />,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  filter: <><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  "chevron-right": <path d="m9 6 6 6-6 6" />,
  "chevron-left": <path d="m15 6-6 6 6 6" />,
  check: <path d="m5 12 5 5L20 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  van: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  message: <path d="M4 5h16v11H9l-5 4z" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />,
  share: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v7h14v-7" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="m15 9-2 6-4 2 2-6z" /></>,
  box: <><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 15.5a5 5 0 0 1 5.5 4.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M12 8v5M12 16h.01" /></>,
  "shield-check": <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 21h4" /></>,
  grid: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="8" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /><rect x="13" y="13" width="8" height="8" rx="2" /></>,
  tag: <><path d="M3 4h8l10 10-8 8L3 12z" /><circle cx="8" cy="9" r="1.5" /></>,
  inventory: <><rect x="3" y="12" width="8" height="9" /><rect x="13" y="12" width="8" height="9" /><rect x="8" y="3" width="8" height="9" /></>,
  coins: <><circle cx="12" cy="12" r="9" /><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.5 0-2.5 1-2.5 2s1 1.7 2.5 2 2.5 1 2.5 2-1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6v2M12 16v2" /></>,
  star: <path d="m12 3 2.8 6 6.2.8-4.6 4.3 1.2 6.4L12 17.5 6.4 20.5l1.2-6.4L3 9.8 9.2 9z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  edit: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  send: <path d="M12 19V5m-7 7 7-7 7 7" />,
  barcode: <path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M8 8v8M11 8v8M14 8v8M16.5 8v8" />,
  drill: <><path d="M14.5 5.5a4 4 0 0 0 5 5L9 21l-3-3 8.5-10.5z" /><path d="m6 18 3 3" /></>,
  tent: <><path d="M3 20h18M5 20V9l7-5 7 5v11" /><path d="M5 12h14" /></>,
  leaf: <><path d="M5 20c0-8 5-14 14-15-1 9-7 14-14 15z" /><path d="M5 20c3-5 7-8 11-10" /></>,
  mountain: <><path d="M3 20 12 4l9 16z" /><path d="M12 12v8" /></>,
  drop: <path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z" />,
  truck: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  construction: <path d="M4 20V8h16v12M4 12h16M8 8V5h8v3" />,
  laptop: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M2 20h20" /></>,
  chef: <><path d="M7 21h10v-6H7zM6 15V9a6 6 0 0 1 12 0v6" /></>,
  bike: <><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="m6 17 4-8h5l3 8M10 9l2-4h3" /></>,
  speaker: <><rect x="5" y="3" width="14" height="18" rx="2" /><circle cx="12" cy="14" r="3.5" /><circle cx="12" cy="7" r="1" /></>,
  stroller: <><path d="M4 4h3l3 8h8a6 6 0 0 0-6-6H8" /><circle cx="9" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
  trailer: <><rect x="2" y="8" width="14" height="8" /><path d="M16 12h6" /><circle cx="8" cy="19" r="2" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16h.01" /></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M5 21h14" /></>,
  external: <><path d="M14 4h6v6M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
  bars: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  list: <path d="M4 6h16M4 12h16M4 18h16" />,
  map: <><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>,
  dots: <><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="19" cy="12" r="1.5" fill="currentColor" /></>,
  warning: <><path d="M12 3 2 21h20z" /><path d="M12 10v5M12 18h.01" /></>,
  image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m21 16-5-5-9 8" /></>,
  file: <><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /></>,
  refresh: <><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>,
  logout: <><path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9" /></>,
  sort: <path d="M8 4v16M8 20l-3-3M8 20l3-3M16 20V4M16 4l-3 3M16 4l3 3" />,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
};

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, strokeWidth = 2, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {paths[name]}
    </svg>
  );
}
