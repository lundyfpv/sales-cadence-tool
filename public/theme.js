// Applies the saved light/dark/OLED mode and accent before the page paints.
(function () {
  var COLORS = { light: '#ffffff', dark: '#1a1d23', oled: '#000000' };
  function apply(mode, accent) {
    var r = document.documentElement;
    mode = mode || 'system'; accent = accent || 'slate';
    if (mode === 'system') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', mode);
    r.setAttribute('data-accent', accent);
    try { localStorage.setItem('cb.mode', mode); localStorage.setItem('cb.accent', accent); } catch (e) {}
    var dark = mode === 'dark' || (mode === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', mode === 'oled' ? COLORS.oled : dark ? COLORS.dark : COLORS.light);
  }
  var mode = 'system', accent = 'slate';
  try { mode = localStorage.getItem('cb.mode') || mode; accent = localStorage.getItem('cb.accent') || accent; } catch (e) {}
  apply(mode, accent);
  window.cbTheme = { apply: apply };
})();
