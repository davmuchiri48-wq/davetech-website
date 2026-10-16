// Fills in contacts and prices from config.js, the mobile menu, and the WhatsApp quote form.
(function () {
  const C = window.DAVETECH || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  // 0712 345 678 → 254712345678 for wa.me links
  const wa = (p) => {
    let d = String(p || '').replace(/\D/g, '');
    if (/^0[17]\d{8}$/.test(d)) d = '254' + d.slice(1);
    return d;
  };
  const tel = (p) => String(p || '').replace(/[^\d+]/g, '');
  const waUrl = (text) => `https://wa.me/${wa(C.whatsapp)}?text=${encodeURIComponent(text)}`;

  $('#year').textContent = new Date().getFullYear();

  // mobile menu
  const burger = $('#burger');
  const menu = $('#menu');
  burger.addEventListener('click', () => {
    const open = menu.classList.toggle('open');
    burger.setAttribute('aria-expanded', open);
  });
  $$('#menu a').forEach((a) => a.addEventListener('click', () => { menu.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }));

  // call buttons only appear when the number is set
  $$('.call-link').forEach((a) => {
    if (C.phone) { a.href = 'tel:' + tel(C.phone); a.textContent = 'Call ' + C.phone; } else a.remove();
  });

  const list = $('#contact-list');
  const items = [
    C.phone && `<li><span>Phone</span><a href="tel:${esc(tel(C.phone))}">${esc(C.phone)}</a></li>`,
    C.whatsapp && `<li><span>WhatsApp</span><a href="${esc(waUrl('Hello Davetech'))}" target="_blank" rel="noopener">${esc(C.whatsapp)}</a></li>`,
    C.email && `<li><span>Email</span><a href="mailto:${esc(C.email)}">${esc(C.email)}</a></li>`,
    C.location && `<li><span>Location</span>${esc(C.location)}</li>`,
    C.hours && `<li><span>Open</span>${esc(C.hours)}</li>`,
  ].filter(Boolean);
  list.innerHTML = items.join('');

  const fl = $('#float');
  const icon = {
    wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.7.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.2-.2-.5-.3Z"/></svg>',
    call: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2Z"/></svg>',
  };
  if (C.whatsapp) fl.insertAdjacentHTML('beforeend', `<a class="wa" href="${esc(waUrl('Hello Davetech'))}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">${icon.wa}</a>`);
  if (C.phone) fl.insertAdjacentHTML('beforeend', `<a class="call" href="tel:${esc(tel(C.phone))}" aria-label="Call Davetech">${icon.call}</a>`);

  // packages from config, with All / One-time / Pay as you go tabs
  const plans = $('#plans');
  const tabs = $('.tabs');
  const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 5l7 7-7 7-1.4-1.4 4.6-4.6H4v-2h12.2l-4.6-4.6z"/></svg>';
  const P = Array.isArray(C.pricing) ? C.pricing : [];
  if (P.length) {
    plans.innerHTML = P.map((p, i) => {
      const msg = `Hello Davetech, I'm interested in the ${p.name} package (${p.price}${p.per ? ' ' + p.per : ''}).`;
      const notes = (p.notes || []).map((n) => `<span>${esc(n)}</span>`).join('<br>');
      return `<article class="plan${i % 2 ? ' alt' : ''}" data-group="${esc(p.group || 'once')}">
        <div class="plan-top">${esc(p.name)}</div>
        <div class="kind">${esc(p.kind || (p.group === 'sub' ? 'Subscription' : 'One-time payment'))}</div>
        <div class="price">${esc(p.price)}</div>${p.per ? `<div class="per">${esc(p.per)}</div>` : ''}
        ${notes || p.extra ? `<div class="note"><b>Note:</b>${notes}${p.extra ? `<br><em>${esc(p.extra)}</em>` : ''}</div>` : ''}
        ${p.items && p.items.length ? `<ul>${p.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        <a class="btn wa-link" data-msg="${esc(msg)}" href="#contact">Choose package ${arrow}</a>
      </article>`;
    }).join('');
    const groups = new Set(P.map((p) => p.group || 'once'));
    if (groups.size < 2) tabs.classList.add('none');
  } else tabs.classList.add('none');
  tabs.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    $$('button', tabs).forEach((b) => b.setAttribute('aria-selected', b === t));
    $$('.plan', plans).forEach((el) => { el.hidden = t.dataset.tab !== 'all' && el.dataset.group !== t.dataset.tab; });
  });

  // WhatsApp links (set after the package buttons exist)
  $$('.wa-link').forEach((a) => {
    if (C.whatsapp) { a.href = waUrl(a.dataset.msg || 'Hello Davetech'); a.target = '_blank'; a.rel = 'noopener'; }
  });

  // chat bubble
  const chat = $('#chat'); const pop = $('#chat-pop'); const cb = $('#chat-btn');
  chat.hidden = false;
  const setPop = (open) => { pop.hidden = !open; cb.setAttribute('aria-expanded', open); };
  cb.addEventListener('click', () => setPop(pop.hidden));
  $('#chat-x').addEventListener('click', () => setPop(false));
  $$('.chat-opt', pop).forEach((a) => a.addEventListener('click', () => setPop(false)));

  // footer contact strip and social links
  const ico = {
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 6 9 7 9-7"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z"/></svg>',
  };
  const fc = (icon, label, value, href) => `<${href ? `a href="${esc(href)}"` : 'div'} class="fc">${ico[icon]}<span><small>${esc(label)}</small><b>${esc(value)}</b></span></${href ? 'a' : 'div'}>`;
  $('#foot-contacts').innerHTML = [
    C.hours && fc('clock', 'Opening hours', C.hours),
    C.phone && fc('phone', 'Call us', C.phone, 'tel:' + tel(C.phone)),
    C.email && fc('mail', 'Email', C.email, 'mailto:' + C.email),
    C.location && fc('pin', 'Find us', C.location),
  ].filter(Boolean).join('');
  const soc = {
    facebook: '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H8v4h2v8h4v-8h3l1-4h-4V8Z"/>',
    tiktok: '<path d="M16 3c.3 2.2 1.8 3.8 4 4v3.2a7.4 7.4 0 0 1-4-1.3V15a6 6 0 1 1-6-6v3.3a2.7 2.7 0 1 0 2.7 2.7V3H16Z"/>',
    instagram: '<path d="M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H8Zm4 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM17 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>',
    x: '<path d="M4 4h4.5l4 5.5L17 4h3l-6 7.3L21 20h-4.5l-4.4-6L7 20H4l6.6-8L4 4Z"/>',
    linkedin: '<path d="M5 9h3v11H5V9Zm1.5-5a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4ZM10 9h3v1.6c.5-.9 1.7-1.8 3.4-1.8 3.2 0 3.6 2 3.6 4.7V20h-3v-5.7c0-1.4 0-3-1.9-3s-2.1 1.4-2.1 2.9V20h-3V9Z"/>',
    youtube: '<path d="M21.6 7.2A2.5 2.5 0 0 0 19.8 5.4C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z"/>',
  };
  const S = C.social || {};
  $('#social').innerHTML = Object.keys(soc).filter((k) => S[k]).map((k) => `<a href="${esc(S[k])}" target="_blank" rel="noopener" aria-label="Davetech on ${k}"><svg viewBox="0 0 24 24">${soc[k]}</svg></a>`).join('');

  // quote form → WhatsApp (or email) with the message ready
  $('#quote').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const text = `Hello Davetech, I'm ${f.name} from ${f.business} (${f.type}${f.town ? ', ' + f.town : ''}).\n${f.msg || 'I would like a quote for the POS.'}`;
    const note = $('#form-note');
    if (C.whatsapp) {
      window.open(waUrl(text), '_blank', 'noopener');
      note.textContent = 'WhatsApp opened with your message. Press Send there.';
    } else if (C.email) {
      location.href = `mailto:${C.email}?subject=${encodeURIComponent('Quote request — ' + f.business)}&body=${encodeURIComponent(text)}`;
      note.textContent = 'Your email app opened with the message.';
    } else {
      note.textContent = 'Contact details are not set up yet.';
    }
  });
})();
