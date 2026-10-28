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

  const css = (main, soft, dark) => `  :root { --m: ${main}; --s: ${soft}; --d: ${dark}; --ink: #1b1f1d; --mut: #5d6560; --bg: #fbfaf7; --line: #e4e1d8; }
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

  .form { display: grid; gap: 14px; background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 22px; max-width: 760px }
  .form .two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px } .form label { display: flex; flex-direction: column; gap: 6px; font-weight: 600; font-size: 15px }
  .form input, .form select, .form textarea { font: 16px inherit; padding: 11px 12px; border: 1px solid #cfccc2; border-radius: 10px; background: #fff; color: var(--ink); font-family: inherit }
  .form input:focus, .form select:focus, .form textarea:focus { outline: 3px solid var(--s); border-color: var(--m) }
  .form .req::after { content: ' *'; color: #b3261e } .form .check { flex-direction: row; align-items: flex-start; font-weight: 400; gap: 10px } .form .check input { margin-top: 4px }
  .form button { font: 700 17px inherit; font-family: inherit; padding: 13px 20px; border: 0; border-radius: 10px; background: var(--m); color: #fff; cursor: pointer } .form button:disabled { opacity: .6 }
  .msg { padding: 12px 14px; border-radius: 10px; font-weight: 600 } .msg.err { background: #fbe6e3; color: #8b2c1f } .msg.ok { background: #dff3e6; color: #17603b }
  .courses { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px } .course { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 16px } .course .fee { font-size: 22px; font-weight: 800; color: var(--d); margin-top: 6px } .course .per { color: var(--mut); font-size: 13px }
  @media (max-width: 760px) { .form .two { grid-template-columns: 1fr } }`;
  const words = (d) => (d && d.kind === 'college'
    ? { pupils: 'students', pupil: 'student', staff: 'trainers & staff', head: 'Principal', from: 'From the principal', place: 'the college', cls: 'Course', by: 'College system by Daalpha Systems', apply: 'Apply for a course' }
    : { pupils: 'pupils', pupil: 'pupil', staff: 'teachers & staff', head: 'Head teacher', from: 'From the head teacher', place: 'the school', cls: 'Class', by: 'School system by Daalpha Systems', apply: 'Apply for admission' });
  const base = (d) => (d && d.slug ? '/s/' + encodeURIComponent(d.slug) : '');
  const applyOn = (d) => !!(d && d.apply && d.apply.online && d.admissions && d.admissions.open);

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
    const w = words(d);
    const applyLink = applyOn(d) ? base(d) + '/apply' : '';

    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(d.name || 'School')}</title><meta name="description" content="${esc((d.motto ? d.motto + ' — ' : '') + String(d.welcome || '').slice(0, 140))}">
<meta property="og:title" content="${esc(d.name || 'School')}"><meta name="theme-color" content="${main}">
<style>
${css(main, soft, dark)}</style></head><body>
<header class="top"><div class="wrap"><a class="brand" href="#top">${logo ? `<img src="${logo}" alt="">` : `<span class="mono">${esc(String(d.name || 'S').slice(0, 1))}</span>`}<span>${esc(d.name || '')}</span></a>
<nav class="links">${sections.map(([id, label]) => `<a href="#${id}">${label}</a>`).join('')}</nav></div></header>
<div class="hero${hero ? ' photo' : ''}" id="top">${hero ? `<img class="bg" src="${hero}" alt="">` : ''}<div class="wrap">
  <h1>${esc(d.name || '')}</h1>${d.motto ? `<div class="motto">“${esc(d.motto)}”</div>` : ''}
  ${d.welcome ? `<div class="welcome">${paras(d.welcome)}</div>` : ''}
  <div class="cta">${applyLink ? `<a class="btn w" href="${applyLink}">Apply online</a>` : adm.open ? `<a class="btn w" href="#admissions">Admissions open</a>` : ''}${c.phone ? `<a class="btn o" href="tel:${esc(phoneLink(c.phone))}">Call ${esc(c.phone)}</a>` : ''}${c.whatsapp ? `<a class="btn o" href="https://wa.me/${esc(waLink(c.whatsapp))}">WhatsApp</a>` : ''}</div>
  ${stats ? `<div class="stats">${stats.pupils ? `<div><b>${esc(stats.pupils)}</b><span>${w.pupils}</span></div>` : ''}${stats.classes ? `<div><b>${esc(stats.classes)}</b><span>classes</span></div>` : ''}${stats.staff ? `<div><b>${esc(stats.staff)}</b><span>${w.staff}</span></div>` : ''}</div>` : ''}
</div></div>
${d.about || head.message ? `<section id="about"><div class="wrap grid2"><div><h2>About us</h2>${paras(d.about)}</div>
  ${head.message ? `<div class="head">${img(head.photo) ? `<img src="${img(head.photo)}" alt="">` : ''}<div><h3>${w.from}</h3>${paras(head.message)}<div class="who">${esc(head.name || '')}</div><div class="role">${esc(head.title || w.head)}</div></div></div>` : ''}</div></section>` : ''}
