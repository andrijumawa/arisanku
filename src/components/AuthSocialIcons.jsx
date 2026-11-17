export default function AuthSocialIcons({ mode }) {
  const isLogin = mode === 'login';

  return (
    <div className="auth-social">
      <p>{isLogin ? 'or login with social platforms' : 'or register with social platforms'}</p>
      <div className="auth-social-icons" role="group" aria-label="Social platforms">
        <span className="auth-social-icon" role="img" aria-label="Card">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.5 5.5h17A2.5 2.5 0 0 1 23 8v8a2.5 2.5 0 0 1-2.5 2.5h-17A2.5 2.5 0 0 1 1 16V8a2.5 2.5 0 0 1 2.5-2.5Zm0 3v2h17v-2h-17Zm2 5v2h4v-2h-4Z" />
          </svg>
        </span>
        <span className="auth-social-icon" role="img" aria-label="People">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6.5 1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm13 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM12 13c-3.1 0-5.5 1.7-5.5 4v2h11v-2c0-2.3-2.4-4-5.5-4Zm-7-1c-2.2 0-3.8 1.3-3.8 3v2h4v-2c0-1 .4-1.9 1.1-2.6A4.8 4.8 0 0 0 5 12Zm14 0c-.5 0-1 .1-1.4.3.7.7 1.1 1.6 1.1 2.6v2h4v-2c0-1.7-1.6-3-3.7-3Z" />
          </svg>
        </span>
        <span className="auth-social-icon" role="img" aria-label="Chat">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5A9.5 9.5 0 0 0 4 17.1L2.8 21a.8.8 0 0 0 1 .9l4.3-1.3A9.5 9.5 0 1 0 12 2.5Z" />
            <circle cx="8" cy="12" r="1.25" fill="#fff" />
            <circle cx="12" cy="12" r="1.25" fill="#fff" />
            <circle cx="16" cy="12" r="1.25" fill="#fff" />
          </svg>
        </span>
        <span className="auth-social-icon" role="img" aria-label="Wallet">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m4.2 6.4 12.2-3.1a1.7 1.7 0 0 1 2.1 1.2l.4 1.6H6A2.5 2.5 0 0 0 3.5 8.6v9A2.5 2.5 0 0 0 6 20h14.5a1 1 0 0 0 1-1v-1.5h-3a3 3 0 0 1 0-6h3V9.2a2 2 0 0 0-2-2H5.8a.7.7 0 0 1-.2-1.4l-1.4.6Zm14.3 6.6a1.5 1.5 0 0 0 0 3h3v-3h-3Zm0 1a.5.5 0 1 1 0 1 .5.5 0 0 1 0-1Z" />
          </svg>
        </span>
      </div>
    </div>
  );
}
