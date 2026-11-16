type IconProps = {
  className?: string;
};

export function LogoMark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect x="1" y="13" width="17" height="17" rx="4" fill="#7ddecb" />
      <rect x="14" y="2" width="17" height="17" rx="4" fill="#ffffff" />
    </svg>
  );
}

export function CoinsIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M5 7v4.5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 11.5V16c0 1.7 3.1 3 7 3s7-1.3 7-3v-4.5" />
    </svg>
  );
}

export function HouseIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 11.2 12 4.5l8 6.7" strokeLinecap="round" />
      <path d="M6.5 10.2V19h11v-8.8" />
      <path d="M10 19v-4.5h4V19" />
    </svg>
  );
}

export function ChartIcon({ className = 'h-6 w-6' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 16.5 9 11l3.5 3L20 7" />
      <path d="M14.5 7H20v5.5" />
    </svg>
  );
}

export function CalendarIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
