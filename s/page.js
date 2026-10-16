// Reads the school's address from the link (/s/sunrise-academy, ?s=sunrise-academy or #sunrise-academy) and shows its site.
(async function () {
  const msg = (t) => (document.getElementById('msg').textContent = t);
  const slug = (location.pathname.split('/s/')[1] || new URLSearchParams(location.search).get('s') || location.hash.slice(1) || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (!slug) return msg('No school chosen.');
  const c = window.POS_CLOUD || {};
  try {
    const r = await fetch(c.url.replace(/\/$/, '') + '/rest/v1/rpc/site_get', { method: 'POST', headers: Object.assign({ apikey: c.anonKey, 'Content-Type': 'application/json' }, /^eyJ/.test(c.anonKey) ? { Authorization: 'Bearer ' + c.anonKey } : {}), body: JSON.stringify({ p_slug: slug }) });
    const j = await r.json();
    if (!r.ok) return msg('Could not load the school website. Please try again.');
    if (!j || !j.data) return msg('This school website was not found.');
    const html = window.renderSchoolSite(j.data);
    document.open();
    document.write(html);
    document.close();
  } catch (e) {
    msg('No internet connection. Please try again.');
  }
})();
