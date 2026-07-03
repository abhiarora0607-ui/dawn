export function DawnLogo({ className = "h-8" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 420 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dawn">
      <defs>
        <linearGradient id="dawnSun" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#FF7A2F" />
          <stop offset="100%" stopColor="#FFB65C" />
        </linearGradient>
      </defs>
      <g transform="translate(20,20)">
        <g stroke="url(#dawnSun)" strokeWidth="4" strokeLinecap="round">
          <line x1="40" y1="8" x2="40" y2="0" />
          <line x1="16" y1="18" x2="11" y2="12" />
          <line x1="64" y1="18" x2="69" y2="12" />
        </g>
        <path d="M8 58 A32 32 0 0 1 72 58 Z" fill="url(#dawnSun)" />
        <line x1="0" y1="58" x2="80" y2="58" stroke="#1B2A4A" strokeWidth="6" strokeLinecap="round" />
      </g>
      <text x="120" y="76" fontFamily="Inter, Arial, sans-serif" fontSize="52" fontWeight="700" fill="#1B2A4A" letterSpacing="-1">
        Dawn
      </text>
    </svg>
  );
}
