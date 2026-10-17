// Reads the school's address from the link and shows its site:
//   /s/sunrise-academy            the website      (also ?s=sunrise-academy or #sunrise-academy)
//   /s/sunrise-academy/apply      the online application form
//   /s/sunrise-academy/courses    courses / classes and fees, for putting inside another website
(async function () {
  const msg = (t) => (document.getElementById('msg').textContent = t);
  const parts = (location.pathname.split('/s/')[1] || '').split('/');
  const q = new URLSearchParams(location.search);
  const slug = (parts[0] || q.get('s') || location.hash.slice(1) || '').replace(/[^a-z0-9-]/gi, '').toLowerCase();
  const view = (parts[1] || (q.has('apply') ? 'apply' : q.has('courses') ? 'courses' : '')).toLowerCase();
  if (!slug) return msg('No school chosen.');
  const c = window.POS_CLOUD || {};
  const rpc = async (fn, body) => {
    const r = await fetch(c.url.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers: Object.assign({ apikey: c.anonKey, 'Content-Type': 'application/json' }, /^eyJ/.test(c.anonKey) ? { Authorization: 'Bearer ' + c.anonKey } : {}), body: JSON.stringify(body) });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error((j && (j.message || j.error)) || 'Something went wrong. Please try again.');
    return j;
  };
  let j;
  try {
    j = await rpc('site_get', { p_slug: slug });
  } catch (e) {
    return msg(navigator.onLine === false ? 'No internet connection. Please try again.' : 'Could not load the school website. Please try again.');
  }
  if (!j || !j.data) return msg('This school website was not found.');
  const d = j.data;
  const html = view === 'apply' ? window.renderApplyForm(d) : view === 'courses' ? window.renderCourses(d) : window.renderSchoolSite(d);
  document.open();
  document.write(html);
  document.close();
  if (view !== 'apply') return;
  const form = document.getElementById('apply-form');
  if (!form) return;
  const out = document.getElementById('apply-msg');
  const say = (t, ok) => { out.className = 'msg ' + (ok ? 'ok' : 'err'); out.textContent = t; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!f.name || f.name.trim().length < 3) return say('Please enter the full name.');
    if (!f.course) return say('Please choose ' + (d.kind === 'college' ? 'a course.' : 'the class.'));
    if (String(f.phone || '').replace(/\D/g, '').length < 9) return say('Please enter a phone number we can call.');
    if (!f.consent) return say('Please tick the box to agree that we may contact you.');
    delete f.consent;
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await rpc('site_apply', { p_slug: slug, p_data: f });
      form.innerHTML = '<div class="msg ok">Thank you, ' + f.name.trim().split(' ')[0].replace(/[<>&]/g, '') + '. Your application has been sent. ' + (d.name || 'The school').replace(/[<>&]/g, '') + ' will contact you on ' + String(f.phone).replace(/[^0-9+ ]/g, '') + '.</div><p><a href="/s/' + slug + '">Back to the website</a></p>';
      window.scrollTo(0, 0);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Send application';
      say(navigator.onLine === false ? 'No internet connection. Please try again.' : err.message);
    }
  });
})();
