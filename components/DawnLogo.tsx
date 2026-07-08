export function DawnLogo({ className = "h-9" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 90" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Dawn">
      <defs>
        <linearGradient id="dawnSun" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#F97316" />
          <stop offset="55%" stopColor="#FF9E43" />
          <stop offset="100%" stopColor="#FFC46B" />
        </linearGradient>
      </defs>
      <g transform="translate(10,12)">
        <g stroke="url(#dawnSun)" strokeWidth="5" strokeLinecap="round">
          <line x1="35" y1="10" x2="35" y2="1" />
          <line x1="13" y1="20" x2="7" y2="13" />
          <line x1="57" y1="20" x2="63" y2="13" />
          <line x1="4" y1="42" x2="-4" y2="42" />
          <line x1="66" y1="42" x2="74" y2="42" />
        </g>
        <path d="M6 52 A29 29 0 0 1 64 52 Z" fill="url(#dawnSun)" />
        <line x1="-2" y1="52" x2="72" y2="52" stroke="#16233F" strokeWidth="7" strokeLinecap="round" />
      </g>
      <text x="96" y="62" fontFamily="Fraunces, Georgia, serif" fontSize="54" fontWeight="600" fill="#16233F" letterSpacing="-1.5">
        Dawn
      </text>
    </svg>
  );
}
