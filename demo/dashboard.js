'use strict';
/* Daalpha Systems — online owner dashboard.
   Runs inside the POS app (sign-in screen → "Owner dashboard") and as a standalone web page.
   Talks only to Supabase: Auth for sign-in, and the dash_* functions from supabase/schema.sql. */
(function () {
  const TYPES = { retail: 'Retail shop', restaurant: 'Hotel / restaurant', bar: 'Bar / pub / club', pharmacy: 'Pharmacy', canteen: 'School canteen / shop', salon: 'Salon / barber / spa', school: 'School', college: 'College' };
  const isEdu = (s) => s && (s.business_type === 'school' || s.business_type === 'college');
  const ACTS = {
    sign_in: ['🔓', 'Signed in'], sign_out: ['🔒', 'Signed out'], pin_failed: ['⚠️', 'Wrong PIN'], pin_locked: ['⛔', 'PIN locked'],
    sale: ['🧾', 'Sale'], discount: ['🏷️', 'Discount'], price_override: ['✏️', 'Price changed at till'], void: ['❌', 'Void'],
    stock_take: ['🔢', 'Stock take finished'], stock_take_started: ['🔢', 'Stock take started'], stock_take_cancelled: ['🔢', 'Stock take cancelled'],
    bill: ['🧾', 'Bill printed'], bill_reduced: ['⚠️', 'Paid less than the bill'],
    order_deleted: ['🗑️', 'Held order deleted'], product_added: ['📦', 'Product added'], price_changed: ['💲', 'Price changed'],
    product_edited: ['📦', 'Product edited'], product_disabled: ['📦', 'Product stopped'], stock_received: ['📥', 'Stock received'],
    stock_adjusted: ['📉', 'Stock adjusted'], stock_take: ['📋', 'Stock take'], account_payment: ['💵', 'Account payment'],
    credit_limit: ['💳', 'Credit limit'], user_added: ['👤', 'User added'], user_role: ['👤', 'Role changed'], user_disabled: ['👤', 'User disabled'],
    pin_changed: ['🔑', 'PIN changed'], password_changed: ['🔑', 'Password changed'], settings_changed: ['⚙️', 'Settings changed'],
  };
  const METHODS = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', account: 'On account' };
  const store = {
    get(k) {
      try {
        return JSON.parse(localStorage.getItem('dash.' + k));
      } catch (_) {
        return null;
      }
    },
    set(k, v) {
      try {
        v === null ? localStorage.removeItem('dash.' + k) : localStorage.setItem('dash.' + k, JSON.stringify(v));
      } catch (_) {}
    },
  };

  // ---------- tiny DOM helpers (same style as the POS screens) ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    return el;
  }
  const put = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  const iso = (d) => d.toLocaleDateString('en-CA');
  const today = () => iso(new Date());
  const daysAgo = (n) => iso(new Date(Date.now() - n * 864e5));
  const money = (n, cur) => `${cur ? cur + ' ' : ''}${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const qty = (n) => (Number.isInteger(+n) ? String(+n) : String(Math.round(n * 100) / 100));
  const time = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '');
  function ago(ts) {
    if (!ts) return 'never';
    const m = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
    if (m < 2) return 'just now';
    if (m < 60) return m + ' min ago';
    if (m < 48 * 60) return Math.round(m / 60) + ' h ago';
    return Math.round(m / 1440) + ' days ago';
  }

  function mount(root, { cloud, onExit } = {}) {
    cloud = cloud || window.POS_CLOUD || {};
    const base = String(cloud.url || '').replace(/\/$/, '');
    let auth = store.get('auth');
    const S = { me: null, shop: null, range: store.get('range') || 'today', tab: 'summary', from: today(), to: today(), actWatch: false, actUser: '' };
    // same access levels, named for schools or shops
    const roleName = (r) => (S.shop && S.shop.business_type === 'college' ? { cashier: 'trainer / staff', manager: 'deputy / manager', admin: 'principal / admin', owner: 'owner' } : S.shop && S.shop.business_type === 'school' ? { cashier: 'teacher / staff', manager: 'deputy / manager', admin: 'head teacher / admin', owner: 'owner' } : { cashier: 'cashier', manager: 'manager', admin: 'admin', owner: 'owner' })[r] || r;

    const shell = h('div', { class: 'dash' });
    put(root, shell);
    const toast = (msg, err) => {
      const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
      (document.getElementById('toasts') || document.body).append(t);
      setTimeout(() => t.remove(), err ? 5000 : 2600);
    };

    if (!base || !cloud.anonKey) {
      put(shell, h('div', { class: 'dash-center' }, h('div', { class: 'card pad dash-auth' }, h('h2', {}, 'Online dashboard'), h('p', { class: 'muted' }, 'This version of the app was built without the online dashboard settings.'), onExit ? h('button', { class: 'btn', onclick: onExit }, '← Back') : null)));
      return;
    }

    // ---------- Supabase calls ----------
    async function authCall(path, body) {
      let res;
      try {
        res = await fetch(base + '/auth/v1/' + path, { method: 'POST', headers: { apikey: cloud.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch (_) {
        throw new Error('No internet connection.');
      }
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.msg || j.error_description || j.message || 'Sign-in failed.');
      return j;
    }
    function saveSession(j) {
      auth = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), email: (j.user && j.user.email) || (auth && auth.email) };
      store.set('auth', auth);
    }
    async function token() {
      if (!auth) throw new Error('Please sign in.');
      if (auth.expires_at - 60 < Date.now() / 1000) {
        try {
          saveSession(await authCall('token?grant_type=refresh_token', { refresh_token: auth.refresh_token }));
        } catch (e) {
          if (/internet/.test(e.message)) throw e;
          signOut();
          throw new Error('Please sign in again.');
        }
      }
      return auth.access_token;
    }
    async function rpc(fn, body = {}) {
      const t = await token();
      let res;
      try {
        res = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: cloud.anonKey, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      } catch (_) {
        throw new Error('No internet connection.');
      }
      const txt = await res.text();
      let j = null;
      try {
        j = txt ? JSON.parse(txt) : null;
      } catch (_) {}
      if (res.status === 401 && /JWT/.test((j && j.message) || '')) {
        signOut();
        throw new Error('Please sign in again.');
      }
      if (!res.ok) throw new Error((j && (j.message || j.msg)) || 'Server error ' + res.status);
      return j;
    }
    const tryRpc = async (fn, body) => {
      try {
        return await rpc(fn, body);
      } catch (e) {
        toast(e.message, true);
        return undefined;
      }
    };
    function signOut() {
      if (auth) fetch(base + '/auth/v1/logout', { method: 'POST', headers: { apikey: cloud.anonKey, Authorization: 'Bearer ' + auth.access_token } }).catch(() => {});
      auth = null;
      store.set('auth', null);
      renderAuth();
    }

    function modal(title, body, foot) {
      const box = h('div', { class: 'modal' });
      const ov = h('div', { class: 'overlay' }, box);
      const close = () => ov.remove();
      ov.addEventListener('mousedown', (e) => e.target === ov && close());
      put(box, h('div', { class: 'modal-head' }, h('h2', {}, title), h('div', { class: 'spacer' }), h('button', { class: 'btn ghost sm', onclick: close }, '✕')), h('div', { class: 'modal-body' }, typeof body === 'function' ? body(close) : body), foot ? h('div', { class: 'modal-foot' }, foot(close)) : null);
      (document.getElementById('modal-root') || document.body).append(ov);
      return close;
    }
    const field = (label, input) => h('label', { class: 'field' }, label, input);
    const topbar = (title, sub, left, right) =>
      h('div', { class: 'dash-top' }, left || h('div', { class: 'dash-logo' }, 'D'), h('div', { class: 'dash-title' }, h('b', {}, title), sub ? h('span', {}, sub) : null), h('div', { class: 'spacer' }), right);

    // ---------- sign in / create account ----------
    function renderAuth() {
      let mode = 'in';
      // A plain text box with the email keyboard: some Android keyboards misbehave with type="email"
      // (typing jumps to the password box or doesn't show).
      const email = h('input', { class: 'input', type: 'text', inputMode: 'email', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: false, placeholder: 'you@example.com', value: (store.get('lastEmail') || '') });
      const pw = h('input', { class: 'input', type: 'password', autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: false, placeholder: 'At least 6 characters' });
      const eye = h('button', { class: 'btn ghost sm dash-eye', type: 'button', onclick: () => { pw.type = pw.type === 'password' ? 'text' : 'password'; eye.textContent = pw.type === 'password' ? 'Show' : 'Hide'; } }, 'Show');
      const msg = h('div', { class: 'dash-msg' });
      const btn = h('button', { class: 'btn primary big', onclick: () => go() }, 'Sign in');
      const switcher = h('button', { class: 'btn ghost', onclick: () => { mode = mode === 'in' ? 'up' : 'in'; draw(); } });
      const draw = () => {
        btn.textContent = mode === 'in' ? 'Sign in' : 'Create account';
        switcher.textContent = mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in';
        msg.textContent = '';
      };
      async function go() {
        msg.textContent = '';
        btn.disabled = true;
        try {
          const j = mode === 'in' ? await authCall('token?grant_type=password', { email: email.value.trim(), password: pw.value }) : await authCall('signup', { email: email.value.trim(), password: pw.value });
          if (!j.access_token) throw new Error('Account created. Confirm your email address, then sign in.');
          store.set('lastEmail', email.value.trim());
          saveSession(j);
          await renderHome();
        } catch (e) {
          msg.textContent = e.message;
        } finally {
          btn.disabled = false;
        }
      }
      pw.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      draw();
      put(shell, h('div', { class: 'dash-center' }, h('div', { class: 'card dash-auth' },
        h('div', { class: 'row' }, h('div', { class: 'logo' }, 'D'), h('div', {}, h('h1', {}, 'Owner dashboard'), h('div', { class: 'muted small' }, 'Daalpha Systems — your shops, live'))),
        h('div', { class: 'field' }, 'Email', email), h('div', { class: 'field' }, 'Password', h('div', { class: 'dash-pw' }, pw, eye)), msg, btn, switcher,
        onExit ? h('button', { class: 'btn ghost', onclick: onExit }, '← Back to the till') : null)));
    }

    // ---------- shops ----------
    async function renderHome() {
      put(shell, topbar('My shops', auth && auth.email, null, h('button', { class: 'btn sm', onclick: signOut }, 'Sign out')), h('div', { class: 'dash-body' }, h('div', { class: 'empty' }, 'Loading…')));
      let me;
      try {
        me = S.me = await rpc('dash_me', { p_today: today() });
      } catch (e) {
        if (!auth) return;
        put(shell.lastChild, h('div', { class: 'notice' }, e.message), h('button', { class: 'btn', onclick: renderHome }, 'Try again'));
        return;
      }
      const body = h('div', { class: 'dash-body' });
      const bar = topbar(me.is_admin ? 'All shops' : 'My shops', (me.email || '') + (me.is_admin ? ' · Daalpha Systems admin' : ''), onExit ? h('button', { class: 'btn sm ghost-light', onclick: onExit }, '←') : null,
        h('div', { class: 'row', style: 'gap:6px;flex-wrap:nowrap' }, h('button', { class: 'btn sm', onclick: renderHome }, '↻'), h('button', { class: 'btn sm', onclick: signOut }, 'Sign out')));
      put(shell, bar, body);
      put(body,
        !me.admin_exists ? h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:8px' }, h('b', {}, 'First-time setup'), h('div', { class: 'muted small' }, 'If you are Daalpha Systems, make this account the admin. The admin can see every customer’s shop for support. Only the first account can do this.'), h('div', {}, h('button', { class: 'btn primary', onclick: async () => { if (await tryRpc('claim_admin')) { toast('You are now the Daalpha Systems admin.'); renderHome(); } } }, 'Make me the Daalpha Systems admin'))) : null,
        h('div', { class: 'row', style: 'gap:8px' }, me.is_admin ? h('button', { class: 'btn primary', onclick: addShop }, '+ Add a shop') : null, h('button', { class: me.is_admin ? 'btn' : 'btn primary', onclick: joinShop }, 'I have an owner code'), me.is_admin ? h('button', { class: 'btn', onclick: recoveryAnswer }, '🔑 Unlock codes') : null),
        me.shops.length
          ? me.shops.map((s) => {
              const stale = !s.last_seen || Date.now() - new Date(s.last_seen).getTime() > 864e5;
              return h('button', { class: 'card dash-shop', onclick: () => openShop(s) },
                h('div', { class: 'row', style: 'flex-wrap:nowrap' }, h('div', { style: 'min-width:0' }, h('b', { class: 'dash-shop-name' }, s.name), h('div', { class: 'muted small' }, TYPES[s.business_type] || s.business_type, me.is_admin && s.owners ? ' · ' + s.owners : '')), h('span', { class: 'spacer' }), h('span', { class: 'dash-arrow' }, '›')),
                h('div', { class: 'dash-shop-stats' },
                  h('div', {}, h('span', { class: 'k' }, 'Today'), h('b', {}, money(s.today_total, s.currency))),
                  h('div', {}, h('span', { class: 'k' }, 'Sales'), h('b', {}, s.today_count)),
                  h('div', {}, h('span', { class: 'k' }, 'Till last seen'), h('b', { class: s.tills ? (stale ? 'warn-text' : '') : 'muted' }, s.tills ? ago(s.last_seen) : 'not linked'))));
            })
          : h('div', { class: 'empty' }, me.is_admin ? 'No shops yet. Add a shop, then type its till code into the POS (Settings → Online dashboard).' : 'No shops yet. Daalpha Systems gives you an owner code for your shop: tap “I have an owner code” and type it in.'));
    }

    // Daalpha Systems admin: answer codes for a customer's POS ("Forgot the owner password?" or "+ Add business").
    function recoveryAnswer() {
      const code = h('input', { class: 'input recovery-answer', placeholder: 'XXXX-XXXX', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false });
      const kind = h('select', { class: 'input' }, h('option', { value: 'addshop' }, 'Add a business on their POS'), h('option', { value: 'recovery' }, 'Reset their owner password'));
      const out = h('div');
      const go = async () => {
        const r = await tryRpc('dash_unlock_answer', { p_code: code.value, p_kind: kind.value });
        if (!r) return;
        const what = kind.value === 'addshop' ? 'They type it under “Answer code from Daalpha Systems” to add one business.' : 'They type it in, then choose a new owner password. It unlocks the whole POS, so check who is calling first.';
        put(out, h('div', { class: 'dash-code' }, h('div', { class: 'muted small' }, `Answer for ${r.code}`), h('div', { class: 'dash-code-val' }, r.answer), h('div', { class: 'muted small' }, what)));
      };
      code.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      kind.addEventListener('change', () => put(out));
      modal('Unlock codes', [
        h('div', { class: 'muted small' }, 'The customer reads you the code their POS shows.'),
        field('What for', kind), field('Code from the customer', code), out,
      ], (close) => [h('button', { class: 'btn', onclick: close }, 'Close'), h('button', { class: 'btn primary', onclick: go }, 'Get answer code')]);
      setTimeout(() => code.focus(), 50);
    }

    function codeBox(c, title, how) {
      return h('div', { class: 'dash-code' },
        h('div', { class: 'muted small' }, title),
        h('div', { class: 'dash-code-val' }, c.code),
        h('div', { class: 'row', style: 'gap:6px' }, h('button', { class: 'btn sm', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(c.code); toast('Copied.'); } }, 'Copy'), navigator.share ? h('button', { class: 'btn sm', onclick: () => navigator.share({ text: `${title}: ${c.code}` }).catch(() => {}) }, 'Share') : null),
        h('div', { class: 'muted small' }, how, ` Works once, until ${time(c.expires_at).slice(0, 10)}.`));
    }

    function addShop() {
      const name = h('input', { class: 'input', placeholder: 'e.g. Daalpha Pharmacy' });
      const type = h('select', { class: 'input' }, Object.entries(TYPES).map(([k, v]) => h('option', { value: k }, v)));
      modal('Add a shop', [field('Shop name', name), field('Type', type)], (close) => [
        h('button', { class: 'btn', onclick: close }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: async () => {
          const r = await tryRpc('dash_create_shop', { p_name: name.value, p_type: type.value });
          if (!r) return;
          close();
          modal('Shop added', [
            h('div', {}, h('b', {}, name.value), ' is ready.'),
            codeBox(r.till, 'Till code', 'On the POS for this shop: Settings → Online dashboard → type this code → Link.'),
            codeBox(r.owner, 'Owner code', 'Give this to the shop owner if they should see the dashboard too: they create an account here and tap “I have an owner code”.'),
          ], (c2) => [h('button', { class: 'btn primary', onclick: () => { c2(); renderHome(); } }, 'Done')]);
        } }, 'Add shop'),
      ]);
      setTimeout(() => name.focus(), 50);
    }

    function joinShop() {
      const code = h('input', { class: 'input', placeholder: 'XXXX-XXXX-XXXX', style: 'text-transform:uppercase;letter-spacing:.08em' });
      modal('Owner code', [h('div', { class: 'muted small' }, 'Type the owner code you were given to see that shop.'), field('Owner code', code)], (close) => [
        h('button', { class: 'btn', onclick: close }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: async () => { const r = await tryRpc('dash_join', { p_code: code.value }); if (r) { close(); toast(`You can now see ${r.name}.`); renderHome(); } } }, 'Add'),
      ]);
    }

    // ---------- one shop ----------
    function setRange(key) {
      S.range = key;
      store.set('range', key);
      const map = { today: [today(), today()], yesterday: [daysAgo(1), daysAgo(1)], week: [daysAgo(6), today()], month: [daysAgo(29), today()] };
      if (map[key]) [S.from, S.to] = map[key];
    }

    function openShop(s) {
      S.shop = s;
      S.tab = isEdu(s) ? 'school' : 'summary';
      setRange(S.range === 'custom' ? 'today' : S.range);
      drawShop();
    }

    function drawShop() {
      const s = S.shop;
      const content = h('div', { class: 'dash-body' }, h('div', { class: 'empty' }, 'Loading…'));
      const tabs = [isEdu(s) ? ['school', s.business_type === 'college' ? 'College' : 'School'] : null, ['summary', isEdu(s) ? 'Shop sales' : 'Summary'], ['sales', 'Sales'], ['activity', 'Activity'], ['stock', 'Stock'], ['manage', 'Shop']].filter(Boolean);
      const ranges = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', '7 days'], ['month', '30 days']];
      put(shell,
        topbar(s.name, `Till last seen ${ago(s.last_seen)}`, h('button', { class: 'btn sm ghost-light', onclick: renderHome }, '←'), h('button', { class: 'btn sm', onclick: drawShop }, '↻')),
        h('div', { class: 'dash-tabs' }, tabs.map(([k, l]) => h('button', { class: 'dash-tab' + (S.tab === k ? ' on' : ''), onclick: () => { S.tab = k; drawShop(); } }, l))),
        S.tab !== 'stock' && S.tab !== 'manage' && S.tab !== 'school'
          ? h('div', { class: 'dash-ranges' }, ranges.map(([k, l]) => h('button', { class: 'chip' + (S.range === k ? ' on' : ''), onclick: () => { setRange(k); drawShop(); } }, l)),
              h('input', { class: 'input dash-date', type: 'date', value: S.from, onchange: (e) => { S.range = 'custom'; S.from = e.target.value; if (S.to < S.from) S.to = S.from; drawShop(); } }),
              h('input', { class: 'input dash-date', type: 'date', value: S.to, onchange: (e) => { S.range = 'custom'; S.to = e.target.value; if (S.to < S.from) S.from = S.to; drawShop(); } }))
          : null,
        content);
      ({ school: tabSchool, summary: tabSummary, sales: tabSales, activity: tabActivity, stock: tabStock, manage: tabManage })[S.tab](content);
    }

    const tile = (k, v, sub, cls) => h('div', { class: 'card stat ' + (cls || '') }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), sub ? h('div', { class: 'muted small' }, sub) : null);
    const bars = (rows, label, value, fmt) => {
      const max = Math.max(1, ...rows.map((r) => Number(r[value]) || 0));
      return h('div', { class: 'dash-bars' }, rows.map((r) => h('div', { class: 'dash-bar' }, h('span', { class: 'l' }, label(r)), h('span', { class: 'b' }, h('i', { style: `width:${Math.max(2, (100 * (Number(r[value]) || 0)) / max)}%` })), h('span', { class: 'v' }, fmt(r)))));
    };
    const section = (title, ...kids) => h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:10px' }, h('h3', {}, title), ...kids);

    async function tabSummary(el) {
      const o = await tryRpc('dash_overview', { p_shop: S.shop.id, p_from: S.from, p_to: S.to });
      if (!o) return put(el, h('div', { class: 'empty' }, 'Could not load.'));
      const cur = o.shop.currency;
      S.shop.last_seen = o.shop.last_seen;
      put(el,
        h('div', { class: 'stats' },
          tile('Sales', money(o.totals.net, cur), `${o.totals.count} sale(s)`),
          tile('Average sale', money(o.totals.count ? o.totals.net / o.totals.count : 0, cur)),
          tile('Voided', money(o.voids.amount, cur), `${o.voids.count} sale(s)`, o.voids.count ? 'warn' : ''),
          tile('Discounts', money(o.totals.discount, cur), null, Number(o.totals.discount) ? 'warn' : ''),
          h('button', { class: 'card stat ' + (o.watch ? 'warn' : ''), onclick: () => { S.tab = 'activity'; S.actWatch = true; drawShop(); } }, h('div', { class: 'k' }, 'Worth checking'), h('div', { class: 'v' }, o.watch), h('div', { class: 'muted small' }, 'voids, discounts, price changes… ›')),
          h('button', { class: 'card stat ' + (o.low_stock ? 'warn' : ''), onclick: () => { S.tab = 'stock'; drawShop(); } }, h('div', { class: 'k' }, 'Low stock'), h('div', { class: 'v' }, o.low_stock), h('div', { class: 'muted small' }, 'items ›'))),
        o.by_method.length ? section('Payments', bars(o.by_method, (r) => METHODS[r.method] || r.method, 'amount', (r) => money(r.amount))) : null,
        o.by_cashier.length ? section('By cashier', bars(o.by_cashier, (r) => r.name, 'amount', (r) => `${money(r.amount)} · ${r.count}`)) : null,
        o.by_staff.length ? section('By stylist', bars(o.by_staff, (r) => r.name, 'amount', (r) => `${money(r.amount)} · ${r.services}`)) : null,
        o.top_products.length ? section('Top products', bars(o.top_products, (r) => r.name, 'amount', (r) => `${money(r.amount)} · ${qty(r.qty)}`)) : null,
        o.by_day.length > 1 ? section('By day', bars(o.by_day, (r) => String(r.day).slice(5), 'amount', (r) => money(r.amount))) : o.by_hour.length ? section('By hour', bars(o.by_hour, (r) => `${String(r.hour).padStart(2, '0')}:00`, 'amount', (r) => money(r.amount))) : null,
        !o.totals.count && !o.voids.count ? h('div', { class: 'empty' }, S.shop.last_seen ? 'No sales in this period.' : 'No data yet. Link the till: on the POS go to Settings → Online dashboard and type the till code (Shop tab here).') : null);
    }

    // Schools: the latest summary the till sent (attendance today, fees, last 7 days, exam averages).
    async function tabSchool(el) {
      const r = await tryRpc('dash_school', { p_shop: S.shop.id });
      if (r === undefined) return put(el, h('div', { class: 'empty' }, 'Could not load.'));
      if (!r) return put(el, h('div', { class: 'empty' }, 'No school data yet. It appears after the school’s POS (version 1.12 or newer) is linked and online.'));
      const d = r.data;
      const cur = S.shop.currency;
      const a = d.attendance;
      const f = d.fees;
      const pct = f.term_billed ? Math.round((f.term_collected / f.term_billed) * 100) : 0;
      put(el,
        h('div', { class: 'muted small' }, `Updated ${ago(r.updated_at)} from ${r.device || 'the till'} · ${d.term} · ${d.pupils} ${S.shop && S.shop.business_type === 'college' ? 'students' : 'pupils'} in ${d.classes} classes`),
        h('div', { class: 'stats' },
          tile('Present today', String(a.present), `${a.absent} absent${a.late ? ` · ${a.late} late` : ''}`),
          tile('Registers marked', `${a.marked}/${d.classes}`, a.not_marked.length ? 'not yet: ' + a.not_marked.slice(0, 4).join(', ') + (a.not_marked.length > 4 ? '…' : '') : 'all classes', a.not_marked.length ? 'warn' : ''),
          tile('Fees today', money(f.today, cur), `${f.today_count} payment(s)`),
          tile('Fees this term', money(f.term_collected, cur), f.term_billed ? `${pct}% of ${money(f.term_billed, cur)}` : ''),
          tile('Owed', money(f.owed, cur), `${f.owing} ${S.shop && S.shop.business_type === 'college' ? 'student' : 'pupil'}(s)`, f.owed > 0 ? 'warn' : '')),
        section('Fees collected, last 7 days', bars(d.days, (x) => x.date.slice(5), 'fees', (x) => `${money(x.fees)} · ${x.payments}`)),
        section('Attendance, last 7 days', bars(d.days, (x) => x.date.slice(5), 'present', (x) => (x.present || x.absent ? `${x.present} present · ${x.absent} absent` : '—'))),
        d.exams.filter((e) => e.classes.length).map((e) => section(`${e.name} — class averages${e.locked ? ' (final)' : ''}`, bars(e.classes, (x) => x.class, 'mean', (x) => `${x.mean}% · ${x.with_marks}/${x.pupils}`))),
        h('div', { class: 'muted small' }, 'Fee payments, registers and marks entered also show under Activity.'));
    }

    async function tabSales(el) {
      const rows = await tryRpc('dash_sales', { p_shop: S.shop.id, p_from: S.from, p_to: S.to });
      if (!rows) return;
      if (!rows.length) return put(el, h('div', { class: 'empty' }, 'No sales in this period.'));
      put(el, h('div', { class: 'card' }, rows.map((r) => {
        const detail = h('div', { class: 'dash-sale-detail', hidden: true },
          r.items.map((i) => h('div', { class: 'row' }, h('span', {}, `${qty(i.qty)} × ${i.name}`, i.staff_name ? h('span', { class: 'muted small' }, ` · ${i.staff_name}`) : null), h('span', { class: 'spacer' }), h('span', {}, money(i.total)))),
          h('hr'),
          Number(r.discount) ? h('div', { class: 'row' }, h('span', {}, 'Discount'), h('span', { class: 'spacer' }), h('span', {}, '−' + money(r.discount))) : null,
          r.payments.filter((p) => p.amount > 0).map((p) => h('div', { class: 'row muted' }, h('span', {}, METHODS[p.method] || p.method, p.reference ? ' ' + p.reference : ''), h('span', { class: 'spacer' }), h('span', {}, money(p.amount)))),
          Number(r.change_due) ? h('div', { class: 'row muted' }, h('span', {}, 'Change'), h('span', { class: 'spacer' }), h('span', {}, money(r.change_due))) : null,
          r.customer ? h('div', { class: 'muted small' }, 'Customer: ' + r.customer) : null,
          r.status === 'void' ? h('div', { class: 'notice' }, 'Voided: ' + (r.void_reason || '')) : null);
        return h('div', { class: 'dash-sale', onclick: () => (detail.hidden = !detail.hidden) },
          h('div', { class: 'row', style: 'flex-wrap:nowrap' },
            h('div', { style: 'min-width:0' }, h('b', {}, r.receipt_no), r.status === 'void' ? h('span', { class: 'badge red', style: 'margin-left:6px' }, 'Void') : null, h('div', { class: 'muted small' }, `${time(r.completed_at).slice(11)} · ${r.cashier || '—'}${r.table_name ? ' · ' + r.table_name : ''}`)),
            h('span', { class: 'spacer' }),
            h('b', { style: r.status === 'void' ? 'text-decoration:line-through;color:var(--muted)' : '' }, money(r.total))),
          detail);
      })));
    }

    async function tabActivity(el) {
      const rows = await tryRpc('dash_activity', { p_shop: S.shop.id, p_from: S.from, p_to: S.to, p_user: S.actUser || null, p_only_watch: S.actWatch });
      if (!rows) return;
      const people = [...new Set(rows.map((r) => r.user_name).filter(Boolean))].sort();
      if (S.actUser && !people.includes(S.actUser)) people.unshift(S.actUser);
      put(el,
        h('div', { class: 'row', style: 'gap:8px' },
          h('select', { class: 'input', style: 'max-width:220px', onchange: (e) => { S.actUser = e.target.value; drawShop(); } }, h('option', { value: '' }, 'Everyone'), people.map((p) => h('option', { value: p, selected: p === S.actUser }, p))),
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: S.actWatch, onchange: (e) => { S.actWatch = e.target.checked; drawShop(); } }), 'Only things worth checking')),
        rows.length
          ? h('div', { class: 'card' }, rows.map((r) => h('div', { class: 'dash-act' + (['sale', 'sign_in', 'sign_out'].includes(r.action) ? '' : ' watch') },
              h('div', { class: 'dash-act-ico' }, (ACTS[r.action] || ['•'])[0]),
              h('div', { style: 'min-width:0' }, h('div', {}, r.summary), h('div', { class: 'muted small' }, `${time(r.at).slice(5)} · ${r.user_name || '—'}${r.role ? ' (' + roleName(r.role) + ')' : ''}`)))))
          : h('div', { class: 'empty' }, 'Nothing in this period.'));
    }

    async function tabStock(el) {
      const rows = await tryRpc('dash_stock', { p_shop: S.shop.id });
      if (!rows) return;
      const q = h('input', { class: 'input', placeholder: 'Search products' });
      const list = h('div', { class: 'card' });
      const draw = () => {
        const f = q.value.trim().toLowerCase();
        const shown = rows.filter((r) => !f || r.name.toLowerCase().includes(f));
        put(list, shown.length ? shown.map((r) => h('div', { class: 'dash-sale' }, h('div', { class: 'row', style: 'flex-wrap:nowrap' },
          h('div', { style: 'min-width:0' }, h('b', {}, r.name), h('div', { class: 'muted small' }, [r.category, money(r.price), r.next_expiry ? 'expires ' + r.next_expiry : null].filter(Boolean).join(' · '))),
          h('span', { class: 'spacer' }),
          r.track_stock ? h('span', { class: 'badge ' + (r.low ? (Number(r.stock) <= 0 ? 'red' : 'warn') : 'green') }, `${qty(r.stock)} ${r.unit || ''}`) : h('span', { class: 'muted small' }, 'not counted')))) : h('div', { class: 'empty' }, rows.length ? 'No match.' : 'No products received from the till yet.'));
      };
      q.addEventListener('input', draw);
      put(el, h('div', { class: 'muted small' }, `${rows.filter((r) => r.low).length} item(s) at or below their reorder level. Updated from the till whenever it has internet.`), q, list);
      draw();
    }

    async function tabManage(el) {
      const r = await tryRpc('dash_shop', { p_shop: S.shop.id });
      if (!r) return;
      const newCode = async (kind) => {
        const c = await tryRpc('dash_new_code', { p_shop: S.shop.id, p_kind: kind });
        if (!c) return;
        modal(kind === 'till' ? 'Till code' : 'Owner code', [
          codeBox(c, kind === 'till' ? 'Till code' : 'Owner code', kind === 'till' ? 'On the POS: Settings → Online dashboard → type this code → Link. Use it for a new or replacement phone/PC.' : 'Give this to a person who should see this shop: they create an account here and tap “I have an owner code”.'),
        ], (close) => [h('button', { class: 'btn primary', onclick: () => { close(); drawShop(); } }, 'Done')]);
      };
      put(el,
        section('Tills sending to this shop',
          r.tills.filter((t) => !t.revoked).length
            ? r.tills.filter((t) => !t.revoked).map((t) => h('div', { class: 'row', style: 'flex-wrap:nowrap' }, h('div', {}, h('b', {}, t.device_name || 'Till'), h('div', { class: 'muted small' }, `Version ${t.app_version || '?'} · last seen ${ago(t.last_seen)}`)), h('span', { class: 'spacer' }),
                h('button', { class: 'btn sm danger', onclick: async () => { if (confirm('Unlink this till? It stops sending until it is linked again with a new till code. Use this if a phone is lost or replaced.')) { await tryRpc('dash_unlink_till', { p_shop: S.shop.id, p_device: t.id }); drawShop(); } } }, 'Unlink')))
            : h('div', { class: 'muted' }, 'No till linked yet.'),
          h('div', {}, h('button', { class: 'btn', onclick: () => newCode('till') }, 'New till code'))),
        section('People who can see this shop',
          r.owners.map((o) => h('div', {}, o.email, o.me ? h('span', { class: 'muted small' }, ' (you)') : null)),
          h('div', {}, h('button', { class: 'btn', onclick: () => newCode('owner') }, 'New owner code'))),
        section('Shop',
          h('div', { class: 'row wrap' },
            h('button', { class: 'btn', onclick: async () => { const n = prompt('Shop name', S.shop.name); if (n && (await tryRpc('dash_rename_shop', { p_shop: S.shop.id, p_name: n }))) { S.shop.name = n; drawShop(); } } }, 'Rename'),
            h('button', { class: 'btn', onclick: async () => { if (confirm('Stop seeing this shop on your dashboard?')) { await tryRpc('dash_leave_shop', { p_shop: S.shop.id }); renderHome(); } } }, 'Remove from my dashboard'),
            S.me && S.me.is_admin ? h('button', { class: 'btn danger', onclick: async () => { if (prompt('Type DELETE to remove this shop and all its online data.') === 'DELETE' && (await tryRpc('dash_delete_shop', { p_shop: S.shop.id }))) renderHome(); } }, 'Delete shop (admin)') : null)));
    }

    if (auth) renderHome();
    else renderAuth();
  }

  window.OwnerDashboard = { mount };
})();
