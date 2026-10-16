// A school's public website, drawn from one JSON object.
// Used in two places: the POS preview (School → Website) and the hosted page (dist-web/s/), so they always match.
// renderSchoolSite(data) → full HTML document as a string. No scripts inside, so it is safe in a sandboxed preview.
(function (root) {
  const THEMES = {
    green: ['#1f6f50', '#e7f3ec', '#123f2e'],
    blue: ['#1d5fa8', '#e6effa', '#123a66'],
    maroon: ['#8a1c32', '#f8e8ec', '#55101f'],
    navy: ['#1d2f5c', '#e8ecf5', '#101a33'],
    purple: ['#5b2c83', '#f0e9f6', '#381b52'],
    gold: ['#9a6a00', '#fbf2dc', '#5c3f00'],
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // plain text with blank lines → paragraphs
  const paras = (t) => String(t || '').trim().split(/\n\s*\n/).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const money = (n) => Number(n || 0).toLocaleString('en-KE', { maximumFractionDigits: 0 });
  const img = (src) => (/^data:image\/(png|jpe?g|webp);base64,/.test(String(src || '')) ? src : '');
  const date = (d) => {
    if (!d) return '';
    const x = new Date(d + 'T00:00:00');
    return isNaN(x) ? esc(d) : x.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const phoneLink = (p) => String(p || '').replace(/[^\d+]/g, '');
  const waLink = (p) => {
    let d = String(p || '').replace(/\D/g, '');
    if (/^0[17]\d{8}$/.test(d)) d = '254' + d.slice(1);
    return d;
  };

  function renderSchoolSite(d) {
    d = d || {};
    const [main, soft, dark] = THEMES[d.color] || THEMES.green;
    const c = d.contacts || {};
    const head = d.head || {};
    const adm = d.admissions || {};
    const news = (d.news || []).filter((n) => n && (n.title || n.text));
    const gallery = (d.gallery || []).map(img).filter(Boolean);
    const fees = d.show_fees && d.fees && d.fees.grades && d.fees.grades.length ? d.fees : null;
    const terms = (d.terms || []).filter((t) => t.starts_on || t.ends_on);
    const sections = [
      ['about', 'About', d.about || head.message],
      ['admissions', 'Admissions', adm.text || adm.open],
      ['fees', 'Fees', fees],
      ['calendar', 'Term dates', terms.length],
      ['news', 'News', news.length],
      ['gallery', 'Gallery', gallery.length],
      ['contact', 'Contact', true],
    ].filter((x) => x[2]);
    const logo = img(d.logo);
    const hero = img(d.hero);
    const stats = d.stats && d.show_stats ? d.stats : null;

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.name || 'School')}</title><meta name="description" content="${esc((d.motto ? d.motto + ' — ' : '') + String(d.welcome || '').slice(0, 140))}">
<meta property="og:title" content="${esc(d.name || 'School')}"><meta name="theme-color" content="${main}">
<style>
  :root { --m: ${main}; --s: ${soft}; --d: ${dark}; --ink: #1b1f1d; --mut: #5d6560; --bg: #fbfaf7; --line: #e4e1d8; }
  * { box-sizing: border-box } html { scroll-behavior: smooth } body { margin: 0; font: 16px/1.6 'Segoe UI', Roboto, system-ui, sans-serif; color: var(--ink); background: var(--bg) }
  a { color: var(--m) } img { max-width: 100% }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 0 18px }
  header.top { position: sticky; top: 0; z-index: 10; background: rgba(255,255,255,.96); border-bottom: 1px solid var(--line); backdrop-filter: blur(6px) }
  header.top .wrap { display: flex; align-items: center; gap: 12px; min-height: 60px }
  .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--d); font-weight: 800; font-size: 18px; line-height: 1.15 }
  .brand img { width: 40px; height: 40px; object-fit: contain; border-radius: 8px } .brand .mono { width: 40px; height: 40px; border-radius: 10px; background: var(--m); color: #fff; display: grid; place-items: center; font-weight: 800 }
  nav.links { margin-left: auto; display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none } nav.links a { text-decoration: none; color: var(--ink); padding: 8px 10px; border-radius: 8px; font-size: 14px; white-space: nowrap } nav.links a:hover { background: var(--s) }
  .hero { position: relative; color: #fff; background: linear-gradient(135deg, var(--d), var(--m)); overflow: hidden }
  .hero.photo { background: #000 } .hero .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: .55 }
  .hero .wrap { position: relative; padding: 72px 18px 64px } .hero h1 { margin: 0 0 6px; font-size: clamp(30px, 6vw, 52px); line-height: 1.1; letter-spacing: -.01em }
  .hero .motto { font-size: 18px; font-style: italic; opacity: .95 } .hero .welcome { max-width: 620px; margin-top: 18px; font-size: 17px }
  .cta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 24px } .btn { display: inline-flex; align-items: center; gap: 6px; padding: 11px 18px; border-radius: 10px; font-weight: 700; text-decoration: none; border: 2px solid transparent }
  .btn.w { background: #fff; color: var(--d) } .btn.o { border-color: rgba(255,255,255,.8); color: #fff } .btn.m { background: var(--m); color: #fff }
  .stats { display: flex; gap: 28px; flex-wrap: wrap; margin-top: 28px } .stats b { display: block; font-size: 28px } .stats span { opacity: .85; font-size: 14px }
  section { padding: 56px 0; border-bottom: 1px solid var(--line) } section:nth-of-type(even) { background: #fff }
  h2 { margin: 0 0 18px; font-size: 28px; color: var(--d) } h3 { margin: 0 0 6px; font-size: 18px }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; align-items: start }
  .head { display: flex; gap: 16px; align-items: flex-start; background: var(--s); padding: 18px; border-radius: 14px } .head img { width: 96px; height: 96px; border-radius: 50%; object-fit: cover; flex: none } .head .who { font-weight: 700; margin-top: 8px } .head .role { color: var(--mut); font-size: 14px }
  .pill { display: inline-block; padding: 4px 12px; border-radius: 99px; font-weight: 700; font-size: 14px } .pill.open { background: #dff3e6; color: #17603b } .pill.closed { background: #f5e3e0; color: #8b2c1f }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden } th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left } th { background: var(--s); color: var(--d); font-size: 14px } td.r, th.r { text-align: right } .tbl { overflow-x: auto; border: 1px solid var(--line); border-radius: 12px }
  .note { color: var(--mut); font-size: 14px; margin-top: 8px }
  .news { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 18px } .card { background: #fff; border: 1px solid var(--line); border-radius: 14px; overflow: hidden } .card img { width: 100%; height: 180px; object-fit: cover; display: block } .card .in { padding: 16px } .card time { color: var(--m); font-size: 13px; font-weight: 700 }
  .gal { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px } .gal img { width: 100%; aspect-ratio: 4/3; object-fit: cover; border-radius: 10px; display: block }
  .contact { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px } .contact .card { padding: 16px } .contact .k { color: var(--mut); font-size: 13px; text-transform: uppercase; letter-spacing: .05em }
  footer { background: var(--d); color: #fff; padding: 28px 0; font-size: 14px } footer a { color: #fff } footer .wrap { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; opacity: .9 }
  @media (max-width: 760px) { .grid2 { grid-template-columns: 1fr } nav.links { display: none } .hero .wrap { padding: 52px 18px 44px } section { padding: 40px 0 } }
</style></head><body>
<header class="top"><div class="wrap"><a class="brand" href="#top">${logo ? `<img src="${logo}" alt="">` : `<span class="mono">${esc(String(d.name || 'S').slice(0, 1))}</span>`}<span>${esc(d.name || '')}</span></a>
<nav class="links">${sections.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav></div></header>
<div class="hero${hero ? ' photo' : ''}" id="top">${hero ? `<img class="bg" src="${hero}" alt="">` : ''}<div class="wrap">
  <h1>${esc(d.name || '')}</h1>${d.motto ? `<div class="motto">“${esc(d.motto)}”</div>` : ''}
  ${d.welcome ? `<div class="welcome">${paras(d.welcome)}</div>` : ''}
  <div class="cta">${adm.open ? `<a class="btn w" href="#admissions">Admissions open</a>` : ''}${c.phone ? `<a class="btn o" href="tel:${esc(phoneLink(c.phone))}">Call ${esc(c.phone)}</a>` : ''}${c.whatsapp ? `<a class="btn o" href="https://wa.me/${esc(waLink(c.whatsapp))}">WhatsApp</a>` : ''}</div>
  ${stats ? `<div class="stats">${stats.pupils ? `<div><b>${esc(stats.pupils)}</b><span>pupils</span></div>` : ''}${stats.classes ? `<div><b>${esc(stats.classes)}</b><span>classes</span></div>` : ''}${stats.staff ? `<div><b>${esc(stats.staff)}</b><span>teachers & staff</span></div>` : ''}</div>` : ''}
</div></div>
${d.about || head.message ? `<section id="about"><div class="wrap grid2"><div><h2>About us</h2>${paras(d.about)}</div>
  ${head.message ? `<div class="head">${img(head.photo) ? `<img src="${img(head.photo)}" alt="">` : ''}<div><h3>From the head teacher</h3>${paras(head.message)}<div class="who">${esc(head.name || '')}</div><div class="role">${esc(head.title || 'Head teacher')}</div></div></div>` : ''}</div></section>` : ''}
${adm.text || adm.open ? `<section id="admissions"><div class="wrap"><h2>Admissions</h2><p><span class="pill ${adm.open ? 'open' : 'closed'}">${adm.open ? 'Admissions are open' : 'Admissions are closed for now'}</span></p>${paras(adm.text)}
  ${c.phone || c.whatsapp ? `<div class="cta">${c.phone ? `<a class="btn m" href="tel:${esc(phoneLink(c.phone))}">Call the school</a>` : ''}${c.whatsapp ? `<a class="btn m" href="https://wa.me/${esc(waLink(c.whatsapp))}?text=${encodeURIComponent('Hello, I would like to ask about admission at ' + (d.name || 'the school') + '.')}">Ask on WhatsApp</a>` : ''}</div>` : ''}</div></section>` : ''}
${fees ? `<section id="fees"><div class="wrap"><h2>Fees — ${esc(fees.term || '')}</h2><div class="tbl"><table><tr><th>Class</th>${fees.items.map((it) => `<th class="r">${esc(it.name)}${it.optional ? ' *' : ''}</th>`).join('')}<th class="r">Total</th></tr>
  ${fees.grades.map((g) => `<tr><td><b>${esc(g.grade)}</b></td>${fees.items.map((it) => `<td class="r">${g.amounts[it.id] ? money(g.amounts[it.id]) : '—'}</td>`).join('')}<td class="r"><b>${money(g.total)}</b></td></tr>`).join('')}</table></div>
  <div class="note">Amounts in ${esc(fees.currency || 'KES')} per term.${fees.items.some((i) => i.optional) ? ' * Optional, only for pupils who take it; not in the total.' : ''}</div></div></section>` : ''}
${terms.length ? `<section id="calendar"><div class="wrap"><h2>Term dates</h2><div class="tbl"><table><tr><th>Term</th><th>Opens</th><th>Closes</th></tr>${terms.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td>${date(t.starts_on)}</td><td>${date(t.ends_on)}</td></tr>`).join('')}</table></div></div></section>` : ''}
${news.length ? `<section id="news"><div class="wrap"><h2>News & events</h2><div class="news">${news.map((n) => `<article class="card">${img(n.photo) ? `<img src="${img(n.photo)}" alt="">` : ''}<div class="in">${n.date ? `<time>${date(n.date)}</time>` : ''}<h3>${esc(n.title || '')}</h3>${paras(n.text)}</div></article>`).join('')}</div></div></section>` : ''}
${gallery.length ? `<section id="gallery"><div class="wrap"><h2>Gallery</h2><div class="gal">${gallery.map((g) => `<img src="${g}" alt="" loading="lazy">`).join('')}</div></div></section>` : ''}
<section id="contact"><div class="wrap"><h2>Contact us</h2><div class="contact">
  ${c.phone ? `<div class="card"><div class="k">Phone</div><a href="tel:${esc(phoneLink(c.phone))}">${esc(c.phone)}</a></div>` : ''}
  ${c.whatsapp ? `<div class="card"><div class="k">WhatsApp</div><a href="https://wa.me/${esc(waLink(c.whatsapp))}">${esc(c.whatsapp)}</a></div>` : ''}
  ${c.email ? `<div class="card"><div class="k">Email</div><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></div>` : ''}
  ${c.address ? `<div class="card"><div class="k">Location</div>${esc(c.address)}${c.map ? `<br><a href="${esc(/^https?:\/\//.test(c.map) ? c.map : 'https://maps.google.com/?q=' + encodeURIComponent(c.map))}">Open in Google Maps</a>` : ''}</div>` : ''}
  ${c.facebook ? `<div class="card"><div class="k">Facebook</div><a href="${esc(/^https?:\/\//.test(c.facebook) ? c.facebook : 'https://facebook.com/' + c.facebook)}">${esc(c.facebook.replace(/^https?:\/\/(www\.)?/, ''))}</a></div>` : ''}
</div></div></section>
<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(d.name || '')}</span><span>School system by Davetech</span></div></footer>
</body></html>`;
  }

  root.renderSchoolSite = renderSchoolSite;
  root.SITE_THEMES = THEMES;
  if (typeof module !== 'undefined') module.exports = { renderSchoolSite, THEMES };
})(typeof window !== 'undefined' ? window : globalThis);
