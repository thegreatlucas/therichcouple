@tailwind base;
@tailwind components;
@tailwind utilities;

/* ─────────────────────────────────────────
   CSS Custom Properties — Light & Dark Mode
   ───────────────────────────────────────── */
:root {
  color-scheme: light;

  --bg:       #ffffff;
  --bg2:      #f8f9fa;
  --bg3:      #f0f0f0;
  --surface:  #ffffff;
  --surface2: #f5f5f5;
  --border:   #e5e7eb;
  --border2:  #eeeeee;
  --text:     #1a1a1a;
  --text2:    #444444;
  --text3:    #666666;
  --text-muted: #999999;
  --shadow:   0 2px 8px rgba(0,0,0,0.08);

  /* Brand colors — inalteráveis */
  --green:  #2ecc71;
  --green2: #27ae60;
  --red:    #e74c3c;
  --blue:   #3498db;
  --orange: #e67e22;
  --purple: #9b59b6;
}

[data-theme='dark'] {
  color-scheme: dark;

  --bg:       #0f0f0f;
  --bg2:      #141414;
  --bg3:      #1a1a1a;
  --surface:  #161616;
  --surface2: #1e1e1e;
  --border:   #2a2a2a;
  --border2:  #333333;
  --text:     #f0f0f0;
  --text2:    #cccccc;
  --text3:    #999999;
  --text-muted: #555555;
  --shadow:   0 2px 8px rgba(0,0,0,0.5);
}

/* ─── Base ─────────────────────────────── */
html, body {
  background-color: var(--bg);
  color: var(--text);
  transition: background-color 0.2s ease, color 0.2s ease;
}

main {
  background-color: var(--bg);
  min-height: 100vh;
}

/* ─── Inputs ────────────────────────────── */
input,
select,
textarea {
  background-color: var(--surface2) !important;
  color: var(--text) !important;
  border-color: var(--border) !important;
  -webkit-text-fill-color: var(--text) !important;
}

input::placeholder,
select::placeholder,
textarea::placeholder {
  color: var(--text-muted) !important;
  -webkit-text-fill-color: var(--text-muted) !important;
}

/* Autofill no Chrome — dark mode */
[data-theme='dark'] input:-webkit-autofill,
[data-theme='dark'] input:-webkit-autofill:hover,
[data-theme='dark'] input:-webkit-autofill:focus {
  -webkit-text-fill-color: #f0f0f0 !important;
  -webkit-box-shadow: 0 0 0px 1000px #1e1e1e inset !important;
}

/* Autofill no Chrome — light mode */
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus {
  -webkit-text-fill-color: #1a1a1a !important;
  -webkit-box-shadow: 0 0 0px 1000px #ffffff inset !important;
}