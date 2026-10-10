// ---------- shell / chrome ----------

export function Shell({ children }) {
  return (
    <div
      className="app-shell"
      style={{
        "--ink": "#23272A",
        "--paper": "#EFEEE8",
        "--card": "#FBFAF7",
        "--line": "#DCD8CD",
        "--rust": "#A1432E",
        "--fjord": "#4C6B65",
        "--sage": "#7C9473",
        "--terracotta": "#C1653F",
        "--muted": "#8A8577",
        "--serif": "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
        "--sans": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        background: "var(--paper)",
        color: "var(--ink)",
        margin: "0 auto",
        position: "relative",
        boxSizing: "border-box",
      }}
    >
      <style>{`
        .app-shell summary::-webkit-details-marker { display: none; }
        .app-shell details[open] > summary svg { transform: rotate(180deg); }
        .app-shell {
          /* 100vh is unreliable on mobile Safari, which doesn't account
             for its own dynamic address bar; 100dvh does. Listed both —
             browsers that don't understand dvh simply ignore that line
             and keep the vh fallback above it. */
          min-height: 100vh;
          min-height: 100dvh;
          /* Keeps content clear of the notch/status bar and home
             indicator on devices with safe-area insets (this is what
             viewport-fit=cover needs to be paired with to avoid content
             sitting under the notch instead of around it). */
          padding-top: env(safe-area-inset-top, 0px);
          padding-bottom: env(safe-area-inset-bottom, 0px);
          padding-left: env(safe-area-inset-left, 0px);
          padding-right: env(safe-area-inset-right, 0px);
        }
        .app-shell { max-width: 480px; }
        .nav-wide { display: none; }
        /* Wide screens (iPad, computer): a wider centred column, bigger cards, and the
           four tabs move from the bottom bar up into the header. Phones, including
           a phone turned sideways, keep the phone layout. */
        @media (min-width: 768px) and (min-height: 600px) {
          .app-shell { max-width: 780px; }
          .app-views { zoom: 1.2; --z: 1.2; }
          .tabbar-bottom { display: none !important; }
          .nav-wide { display: flex; }
        }
        @media (min-width: 1100px) and (min-height: 700px) {
          .app-shell { max-width: 900px; }
          .app-views { zoom: 1.3; --z: 1.3; }
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cardEnterNext { from { opacity: 0.25; transform: translateX(14px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes cardEnterBack { from { opacity: 0.25; transform: translateX(-14px); } to { opacity: 1; transform: translateX(0); } }
        .card-enter-next { animation: cardEnterNext 0.4s ease-out; }
        .card-enter-back { animation: cardEnterBack 0.4s ease-out; }
        @keyframes popoverIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
        .popover { animation: popoverIn 0.16s ease-out; box-shadow: 0 10px 28px rgba(35,39,42,0.16); }
        @keyframes backdropFadeIn { from { opacity: 0; } to { opacity: 1; } }
        .popover-backdrop { animation: backdropFadeIn 0.16s ease-out; }
        * { box-sizing: border-box; }
        html, body { overscroll-behavior-x: none; }
        input, textarea, select { font-family: var(--sans); }
        /* Dropdowns: the phone's own style shows the chosen text in system blue.
           Draw them in the app's normal dark colour with a small grey arrow. */
        select {
          -webkit-appearance: none;
          appearance: none;
          color: var(--ink);
          -webkit-text-fill-color: var(--ink);
          padding-right: 26px !important;
          background-color: #fff;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238A8577' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 8px center;
        }
        input:focus, textarea:focus, select:focus { outline: 2px solid var(--fjord); outline-offset: 1px; }
        button:focus-visible { outline: 2px solid var(--fjord); outline-offset: 2px; }
        ::placeholder { color: #ADA898; }
      `}</style>
      {children}
    </div>
  );
}
