export function Logo({ size = 32 }: { size?: number }) {
  const isAdmin = import.meta.env.VITE_ALLOW_SIGNUP !== 'false';
  const id = `t2t-${isAdmin ? 'admin' : 'user'}`;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width={size} height={size}>
      <defs>
        <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="30%" stopColor={isAdmin ? "#7c3aed":"#759fbc"} />
          <stop offset="70%" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${id})`} />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fontFamily="system-ui, sans-serif"
        fontSize="13"
        fontWeight="800"
        fill="white"
        letterSpacing="0"
      >
        T2T
      </text>
    </svg>
  );
}
