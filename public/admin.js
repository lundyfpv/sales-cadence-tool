(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = m => { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3500); };
  const fmtB = n => n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  async function api(method, url, body) {
    const r = await fetch(url, { method, headers: { 'X-CB': '1', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (r.status === 401) { location.href = '/login'; throw new Error('Signed out'); }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'Request failed');
    return d;
  }
  // keep this page in the user's chosen theme
  fetch('/api/state').then(r => r.json()).then(s => { const th = (s.settings && s.settings.theme) || {}; window.cbTheme && cbTheme.apply(th.mode, th.accent); }).catch(() => {});
  if (!window.cbTheme) { const sc = document.createElement('script'); sc.src = '/theme.js'; document.head.appendChild(sc); }

  let polling = null, filled = false;
  async function load() {
    const s = await api('GET', '/api/admin/status');
    loadPeople();
    // HTTPS and backups are for admins; everyone else gets their own sign-in settings
    $('https').hidden = $('backup').hidden = !!s.limited;
    if (s.limited) { $('s-user').textContent = s.username; $('s-sess').textContent = s.sessions; $('s-totp').textContent = s.totp ? 'On' : 'Off'; drawTotp(s.totp); return; }
    $('p-http').textContent = s.ports.http; $('p-https').textContent = s.ports.https;
    const c = s.cert, pill = $('cert-pill');
    if (c && !c.error) {
      const days = Math.round((new Date(c.validTo) - Date.now()) / 864e5);
      pill.className = 'pill ' + (c.staging ? 'warn' : days < 14 ? 'bad' : 'ok');
      pill.textContent = c.staging ? 'Test certificate' : days < 0 ? 'Expired' : 'Active';
      $('cert-info').innerHTML = `<dt>Domain</dt><dd>${esc(c.domains.join(', '))}</dd><dt>Expires</dt><dd>${new Date(c.validTo).toLocaleDateString()} (${days} days)</dd><dt>Issuer</dt><dd>${esc(c.issuer)}</dd>${c.staging ? '<dt></dt><dd>Staging certificates show a browser warning. They prove the setup works; click <b>Get real certificate</b> next.</dd>' : ''}<dt>HTTPS port</dt><dd>${s.httpsListening ? 'Listening on ' + s.ports.https : 'Not running'}</dd>`;
    } else {
      pill.className = 'pill'; pill.textContent = 'No certificate';
      $('cert-info').innerHTML = `<dt>Status</dt><dd>${c && c.error ? esc(c.error) : 'The app is on plain HTTP. Fine on your home network, but get a certificate before opening it to the internet.'}</dd>`;
      $('howto').open = true;
    }
    if (s.acme.lastError && !s.job.running && !s.job.log.length) $('cert-info').innerHTML += `<dt>Last attempt</dt><dd style="color:var(--red)">${esc(s.acme.lastError)}</dd>`;
    if (!filled) { $('a-domain').value = s.acme.domain || ''; $('a-email').value = s.acme.email || ''; $('a-renew').checked = s.acme.autoRenew !== false; $('a-redirect').checked = s.acme.redirect !== false; filled = true; }
    const log = $('a-log');
    if (s.job.log.length) { log.hidden = false; log.textContent = s.job.log.join('\n'); log.scrollTop = log.scrollHeight; }
    ['a-stage', 'a-prod', 'a-test'].forEach(id => $(id).disabled = s.job.running);
    $('a-msg').textContent = s.job.running ? 'Working… this usually takes under a minute.' : s.job.error ? 'It didn\'t work. See the log.' : '';
    if (s.job.running && !polling) polling = setInterval(load, 2000);
    if (!s.job.running && polling) { clearInterval(polling); polling = null; }

    $('s-user').textContent = s.username; $('s-sess').textContent = s.sessions;
    $('s-totp').textContent = s.totp ? 'On' : 'Off';
    drawTotp(s.totp);
    $('b-info').innerHTML = `<dt>Database</dt><dd>${fmtB(s.dbBytes)}</dd><dt>Attached files</dt><dd>${fmtB(s.uploadsBytes)}</dd><dt>Data folder</dt><dd><code>${esc(s.dataDir)}</code></dd><dt>Version</dt><dd>${esc(s.version)} · Node ${esc(s.node)}</dd>`;
  }
  function drawTotp(on) {
    const box = $('totp-box');
    if (box.dataset.state === String(on)) return; box.dataset.state = String(on);
    box.innerHTML = on
      ? `<details><summary><b>Turn off two-step codes</b></summary><div class="row" style="margin-top:8px"><input class="inp" type="password" id="t-pw" placeholder="Your password" style="max-width:240px"><button class="btn danger" id="t-off">Turn off</button></div></details>`
      : `<details id="t-d"><summary><b>Turn on two-step codes</b> <span class="muted small">(recommended once this is on the internet)</span></summary><div id="t-setup" style="margin-top:8px;display:flex;flex-direction:column;gap:8px"><p class="muted small" style="margin:0">Works with Google Authenticator, Microsoft Authenticator, 1Password, or the iPhone Passwords app.</p><div><button class="btn" id="t-begin">Start setup</button></div></div></details>`;
    if (on) $('t-off').onclick = async () => { try { await api('POST', '/api/admin/totp/disable', { password: $('t-pw').value }); toast('Two-step codes are off.'); load(); } catch (e) { toast(e.message); } };
    else $('t-begin').onclick = async () => {
      const d = await api('POST', '/api/admin/totp/begin');
      $('t-setup').innerHTML = `<ol class="steps small"><li>In your authenticator app, add an account and choose <b>Enter a setup key</b> (or tap the link below on your phone).</li><li>Account: <b>Sales Cadence Tool</b>. Key: <code class="copyable" style="user-select:all">${esc(d.secret.replace(/(.{4})/g, '$1 ').trim())}</code>. Type: time-based.</li><li>Enter the 6-digit code it shows.</li></ol><a class="small" href="${esc(d.uri)}">Open in authenticator app</a><div class="row"><input class="inp" id="t-code" inputmode="numeric" maxlength="6" placeholder="123456" style="max-width:140px"><button class="btn primary" id="t-on">Turn on</button></div>`;
      $('t-on').onclick = async () => { try { await api('POST', '/api/admin/totp/enable', { code: $('t-code').value }); toast('Two-step codes are on. You\'ll need a code at each sign-in.'); load(); } catch (e) { toast(e.message); } };
    };
  }
  const saveAcme = () => api('POST', '/api/admin/acme', { domain: $('a-domain').value, email: $('a-email').value, autoRenew: $('a-renew').checked, redirect: $('a-redirect').checked });
  $('a-save').onclick = async () => { try { await saveAcme(); toast('Saved.'); } catch (e) { toast(e.message); } };
  $('a-test').onclick = async () => {
    try { await saveAcme(); $('a-msg').textContent = 'Checking…'; const r = await api('POST', '/api/admin/acme/test');
      $('a-msg').textContent = r.ok ? 'Port 80 reached this server. You\'re ready to request a certificate.' : `Couldn't reach this server at http://${$('a-domain').value}/ (${r.error || 'HTTP ' + r.status}). Check the DNS record and port forward. If your router can't test its own address, try staging anyway.`;
    } catch (e) { $('a-msg').textContent = e.message; }
  };
  const issue = staging => async () => { try { await saveAcme(); await api('POST', '/api/admin/acme/issue', { staging }); $('a-log').hidden = false; $('a-log').textContent = 'Starting…'; load(); } catch (e) { toast(e.message); } };
  $('a-stage').onclick = issue(true); $('a-prod').onclick = issue(false);

  $('pw-go').onclick = async () => {
    if ($('pw-new').value !== $('pw-new2').value) { $('pw-msg').textContent = 'The new passwords don\'t match.'; return; }
    try { await api('POST', '/api/admin/password', { current: $('pw-cur').value, next: $('pw-new').value }); $('pw-msg').textContent = 'Password changed.'; ['pw-cur', 'pw-new', 'pw-new2'].forEach(i => $(i).value = ''); load(); } catch (e) { $('pw-msg').textContent = e.message; }
  };
  $('s-out').onclick = async () => { await api('POST', '/api/admin/logout-others'); $('s-msg').textContent = 'Other devices are signed out.'; load(); };

  let pending = null;
  $('b-file').onchange = async () => {
    const f = $('b-file').files[0]; if (!f) return;
    try { pending = JSON.parse(await f.text()); } catch (e) { $('b-msg').textContent = 'That file isn\'t valid JSON.'; return; }
    if (pending.app !== 'cadence-book') { $('b-msg').textContent = 'That file isn\'t a Sales Cadence Tool backup.'; pending = null; return; }
    $('b-what').textContent = `Replace all current data with ${pending.customers.length} customers and ${pending.appointments.length} appointments from ${new Date(pending.exported).toLocaleString()}? Attached files aren't touched.`;
    $('b-confirm').hidden = false;
  };
  $('b-cancel').onclick = () => { pending = null; $('b-confirm').hidden = true; $('b-file').value = ''; };
  $('b-go').onclick = async () => { try { const r = await api('POST', '/api/admin/restore', pending); $('b-msg').textContent = `Restored ${r.customers} customers and ${r.appointments} appointments.`; } catch (e) { $('b-msg').textContent = e.message; } $('b-confirm').hidden = true; pending = null; load(); };

  /* ---- profile photos ---- */
  const initials = u => (u.name || u.username || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatar = (u, cls = '') => u.photo ? `<img class="avatar ${cls}" src="/api/users/${u.id}/photo?v=${u.photo}" alt="">` : `<span class="avatar ${cls}">${esc(initials(u))}</span>`;
  // Crop to a centered square and shrink to 256px before upload, so a phone photo becomes a ~20 KB JPEG
  async function uploadPhoto(userId, file) {
    let img;
    try { img = await createImageBitmap(file); } catch (e) { throw new Error('That image couldn\'t be read. Try a JPEG or PNG.'); }
    const side = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = 256;
    c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    const r = await fetch(`/api/users/${userId}/photo`, { method: 'POST', headers: { 'X-CB': '1', 'Content-Type': 'image/jpeg' }, body: blob });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Upload failed.');
  }
  function drawProfile(me) {
    $('pf-av').innerHTML = avatar(me, 'lg');
    if (document.activeElement !== $('pf-name')) $('pf-name').value = me.name || '';
    $('pf-del').hidden = !me.photo;
  }
  $('pf-save').onclick = async () => { try { await api('PATCH', '/api/users/' + P.me, { name: $('pf-name').value }); toast('Saved.'); loadPeople(); } catch (e) { toast(e.message); } };
  $('pf-file').onchange = async () => {
    const f = $('pf-file').files[0]; if (!f) return; $('pf-msg').textContent = 'Uploading…';
    try { await uploadPhoto(P.me, f); $('pf-msg').textContent = ''; toast('Photo updated.'); loadPeople(); } catch (e) { $('pf-msg').textContent = e.message; }
    $('pf-file').value = '';
  };
  $('pf-del').onclick = async () => { try { await api('DELETE', `/api/users/${P.me}/photo`); loadPeople(); } catch (e) { toast(e.message); } };

  /* ---- people ---- */
  const RANK = { tsm: 1, rsm: 2, director: 3, admin: 4 };
  let P = null;
  const nm = u => u ? (u.name || u.username) : '';
  const roleText = u => P.roles[u.role] + (u.admin && u.role !== 'admin' ? ' + Admin' : '');
  async function loadPeople() {
    P = await api('GET', '/api/users');
    const me = P.users.find(u => u.id === P.me);
    P.meUser = me; drawProfile(me);
    $('people').hidden = !(me.admin || RANK[me.role] >= RANK.rsm);  // the profile panel above is for everyone
    if ($('people').hidden) return;
    const all = [...P.users, ...P.managers.filter(m => !P.users.some(u => u.id === m.id))];
    const byId = id => all.find(u => u.id === id);
    $('u-list').innerHTML = P.users.slice().sort((a, b) => RANK[b.role] - RANK[a.role] || nm(a).localeCompare(nm(b))).map(u => `<div class="li" style="flex-wrap:wrap">
      ${avatar(u)}<div class="grow"><b>${esc(nm(u))}</b>${u.id === P.me ? ' <span class="pill">you</span>' : ''}${u.active ? '' : ' <span class="pill bad">Turned off</span>'}
        <div class="muted small">${esc(roleText(u))} · @${esc(u.username)}${u.manager ? ' · reports to ' + esc(nm(byId(u.manager)) || 'someone outside your team') : ''}${u.totp ? ' · two-step on' : ''}</div></div>
${u.canManage ? `<button class="btn sm" data-edit="${u.id}">Edit</button><button class="btn sm" data-pw="${u.id}">Reset password</button><button class="btn sm ${u.active ? 'danger' : ''}" data-act="${u.id}" data-on="${u.active ? 0 : 1}">${u.active ? 'Turn off' : 'Turn on'}</button>` : ''}
    </div>`).join('');
    $('u-list').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => form(P.users.find(u => u.id === b.dataset.edit)));
    $('u-list').querySelectorAll('[data-pw]').forEach(b => b.onclick = () => resetPw(P.users.find(u => u.id === b.dataset.pw)));
    $('u-list').querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      try { await api('PATCH', '/api/users/' + b.dataset.act, { active: b.dataset.on === '1' }); toast(b.dataset.on === '1' ? 'Turned on.' : 'Turned off. They\'re signed out everywhere.'); loadPeople(); } catch (e) { toast(e.message); }
    });
  }
  // Add or edit a person. Roles offered are below your own (any role for an admin); "reports to" lists people who outrank the chosen role.
  function form(u) {
    const me = P.meUser, box = $('u-form');
    const roles = Object.keys(P.roles).filter(r => me.admin || RANK[r] < RANK[me.role]).sort((a, b) => RANK[b] - RANK[a]);
    box.hidden = false;
    box.innerHTML = `<div class="note"><b>${u ? 'Edit ' + esc(nm(u)) : 'Add a person'}</b>
      <div class="form" style="margin-top:8px">
        <label class="fld"><span>Name</span><input id="u-name" value="${esc(u ? u.name : '')}"></label>
        ${u ? '<span></span>' : `<label class="fld"><span>Username (for signing in)</span><input id="u-user" autocapitalize="none" autocomplete="off"></label>
        <label class="fld"><span>Temporary password (10+ characters)</span><input id="u-pass" type="text" autocomplete="off"></label><span></span>`}
        <label class="fld"><span>Role</span><select id="u-role">${roles.map(r => `<option value="${r}" ${u && u.role === r ? 'selected' : ''}>${esc(P.roles[r])}</option>`).join('')}</select></label>
        <label class="fld"><span>Reports to</span><select id="u-mgr"></select></label>
        ${u ? `<div class="fld full"><span>Photo</span><div class="row">${avatar(u)}<label class="btn sm" for="u-photo">Upload photo</label><input type="file" id="u-photo" accept="image/*" hidden>${u.photo ? '<button class="btn sm" id="u-photo-del" type="button">Remove</button>' : ''}</div></div>` : ''}
        ${me.admin ? `<label class="cb full"><input type="checkbox" id="u-admin" ${u && u.admin ? 'checked' : ''}><span>Also an admin (can manage everyone and everything, like your account)</span></label>` : ''}
      </div>
      <div class="row" style="margin-top:8px"><button class="btn primary" id="u-save">${u ? 'Save' : 'Add person'}</button><button class="btn" id="u-cancel">Cancel</button><span class="muted small" id="u-msg"></span></div></div>`;
    const mgrs = () => {
      const r = $('u-role').value, keep = $('u-mgr').value || (u ? u.manager : (RANK[me.role] > RANK[r] ? me.id : ''));
      const opts = P.managers.filter(m => RANK[m.role] > RANK[r] && (!u || m.id !== u.id));
      $('u-mgr').innerHTML = (me.admin ? '<option value="">Nobody</option>' : '') + opts.map(m => `<option value="${m.id}" ${m.id === keep ? 'selected' : ''}>${esc(nm(m))} · ${esc(P.roles[m.role])}</option>`).join('');
    };
    $('u-role').onchange = mgrs; mgrs();
    if (u) {
      $('u-photo').onchange = async () => { const f = $('u-photo').files[0]; if (!f) return; try { await uploadPhoto(u.id, f); toast('Photo updated.'); box.hidden = true; loadPeople(); } catch (e) { $('u-msg').textContent = e.message; } };
      const pd = $('u-photo-del'); if (pd) pd.onclick = async () => { try { await api('DELETE', `/api/users/${u.id}/photo`); box.hidden = true; loadPeople(); } catch (e) { $('u-msg').textContent = e.message; } };
    }
    $('u-cancel').onclick = () => { box.hidden = true; };
    $('u-save').onclick = async () => {
      const body = { name: $('u-name').value, role: $('u-role').value, manager: $('u-mgr').value || null };
      if ($('u-admin')) body.admin = $('u-admin').checked;
      try {
        if (u) await api('PATCH', '/api/users/' + u.id, body);
        else await api('POST', '/api/users', { ...body, username: $('u-user').value, password: $('u-pass').value });
        box.hidden = true; toast(u ? 'Saved.' : 'Added. Give them their username and temporary password.'); loadPeople();
      } catch (e) { $('u-msg').textContent = e.message; }
    };
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function resetPw(u) {
    const box = $('u-form'); box.hidden = false;
    box.innerHTML = `<div class="note"><b>New password for ${esc(nm(u))}</b><div class="row" style="margin-top:8px"><input class="inp" id="u-np" type="text" autocomplete="off" placeholder="10+ characters" style="max-width:260px"><button class="btn primary" id="u-npgo">Set password</button><button class="btn" id="u-cancel">Cancel</button><span class="muted small" id="u-msg"></span></div><p class="muted small" style="margin:6px 0 0">They're signed out everywhere and use this to sign back in.</p></div>`;
    $('u-cancel').onclick = () => { box.hidden = true; };
    $('u-npgo').onclick = async () => { try { await api('POST', `/api/users/${u.id}/password`, { password: $('u-np').value }); box.hidden = true; toast('Password set.'); } catch (e) { $('u-msg').textContent = e.message; } };
  }
  $('u-new').onclick = () => form(null);

  load().catch(e => toast(e.message));
})();
