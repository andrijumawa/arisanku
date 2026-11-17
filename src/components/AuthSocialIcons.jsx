export default function AuthSocialIcons({ mode }) {
  const isLogin = mode === 'login';

  return (
    <div className="auth-social">
      <p>{isLogin ? 'or login with social platforms' : 'or register with social platforms'}</p>
      <div className="auth-social-icons" role="group" aria-label="Social platforms">
        <span className="auth-social-icon auth-social-icon--google" role="img" aria-label="Google">G</span>
        <span className="auth-social-icon auth-social-icon--facebook" role="img" aria-label="Facebook">f</span>
        <span className="auth-social-icon auth-social-icon--github" role="img" aria-label="GitHub">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7.2 8.2 6.4 4.8l3.2 1.7a9.5 9.5 0 0 1 4.8 0l3.2-1.7-.8 3.4a7 7 0 0 1 2.2 5.2c0 3.6-2.8 5.8-7 5.8s-7-2.2-7-5.8a7 7 0 0 1 2.2-5.2Z" />
            <path d="M9 13h.1M15 13h.1M9.5 17.5c.6-.7 1.4-1 2.5-1s1.9.3 2.5 1M5 13.5c-1.4-.2-2.1-1-2.5-2" />
          </svg>
        </span>
        <span className="auth-social-icon auth-social-icon--linkedin" role="img" aria-label="LinkedIn">in</span>
      </div>
    </div>
  );
}
