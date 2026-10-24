(async function () {
  const $ = id => document.getElementById(id);
  let setup = false;
  try {
    const s = await (await fetch('/api/session')).json(); if (s.user) location.href = '/'; setup = s.setupNeeded;
    // the company's sign-in logo, when an admin has uploaded one
    if (s.brand && s.brand.signin) { const l = document.querySelector('.logo'); l.className = 'wordmark signin'; l.src = '/brand/signin.png'; }
  } catch (e) {}
  if (setup) {
    $('ttl').textContent = 'Create your account';
    $('lead').textContent = 'This is the first time Sales Cadence Tool has run. Choose the username and password you\'ll sign in with.';
    $('p2w').hidden = false; $('p').autocomplete = 'new-password'; $('go').textContent = 'Create account';
  }
  $('u').focus();
  $('f').addEventListener('submit', async e => {
    e.preventDefault(); $('err').textContent = '';
    const body = { username: $('u').value.trim(), password: $('p').value };
    if (setup) {
      if (body.password.length < 10) { $('err').textContent = 'Use at least 10 characters for the password.'; return; }
      if (body.password !== $('p2').value) { $('err').textContent = 'The two passwords don\'t match.'; return; }
    }
    if (!$('cw').hidden) body.code = $('c').value.trim();
    $('go').disabled = true;
    try {
      const r = await fetch(setup ? '/api/setup' : '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CB': '1' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { location.href = '/'; return; }
      if (d.code === 'totp_required') { $('cw').hidden = false; $('c').focus(); if (body.code) $('err').textContent = d.error; }
      else $('err').textContent = d.error || 'Couldn\'t sign in.';
    } catch (er) { $('err').textContent = 'Can\'t reach the server.'; }
    $('go').disabled = false;
  });
})();