${adm.text || adm.open ? `<section id="admissions"><div class="wrap"><h2>Admissions</h2><p><span class="pill ${adm.open ? 'open' : 'closed'}">${adm.open ? 'Admissions are open' : 'Admissions are closed for now'}</span></p>${paras(adm.text)}
  ${applyLink || c.phone || c.whatsapp ? `<div class="cta">${applyLink ? `<a class="btn m" href="${applyLink}">${w.apply} online</a>` : ''}${c.phone ? `<a class="btn m" href="tel:${esc(phoneLink(c.phone))}">Call ${w.place}</a>` : ''}${c.whatsapp ? `<a class="btn m" href="https://wa.me/${esc(waLink(c.whatsapp))}?text=${encodeURIComponent('Hello, I would like to ask about admission at ' + (d.name || w.place) + '.')}">Ask on WhatsApp</a>` : ''}</div>` : ''}</div></section>` : ''}
${fees ? `<section id="fees"><div class="wrap"><h2>Fees — ${esc(fees.term || '')}</h2><div class="tbl"><table><tr><th>${w.cls}</th>${fees.items.map((it) => `<th class="r">${esc(it.name)}${it.optional ? ' *' : ''}</th>`).join('')}<th class="r">Total</th></tr>
  ${fees.grades.map((g) => `<tr><td><b>${esc(g.grade)}</b></td>${fees.items.map((it) => `<td class="r">${g.amounts[it.id] ? money(g.amounts[it.id]) : '—'}</td>`).join('')}<td class="r"><b>${money(g.total)}</b></td></tr>`).join('')}</table></div>
  <div class="note">Amounts in ${esc(fees.currency || 'KES')} per term.${fees.items.some((i) => i.optional) ? ` * Optional, only for ${w.pupils} who take it; not in the total.` : ''}</div></div></section>` : ''}
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
<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(d.name || '')}</span><span>${w.by}</span></div></footer>
</body></html>`;
  }

  // Page head + header bar shared by the form and the courses block.
  const shell = (d, title, body, { bare = false } = {}) => {
    const [main, soft, dark] = THEMES[d.color] || THEMES.green;
    const logo = img(d.logo);
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="theme-color" content="${main}"><style>
${css(main, soft, dark)}
  body.bare { background: transparent } body.bare section { padding: 8px 0; border: 0 } body.bare section:nth-of-type(even) { background: transparent }
</style></head><body${bare ? ' class="bare"' : ''}>
${bare ? '' : `<header class="top"><div class="wrap"><a class="brand" href="${base(d) || '#'}">${logo ? `<img src="${logo}" alt="">` : `<span class="mono">${esc(String(d.name || 'S').slice(0, 1))}</span>`}<span>${esc(d.name || '')}</span></a></div></header>`}
${body}
${bare ? '' : `<footer><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(d.name || '')}</span><span>${words(d).by}</span></div></footer>`}
</body></html>`;
  };

  // The online application form (/s/<address>/apply). page.js sends it; this only draws it.
  function renderApplyForm(d) {
    d = d || {};
    const w = words(d);
    const college = d.kind === 'college';
    const ap = d.apply || {};
    if (!applyOn(d)) {
      const c = d.contacts || {};
      return shell(d, w.apply + ' — ' + (d.name || ''), `<section><div class="wrap"><h2>${w.apply}</h2><p class="msg err">${esc(d.name || 'We')} ${d.admissions && d.admissions.open ? 'is not taking applications online right now.' : 'is not taking new applications right now.'}</p>
        ${c.phone ? `<p>Please call <a href="tel:${esc(phoneLink(c.phone))}">${esc(c.phone)}</a>.</p>` : ''}<p><a href="${base(d)}">Back to the website</a></p></div></section>`);
    }
    const opt = (list, ph) => `<option value="">${ph}</option>` + (list || []).map((x) => `<option>${esc(x)}</option>`).join('');
    const intakes = (ap.intakes || []).length ? `<select name="intake">${opt(ap.intakes, '— any —')}</select>` : `<input name="intake" maxlength="60" placeholder="e.g. January 2027">`;
    return shell(d, w.apply + ' — ' + (d.name || ''), `<section><div class="wrap">
  <h2>${w.apply}</h2>
  <p>Fill in this form and ${esc(d.name || w.place)} will contact you. Fields marked * are needed.</p>
  <form class="form" id="apply-form" novalidate>
    <label><span class="req">${college ? 'Full name' : 'Child’s full name'}</span><input name="name" required maxlength="80" autocomplete="name"></label>
    <div class="two">
      <label><span class="req">${college ? 'Course' : 'Class applying for'}</span><select name="course" required>${opt(ap.choices, '— choose —')}</select></label>
      <label>${college ? 'Preferred intake' : 'When to join'}${intakes}</label>
    </div>
    <div class="two">
      <label><span class="req">${college ? 'Phone number' : 'Parent’s phone number'}</span><input name="phone" type="tel" required maxlength="20" placeholder="07…" autocomplete="tel"></label>
      <label>Email<input name="email" type="email" maxlength="100" autocomplete="email"></label>
    </div>
    <div class="two">
      <label>Gender<select name="gender"><option value="">—</option><option>${college ? 'Female' : 'Girl'}</option><option>${college ? 'Male' : 'Boy'}</option></select></label>
      <label>Date of birth<input name="dob" type="date"></label>
    </div>
    ${college ? `<div class="two"><label>ID / birth certificate no.<input name="id_no" maxlength="30"></label>
      <label>Highest education<select name="education"><option value="">—</option><option>KCSE</option><option>KCPE / KPSEA</option><option>Certificate</option><option>Diploma</option><option>Degree</option><option>Other</option></select></label></div>` : ''}
    <div class="two">
      <label>${college ? 'Country' : 'County'}<input name="${college ? 'country' : 'region'}" maxlength="60" ${college ? 'value="Kenya"' : ''}></label>
      <label>${college ? 'County / region' : 'Residential area'}<input name="${college ? 'region' : 'residence'}" maxlength="60"></label>
    </div>
    ${college ? '<label>Residential area<input name="residence" maxlength="60"></label>' : ''}
    <div class="two">
      <label>${college ? 'Sponsor / next of kin' : 'Parent / guardian’s name'}<input name="sponsor_name" maxlength="80"></label>
      <label>${college ? 'Sponsor’s phone' : 'Second phone'}<input name="sponsor_phone" type="tel" maxlength="20"></label>
    </div>
    <label>Message (optional)<textarea name="message" rows="3" maxlength="1000" placeholder="${college ? 'e.g. I prefer evening classes' : 'e.g. moving from another school'}"></textarea></label>
    <label class="check"><input type="checkbox" name="consent" required><span>I agree that ${esc(d.name || w.place)} may keep these details and contact me about this application.</span></label>
    <div id="apply-msg" role="status"></div>
    <button type="submit">Send application</button>
  </form></div></section>`);
  }

  // Courses / classes with fees and intakes, made to sit inside another website (/s/<address>/courses).
  function renderCourses(d) {
    d = d || {};
    const w = words(d);
    const fees = d.show_fees && d.fees && d.fees.grades ? d.fees : null;
    const choices = (d.apply && d.apply.choices) || (fees ? fees.grades.map((g) => g.grade) : []);
    const feeOf = (name) => (fees ? fees.grades.find((g) => g.grade === name) : null);
    const intakes = (d.apply && d.apply.intakes) || [];
    const terms = (d.terms || []).filter((t) => t.starts_on);
    const applyLink = applyOn(d) ? base(d) + '/apply' : '';
    return shell(d, (d.kind === 'college' ? 'Courses' : 'Classes') + ' — ' + (d.name || ''), `<section><div class="wrap">
  <div class="courses">${choices.map((name) => { const f = feeOf(name); return `<div class="course"><h3>${esc(name)}</h3>${f ? `<div class="fee">${esc(fees.currency || 'KES')} ${money(f.total)}</div><div class="per">per term${fees.term ? ' (' + esc(fees.term) + ')' : ''}</div>` : ''}</div>`; }).join('')}</div>
  ${intakes.length ? `<p><b>Intakes:</b> ${intakes.map(esc).join(' · ')}</p>` : ''}
  ${terms.length ? `<p><b>Next term opens:</b> ${terms.map((t) => `${esc(t.name)} — ${date(t.starts_on)}`).join(' · ')}</p>` : ''}
  ${fees && fees.items.some((i) => i.optional) ? `<p class="note">Fees shown are tuition and other required fees per term. ${fees.items.filter((i) => i.optional).map((i) => esc(i.name)).join(', ')} are extra, only for ${w.pupils} who take them.</p>` : ''}
  <div class="cta">${applyLink ? `<a class="btn m" href="${applyLink}" target="_top">${w.apply} online</a>` : ''}<a class="btn m" style="background:var(--d)" href="${base(d) || '#'}" target="_top">More about ${esc(d.name || w.place)}</a></div>
</div></section>`, { bare: true });
  }

  root.renderSchoolSite = renderSchoolSite;
  root.renderApplyForm = renderApplyForm;
  root.renderCourses = renderCourses;
  root.SITE_THEMES = THEMES;
  if (typeof module !== 'undefined') module.exports = { renderSchoolSite, renderApplyForm, renderCourses, THEMES };
})(typeof window !== 'undefined' ? window : globalThis);
