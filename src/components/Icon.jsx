const shapes = {
  home: (
    <>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11h14V9M9 20v-6h6v6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  message: (
    <>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
      <path d="M8 11h8M8 15h5" />
    </>
  ),
  tools: (
    <>
      <path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L14 13l-3-3z" />
      <path d="m14 13 3-3" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </>
  ),
  gift: (
    <>
      <path d="M20 12v9H4v-9M2 7h20v5H2zM12 7v14" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 2.4-3.2C10.8 5.2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 1 0-2.4-3.2C13.2 5.2 12 7 12 7Z" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="7.3" />
      <path d="m16.2 16.2 4.3 4.3" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16.5 9" />
    </>
  ),
  folder: (
    <path d="M3 6a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="10" cy="7" r="4" />
      <path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 4h16l2 12v4H2v-4z" />
      <path d="M2 14h6l2 3h4l2-3h6" />
    </>
  ),
  camera: (
    <>
      <path d="M4 7h3l2-3h6l2 3h3a2 2 0 0 1 2 2v10H2V9a2 2 0 0 1 2-2Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m21 15-5-5L5 20" />
    </>
  ),
  send: <path d="m22 2-7 20-4-9-9-4zM22 2 11 13" />,
  back: <path d="m15 18-6-6 6-6M9 12h12" />,
  close: <path d="m18 6-12 12M6 6l12 12" />,
  dice: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="8" cy="8" r=".7" fill="currentColor" />
      <circle cx="16" cy="8" r=".7" fill="currentColor" />
      <circle cx="12" cy="12" r=".7" fill="currentColor" />
      <circle cx="8" cy="16" r=".7" fill="currentColor" />
      <circle cx="16" cy="16" r=".7" fill="currentColor" />
    </>
  ),
  shuffle: (
    <>
      <path d="m18 14 4 4-4 4M18 2l4 4-4 4" />
      <path d="M2 18h2.5a6 6 0 0 0 4.2-1.7L17 8M2 6h2.5a6 6 0 0 1 4.2 1.7l1.1 1.1M14 14l3.1 3.1a6 6 0 0 0 4.2 1.7H22M14 10l3.1-3.1A6 6 0 0 1 21.3 5H22" />
    </>
  ),
  logout: (
    <>
      <path d="M10 17l5-5-5-5M15 12H3" />
      <path d="M12 3h6a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-6" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5c-.7-.7-1.6-1-2.8-1-1.5 0-2.7.8-2.7 2 0 3 5.4 1.4 5.4 4.3 0 1.2-1.2 2.2-2.9 2.2-1.1 0-2.2-.4-3-1.2M12.5 6v12" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.7" />
    </>
  ),
  eyeOff: (
    <>
      <path d="m3 3 18 18M10.6 6.2A10.7 10.7 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15.4 15.4 0 0 1-3.1 3.8M6.2 6.2C3.9 7.7 2.5 12 2.5 12s3.4 6 9.5 6c1 0 2-.2 2.8-.5" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  arrowRight: <path d="M4 12h16m-7-7 7 7-7 7" />,
};

export default function Icon({ name, size = 24, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name] || shapes.target}
    </svg>
  );
}
