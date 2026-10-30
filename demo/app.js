'use strict';
/* Daalpha Systems – screen code. Talks to the main process only through window.pos. */

// ================= helpers =================
const S = {
  status: null,
  session: null,
  user: null,
  tenant: null,
  feats: {},
  page: 'pos',
  products: [],
  categories: [],
  catFilter: null,
  cart: null,
  dash: null,
};
const RANK = { cashier: 1, manager: 2, admin: 3, owner: 4 };
// true when running as the Android app (window.pos comes from mobile/bridge.js instead of Electron)
const isPhone = () => !!(window.pos && window.pos.platform && window.pos.platform !== 'desktop');
const can = (role) => S.user && RANK[S.user.role] >= RANK[role];
// staff marked as not handling money (e.g. teachers) don't see selling or payment buttons
// Role names: the same four access levels, named for the kind of business.
const ROLE_NAMES = {
  shop: { cashier: 'Cashier', manager: 'Manager', admin: 'Admin', owner: 'System owner' },
  school: { cashier: 'Teacher / staff', manager: 'Deputy / manager', admin: 'Head teacher / admin', owner: 'System owner' },
};
const isSchool = () => !!(S.feats && S.feats.school);
// Colleges use the school screens with college words: students, trainers, courses, units, results slips.
const isCollege = () => !!(S.tenant && S.tenant.business_type === 'college');
const COLLEGE_WORDS = [
  ['Head teachers', 'Principals'], ['head teachers', 'principals'], ['Head teacher', 'Principal'], ['head teacher', 'principal'], ['HEAD TEACHER', 'PRINCIPAL'],
  ['Teachers', 'Trainers'], ['teachers', 'trainers'], ['Teacher', 'Trainer'], ['teacher', 'trainer'], ['TEACHER', 'TRAINER'],
  ['Pupils', 'Students'], ['pupils', 'students'], ['Pupil', 'Student'], ['pupil', 'student'], ['PUPILS', 'STUDENTS'], ['PUPIL', 'STUDENT'],
  ['Guardians', 'Sponsors'], ['guardians', 'sponsors'], ['Guardian', 'Sponsor'], ['guardian', 'sponsor'],
  ['Parents', 'Sponsors'], ['parents', 'sponsors'], ['Parent', 'Sponsor'], ['parent', 'sponsor'], ['PARENT', 'SPONSOR'],
  ['Admission no', 'Reg no'], ['admission no', 'reg no'], ['Admission number', 'Registration number'], ['admission number', 'registration number'], ['Adm no', 'Reg no'], ['adm no', 'reg no'], ['ADM NO', 'REG NO'], ['Adm. no', 'Reg no'],
  ['Report cards', 'Results slips'], ['report cards', 'results slips'], ['Report card', 'Results slip'], ['report card', 'results slip'], ['REPORT CARD', 'RESULTS SLIP'],
  ['Grades', 'Courses'], ['grades', 'courses'], ['Grade', 'Course'], ['grade', 'course'], ['GRADE', 'COURSE'],
  ['Subjects', 'Units'], ['subjects', 'units'], ['Subject', 'Unit'], ['subject', 'unit'], ['SUBJECT', 'UNIT'],
  ['Streams', 'Intakes'], ['streams', 'intakes'], ['Stream', 'Intake'], ['stream', 'intake'],
  ['Schools', 'Colleges'], ['schools', 'colleges'], ['School', 'College'], ['school', 'college'], ['SCHOOL', 'COLLEGE'],
  ["LEARNER'S REPORT", 'RESULTS SLIP'], ['Learning areas', 'Units'], ['Learning area', 'Unit'], ['Learners', 'Students'], ['learners', 'students'], ['Learner', 'Student'], ['learner', 'student'],
  ['Admitted', 'Registered'], ['admitted', 'registered'], ['Admit', 'Register'], ['admit', 'register'],
].map(([a, b]) => [new RegExp('(^|[^A-Za-z])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z])', 'g'), b]);
const W = (text) => {
  if (!isCollege() || typeof text !== 'string') return text;
  let t = text.replace(/\bCBC\s+/g, '').replace(/curriculum \(CBC\)/g, 'courses offered');
  for (const [re, b] of COLLEGE_WORDS) t = t.replace(re, (m, pre) => pre + b);
  return t;
};
const roleLabel = (r) => (isSchool() ? ROLE_NAMES.school : ROLE_NAMES.shop)[r] || r;
const canMoney = () => !(S.user && S.user.role === 'cashier' && S.user.money === 0);
const $ = (sel, root = document) => root.querySelector(sel);
const prefs = {
  get(k, d) {
    try {
      const v = localStorage.getItem('pos.' + k);
      return v === null ? d : JSON.parse(v);
    } catch (_) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('pos.' + k, JSON.stringify(v));
    } catch (_) {}
  },
};

async function api(method, args) {
  const r = await window.pos.call(method, args);
  if (!r.ok) throw new Error(r.error);
  return r.data;
}
async function tryApi(method, args) {
  try {
    return await api(method, args);
  } catch (e) {
    toast(e.message, true);
    return undefined;
  }
}

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if ((k === 'placeholder' || k === 'title') && typeof v === 'string') el[k] = W(v);
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    add(el, kid instanceof Node ? kid : document.createTextNode(W(String(kid))));
  }
  return el;
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
function money(n, withCur = false) {
  const s = r2(n).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withCur && S.tenant ? `${S.tenant.currency} ${s}` : s;
}
const qtyFmt = (n) => (Number.isInteger(+n) ? String(+n) : r2(n).toString());
const todayStr = () => new Date().toLocaleDateString('en-CA');
const fmtDate = (s) => (s ? s.replace('T', ' ').slice(0, 16) : '');

function toast(msg, err = false) {
  const t = h('div', { class: 'toast' + (err ? ' err' : '') }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), err ? 5000 : 2600);
}

function modal({ title, body, foot, wide, onClose }) {
  const root = $('#modal-root');
  const box = h('div', { class: 'modal' + (wide ? ' wide' : '') });
  const ov = h('div', { class: 'overlay' }, box);
  const close = () => {
    ov.remove();
    document.removeEventListener('keydown', onKey, true);
    onClose && onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && root.lastElementChild === ov) {
      e.stopPropagation();
      close();
    }
  };
  document.addEventListener('keydown', onKey, true);
  add(box, 
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('div', { class: 'spacer' }), h('button', { class: 'btn ghost sm', onclick: close }, '✕')),
    h('div', { class: 'modal-body' }, typeof body === 'function' ? body(close) : body),
    foot ? h('div', { class: 'modal-foot' }, typeof foot === 'function' ? foot(close) : foot) : null
  );
  ov.addEventListener('mousedown', (e) => {
    if (e.target === ov) close();
  });
  add(root, ov);
  setTimeout(() => {
    const f = box.querySelector('[autofocus]') || box.querySelector('.modal-body input:not([type=checkbox]), .modal-body select');
    f && f.focus();
  }, 30);
  return { close, el: box };
}

function confirmBox(title, message, okLabel = 'Yes', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: h('div', {}, message),
      foot: (close) => [
        h('button', { class: 'btn', onclick: close }, 'Cancel'),
        h('button', { class: 'btn ' + (danger ? 'danger solid' : 'primary'), autofocus: true, onclick: () => { done = true; resolve(true); close(); } }, okLabel),
      ],
      onClose: () => !done && resolve(false),
    });
    return m;
  });
}

function promptBox(title, label, value = '') {
  return new Promise((resolve) => {
    let done = false;
    const inp = h('input', { class: 'input', value, autofocus: true });
    const finish = (close) => {
      done = true;
      resolve(inp.value.trim());
      close();
    };
    modal({
      title,
      body: (close) => {
        inp.addEventListener('keydown', (e) => e.key === 'Enter' && finish(close));
        return h('label', { class: 'field' }, label, inp);
      },
      foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => finish(close) }, 'OK')],
      onClose: () => !done && resolve(null),
    });
  });
}

// Read named inputs inside a container into an object.
function formData(root) {
  const o = {};
  root.querySelectorAll('[name]').forEach((el) => {
    o[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return o;
}
const field = (label, input) => h('label', { class: 'field' }, label, input);
const inp = (name, value = '', attrs = {}) => h('input', { class: 'input', name, value: value ?? '', ...attrs });
const chk = (name, label, checked) => h('label', { class: 'check' }, h('input', { type: 'checkbox', name, checked: !!checked }), label);
const sel = (name, options, value) =>
  h('select', { class: 'input', name }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(value ?? '') }, l)));

function toCsv(rows, cols) {
  const q = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.map((c) => q(c[1])).join(','), ...rows.map((r) => cols.map((c) => q(typeof c[0] === 'function' ? c[0](r) : r[c[0]])).join(','))].join('\n');
}
async function saveCsv(name, rows, cols) {
  const r = await window.pos.exportCsv(name, toCsv(rows, cols));
  if (!r.ok) toast(r.error, true);
  else if (r.data) toast('Saved ' + r.data);
}

// ================= printing =================
// M-Pesa details for printouts (Settings → Business). account: e.g. a pupil's admission number when none is set.
function mpesaHtml(t, account, sep = '<br>') {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const out = [];
  if (t && t.mpesa_till) out.push(`<b>M-Pesa Till: ${esc(t.mpesa_till)}</b>`);
  if (t && t.mpesa_paybill) { const acc = account || t.mpesa_account; out.push(`<b>M-Pesa Paybill: ${esc(t.mpesa_paybill)}${acc ? ' · Acc: ' + esc(acc) : ''}</b>`); }
  return out.map((x) => sep + x).join('');
}
function receiptHtml(sale, { copy = false } = {}) {
  const t = S.tenant;
  const w = paperWidth();
  const methodName = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', account: 'On account' };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rows = sale.items
    .map((i) => (Number(i.qty) === 1 ? `<tr><td colspan="2">${esc(i.name)}</td><td class="r">${money(i.total)}</td></tr>` : `<tr><td colspan="3">${esc(i.name)}</td></tr><tr><td>&nbsp; ${qtyFmt(i.qty)} x ${money(i.price)}</td><td></td><td class="r">${money(i.total)}</td></tr>`) + (i.staff_name ? `<tr><td colspan="3">&nbsp; by ${esc(i.staff_name)}</td></tr>` : ''))
    .join('');
  const pays = sale.payments
    .filter((p) => p.amount > 0)
    .map((p) => `<tr><td>${methodName[p.method] || p.method}${p.reference ? ' (' + esc(p.reference) + ')' : ''}</td><td></td><td class="r">${money(p.amount)}</td></tr>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${w}mm auto; margin: 0 }
    body { width: ${w - 6}mm; margin: 2mm 3mm; font: 11px/1.35 Consolas, 'DejaVu Sans Mono', monospace; color: #000 }
    h1 { font-size: 14px; text-align: center; margin: 0 0 2px } .c { text-align: center } .r { text-align: right }
    table { width: 100%; border-collapse: collapse } td { padding: 0; vertical-align: top }
    hr { border: 0; border-top: 1px dashed #000; margin: 5px 0 } .b { font-weight: bold; font-size: 13px }
  </style></head><body>
    ${t.logo ? `<img src="${t.logo}" alt="" style="display:block;margin:0 auto 3px;max-width:26mm;max-height:20mm;object-fit:contain">` : ''}<h1>${esc(t.name)}</h1>${t.motto ? `<div style="text-align:center;font-style:italic;font-size:10px">${esc(t.motto)}</div>` : ''}
    <div class="c">${esc(t.address)}${t.phone ? '<br>Tel: ' + esc(t.phone) : ''}${t.kra_pin ? '<br>PIN: ' + esc(t.kra_pin) : ''}${mpesaHtml(t)}</div>
    <hr>
    <div>Receipt: ${esc(sale.receipt_no)}${copy ? ' (COPY)' : ''}</div>
    <div>Date: ${esc(fmtDate(sale.completed_at))}</div>
    <div>Served by: ${esc(sale.cashier)}</div>
    ${sale.table_name ? `<div>Table: ${esc(sale.table_name)}</div>` : ''}
    ${sale.customer_name ? `<div>Customer: ${esc(sale.customer_name)}${sale.account_no ? ' [' + esc(sale.account_no) + ']' : ''}</div>` : ''}
    ${sale.status === 'void' ? '<div class="c b">*** VOIDED ***</div>' : ''}
    <hr><table>${rows}</table><hr>
    <table>
      ${sale.discount > 0 ? `<tr><td>Subtotal</td><td></td><td class="r">${money(sale.subtotal)}</td></tr>` : ''}
      ${sale.discount > 0 ? `<tr><td>Discount</td><td></td><td class="r">-${money(sale.discount)}</td></tr>` : ''}
      <tr class="b"><td>TOTAL ${esc(t.currency)}</td><td></td><td class="r">${money(sale.total)}</td></tr>
      <tr><td>Incl. VAT</td><td></td><td class="r">${money(sale.tax)}</td></tr>
    </table><hr>
    <table>${pays}${sale.change_due > 0 ? `<tr><td>Change</td><td></td><td class="r">${money(sale.change_due)}</td></tr>` : ''}</table>
    ${sale.customer_id && sale.customer_balance !== undefined ? `<hr><div>Account balance: ${sale.customer_balance > 0 ? money(sale.customer_balance) + ' owed' : money(-sale.customer_balance) + ' credit'}</div>` : ''}
    <hr><div class="c">${esc(t.receipt_footer)}</div><br>
  </body></html>`;
}

function billHtml(sale) {
  const t = S.tenant;
  const w = paperWidth();
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const rows = sale.items
    .map((i) => (Number(i.qty) === 1 ? `<tr><td colspan="2">${esc(i.name)}</td><td class="r">${money(i.total)}</td></tr>` : `<tr><td colspan="3">${esc(i.name)}</td></tr><tr><td>&nbsp; ${qtyFmt(i.qty)} x ${money(i.price)}</td><td></td><td class="r">${money(i.total)}</td></tr>`))
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${w}mm auto; margin: 0 }
    body { width: ${w - 6}mm; margin: 2mm 3mm; font: 11px/1.35 Consolas, 'DejaVu Sans Mono', monospace; color: #000 }
    h1 { font-size: 14px; text-align: center; margin: 0 0 2px } h2 { font-size: 18px; text-align: center; margin: 4px 0 } .c { text-align: center } .r { text-align: right }
    table { width: 100%; border-collapse: collapse } td { padding: 0; vertical-align: top }
    hr { border: 0; border-top: 1px dashed #000; margin: 5px 0 } .b { font-weight: bold; font-size: 13px }
  </style></head><body>
    ${t.logo ? `<img src="${t.logo}" alt="" style="display:block;margin:0 auto 3px;max-width:26mm;max-height:20mm;object-fit:contain">` : ''}<h1>${esc(t.name)}</h1>${t.motto ? `<div style="text-align:center;font-style:italic;font-size:10px">${esc(t.motto)}</div>` : ''}
    <div class="c">${esc(t.address)}${t.phone ? '<br>Tel: ' + esc(t.phone) : ''}</div>
    <h2>BILL</h2>
    <div>${esc(sale.table_name || sale.order_label || 'Order #' + sale.id)}</div>
    <div>Date: ${esc(sale.printed_at)}</div>
    <div>Served by: ${esc(sale.cashier)}</div>
    ${sale.customer_name ? `<div>Customer: ${esc(sale.customer_name)}</div>` : ''}
    <hr><table>${rows}</table><hr>
    <table>
      <tr class="b"><td>TOTAL ${esc(t.currency)}</td><td></td><td class="r">${money(sale.total)}</td></tr>
      ${sale.tax > 0 ? `<tr><td>Incl. VAT</td><td></td><td class="r">${money(sale.tax)}</td></tr>` : ''}
    </table><hr>
    ${mpesaHtml(t) ? `<div class="c b">PAY WITH M-PESA${mpesaHtml(t).replace(/M-Pesa /g, '')}</div><hr>` : ''}
    <div class="c b">NOT PAID — THIS IS NOT A RECEIPT</div>
    <div class="c">Your receipt is printed after payment.</div><br>
  </body></html>`;
}

function kitchenHtml(tk) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const w = paperWidth();
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${w}mm auto; margin: 0 } body { width: ${w - 6}mm; margin: 2mm 3mm; font: 14px/1.4 Consolas, monospace }
    h1 { font-size: 18px; margin: 0 } .n { font-size: 12px } hr { border: 0; border-top: 1px dashed #000 }
  </style></head><body>
    <h1>KITCHEN – ${esc(tk.table || tk.label || 'Order #' + tk.id)}</h1><div>${esc(tk.time)}</div><hr>
    ${tk.lines.map((l) => `<div><b>${qtyFmt(l.qty)} x ${esc(l.name)}</b>${l.note ? `<div class="n">  » ${esc(l.note)}</div>` : ''}</div>`).join('')}
    <hr><br></body></html>`;
}

async function printHtml(html) {
  html = W(html);
  const r = await window.pos.print({ html, silent: prefs.get('silentPrint', false), widthMm: paperWidth(), deviceName: prefs.get('printerName', '') });
  if (!r.ok) toast(r.error, true);
  return r.ok;
}

// One entry point for every printout. Bluetooth/serial thermal printers get ESC/POS bytes;
// Windows printers get the HTML layout.
const printerMode = () => (isPhone() ? 'escpos' : prefs.get('printerMode', 'system'));
const paperWidth = () => prefs.get('receiptWidth', printerMode() === 'escpos' ? 58 : 80);
async function printJob(kind, data = {}) {
  const width = paperWidth();
  if (printerMode() === 'escpos') {
    const port = kind === 'kitchen' && prefs.get('kitchenPort', '') ? prefs.get('kitchenPort', '') : prefs.get('printerPort', '');
    if (!port) {
      toast('No Bluetooth printer chosen. Set it in Settings → Receipts & printing.', true);
      return false;
    }
    const r = await window.pos.printEscpos({ port, width, kind, data: { ...data, tenant: S.tenant, user: S.user && S.user.name, openDrawer: prefs.get('openDrawer', false) } });
    if (!r.ok) toast(r.error, true);
    return r.ok;
  }
  const html = {
    receipt: () => receiptHtml(data.sale, { copy: data.copy }),
    bill: () => billHtml(data.sale),
    kitchen: () => kitchenHtml(data.ticket),
    summary: () => zReportHtml(data.report),
    fee: () => feeReceiptHtml(data.payment, { copy: data.copy }),
    test: () => receiptHtml({ receipt_no: 'TEST-000000', completed_at: new Date().toLocaleString(), cashier: S.user.name, items: [{ name: 'Test item', qty: 1, price: 100, total: 100 }], payments: [{ method: 'cash', amount: 100 }], subtotal: 100, discount: 0, total: 100, tax: 13.79, change_due: 0 }),
  }[kind]();
  return printHtml(html);
}

// ================= boot / auth =================
// ================= Online demo (erp.davetech.co.ke/demo) =================
// The phone version running in a normal browser with sample data. Everything stays in this browser.
const isDemo = () => !!(window.pos && window.pos.demo);
const DEMO_PASSWORD = 'demo1234';
const DEMO_TYPES = [
  ['retail', '🛒', 'Shop / supermarket', 'Mama Njeri Supermarket', 'Sell with barcodes, M-Pesa, stock alerts, customers on credit.'],
  ['pharmacy', '💊', 'Pharmacy', 'Afya Bora Pharmacy', 'Batches and expiry dates, prescription items, stock take.'],
  ['bar', '🍺', 'Bar / pub', 'Savanna Bar & Lounge', 'Tables and open tabs, bills before payment, bottles counted.'],
  ['restaurant', '🍽', 'Hotel / restaurant', 'Mama Oliech Hotel', 'Tables, kitchen tickets, breakfast and meals menu.'],
  ['salon', '💇', 'Salon / barber', 'Glow Beauty Salon', 'Services, stylists and their commission.'],
  ['school', '🏫', 'Primary school', 'Sunrise Academy', 'Pupils, fees, registers, CBC report cards, ID cards, website.'],
  ['college', '🎓', 'College (ICT / technical)', 'Xponent ICT & Technical College', 'Courses, students, fees, online applications, results slips.'],
];
let demoAutoLogin = true;

async function demoBoot() {
  document.body.classList.add('demo');
  S.status = await api('status');
  if (!S.status.setupDone) return renderDemoPicker();
  if (demoAutoLogin) {
    demoAutoLogin = false;
    const opts = await api('loginOptions');
    const s = opts[0] && (await window.pos.call('login', { tenantId: opts[0].id, username: 'owner', password: DEMO_PASSWORD }));
    if (s && s.ok) {
      S.session = s.data;
      return enter();
    }
  }
  renderLogin(true);
}

function renderDemoPicker() {
  const card = h('div', { class: 'card wide demo-pick' });
  const start = async (type, name) => {
    put(card, h('div', { class: 'demo-wait' }, h('div', { class: 'logo' }, 'D'), h('h2', {}, 'Setting up ' + name + '…'), h('div', { class: 'muted' }, 'Adding sample products, sales' + (type === 'school' || type === 'college' ? ', pupils, fees, registers and marks' : '') + '. A few seconds.')));
    await new Promise((r) => setTimeout(r, 50));
    const r = await window.pos.call('setup', { ownerName: 'Demo Owner', username: 'owner', password: DEMO_PASSWORD, businessName: name, businessType: type, phone: '0712 345 678', address: 'Nairobi', sampleData: true });
    if (!r.ok) { toast(r.error, true); return renderDemoPicker(); }
    const opts = await api('loginOptions');
    const s = await window.pos.call('login', { tenantId: opts[0].id, username: 'owner', password: DEMO_PASSWORD });
    if (!s.ok) { toast(s.error, true); return renderLogin(true); }
    S.session = s.data;
    const look = { school: ['green', 'Strive for excellence'], college: ['maroon', 'Skills for work'], pharmacy: ['teal', 'Your health, our care'], salon: ['purple', 'Look good, feel good'] }[type];
    if (look) await window.pos.call('saveBranding', { brand: look[0], motto: look[1] });
    await window.pos.demoHistory();
    if (!prefs.get('printerPort', '')) prefs.set('printerPort', 'demo');
    demoAutoLogin = false;
    await enter();
    toast('Demo ready. Try selling, printing a receipt, or open the reports.');
  };
  add(card,
    h('div', { class: 'row' }, h('div', { class: 'logo' }, 'D'), h('div', {}, h('h1', {}, 'Try Daalpha Systems'), h('div', { class: 'muted' }, 'Pick a business to try. It opens with sample data, and nothing you do here leaves this browser.'))),
    h('div', { class: 'demo-types' }, DEMO_TYPES.map(([type, ico, label, name, about]) =>
      h('button', { class: 'demo-type', onclick: () => start(type, name) }, h('span', { class: 'demo-ico' }, ico), h('b', {}, label), h('span', { class: 'muted small' }, about)))),
    h('div', { class: 'muted small' }, 'Want it for your business? ', h('a', { href: '/#contact', target: '_top' }, 'Contact Daalpha Systems'), '.'));
  mount(h('div', { class: 'auth' }, card));
}

async function demoStartOver() {
  if (!(await confirmBox('Try another business type', 'This demo and everything you changed in it will be cleared.', 'Start over'))) return;
  await window.pos.call('logout').catch(() => {});
  const r = await window.pos.demoReset();
  if (!r.ok) return toast(r.error, true);
  location.reload();
}

function demoBar() {
  return h('div', { class: 'demo-bar' },
    h('span', {}, h('b', {}, 'Demo'), ' with sample data. Try anything; it stays in this browser.'),
    h('span', { class: 'spacer' }),
    h('button', { class: 'btn sm', onclick: demoStartOver }, 'Try another business'),
    h('a', { class: 'btn sm primary', href: '/#contact', target: '_top' }, 'Get Daalpha Systems'));
}

// receipts "printed" in the demo appear on screen
window.addEventListener('demo-print', (e) => {
  const { lines, width } = e.detail;
  const paper = h('div', { class: 'demo-paper', style: `width:${width + 2}ch` },
    lines.map((l) => h('div', { class: 'ln' + (l.bold ? ' b' : '') + (l.big ? ' big' : ''), style: `text-align:${l.align}` }, l.text || ' ')));
  modal({ title: 'Printed on the receipt printer', body: h('div', { class: 'stack', style: 'gap:10px;align-items:center' }, h('div', { class: 'muted small' }, 'In the shop this comes out of the Bluetooth or USB receipt printer.'), paper), foot: (close) => [h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: close }, 'OK')] });
});
// report cards, statements, ID cards… open on screen with a Print button
window.addEventListener('demo-html', (e) => {
  const frame = h('iframe', { class: 'demo-frame', title: e.detail.name });
  frame.srcdoc = e.detail.html;
  modal({ title: e.detail.name.replace(/\.html?$/i, '').replace(/[-_]+/g, ' '), wide: true, body: frame, foot: (close) => [h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: close }, 'Close'), h('button', { class: 'btn primary', onclick: () => frame.contentWindow.print() }, 'Print / save as PDF')] });
});

async function boot() {
  if (window.pos && window.pos.demo) return demoBoot();
  S.status = await api('status');
  if (!S.status.setupDone) return renderSetup();
  renderLogin();
}

function renderSetup() {
  const types = Object.entries(S.status.businessTypes);
  const form = h('div', { class: 'card wide' });
  const submit = async () => {
    const d = formData(form);
    if (d.password !== d.password2) return toast('Passwords do not match.', true);
    const r = await tryApi('setup', { ...d, sampleData: d.sampleData });
    if (r) {
      toast('Setup complete. Log in with your owner account.');
      boot();
    }
  };
  add(form, 
    h('div', { class: 'row' }, h('div', { class: 'logo' }, 'D'), h('div', {}, h('h1', {}, 'Welcome to Daalpha Systems'), h('div', { class: 'muted' }, 'First-time setup. Everything stays on this device.'))),
    h('div', { class: 'section-title' }, 'System owner'),
    h('div', { class: 'muted small' }, 'The owner can add businesses, switch between them, and restore backups.'),
    field('Your name', inp('ownerName', '', { autofocus: true })),
    h('div', { class: 'grid3' }, field('Username', inp('username', 'owner')), field('Password', inp('password', '', { type: 'password' })), field('Repeat password', inp('password2', '', { type: 'password' }))),
    h('div', { class: 'section-title' }, 'First business'),
    h('div', { class: 'grid2' }, field('Business name', inp('businessName')), field('Business type', sel('businessType', types, 'retail'))),
    h('div', { class: 'grid2' }, field('Phone', inp('phone')), field('KRA PIN (optional)', inp('kra_pin'))),
    field('Address / location', inp('address')),
    chk('sampleData', 'Add sample products so I can try it out', true),
    h('button', { class: 'btn primary big', onclick: submit }, 'Finish setup')
  );
  mount(h('div', { class: 'auth' }, form));
}

async function renderLogin(force) {
  const tillTenant = prefs.get('tillTenant', null);
  if (tillTenant && !force) return renderPinLogin(tillTenant);
  const opts = await api('loginOptions');
  const last = prefs.get('lastTenant', opts[0] ? opts[0].id : '');
  const card = h('div', { class: 'card' });
  const go = async () => {
    const d = formData(card);
    const s = await tryApi('login', { tenantId: d.tenantId ? Number(d.tenantId) : null, username: d.username, password: d.password });
    if (!s) return;
    prefs.set('lastTenant', d.tenantId);
    S.session = s;
    await enter();
  };
  add(card, 
    h('div', { class: 'row' }, h('div', { class: 'logo' }, 'D'), h('div', {}, h('h1', {}, 'Daalpha Systems'), h('div', { class: 'muted small' }, 'Sign in to start selling'))),
    field('Business', sel('tenantId', [...opts.map((o) => [o.id, o.name]), ['', '— System owner only —']], last)),
    field('Username', inp('username', '', { autofocus: true })),
    field('Password', inp('password', '', { type: 'password', onkeydown: (e) => e.key === 'Enter' && go() })),
    h('button', { class: 'btn primary big', onclick: go }, 'Sign in'),
    isDemo() ? h('div', { class: 'notice soft' }, 'Demo sign-in: username ', h('b', {}, 'owner'), ', password ', h('b', {}, DEMO_PASSWORD), '. ', h('button', { class: 'btn sm', onclick: demoStartOver }, 'Try another business type')) : null,
    tillTenant ? h('button', { class: 'btn ghost', onclick: () => renderLogin() }, '← Back to PIN screen') : null,
    h('button', { class: 'btn ghost', onclick: openDashboard }, '📊 Owner dashboard (online)'),
    h('button', { class: 'btn ghost sm', onclick: () => openRecovery(card) }, 'Forgot the owner password?')
  );
  mount(h('div', { class: 'auth' }, card));
}

// Forgotten system-owner password: the customer reads a code to Daalpha Systems and types in the answer code.
async function openRecovery(loginCard) {
  const r = await tryApi('recoveryStart');
  if (!r) return;
  const body = h('div', { class: 'stack recovery' });
  add(body,
    h('div', { class: 'muted small' }, 'This is only for the system owner. Staff who forgot their password or PIN: ask your admin to set a new one under Users.'),
    h('div', { class: 'section-title' }, '1. Call or WhatsApp Daalpha Systems and read them this code'),
    h('div', { class: 'recovery-code' }, r.code),
    h('div', { class: 'muted small' }, 'You can close this and come back: the same code works for 24 hours.'),
    h('div', { class: 'section-title' }, '2. Type the answer code Daalpha Systems gives you'),
    field('Answer code', inp('answer', '', { placeholder: 'XXXX-XXXX', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, class: 'input recovery-answer' })),
    h('div', { class: 'section-title' }, '3. Choose a new owner password'),
    h('div', { class: 'grid2' }, field('New password', inp('password', '', { type: 'password', autocomplete: 'off' })), field('Repeat new password', inp('password2', '', { type: 'password', autocomplete: 'off' })))
  );
  const m = modal({
    title: 'Reset the owner password',
    body,
    foot: (close) => [
      h('button', { class: 'btn', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: async () => {
        const d = formData(body);
        const out = await tryApi('recoveryFinish', d);
        if (!out) return;
        close();
        toast('Owner password changed. Sign in with it now.');
        const sel = loginCard && loginCard.querySelector('[name=tenantId]');
        if (sel) sel.value = '';
        const u = loginCard && loginCard.querySelector('[name=username]');
        if (u) u.value = out.username;
        const pw = loginCard && loginCard.querySelector('[name=password]');
        if (pw) { pw.value = ''; pw.focus(); }
        modal({ title: 'Password changed', body: h('div', { class: 'stack' }, h('div', {}, 'The owner (', h('b', {}, out.name), ') can now sign in with:'), h('div', { class: 'recovery-code' }, out.username), h('div', { class: 'muted small' }, 'That is the owner username. Choose "— System owner only —" as the business, or any business.')), foot: (c) => h('button', { class: 'btn primary', onclick: c }, 'OK') });
      } }, 'Reset password'),
    ],
  });
  return m;
}

// Owner dashboard: sales, staff activity and stock of all linked shops, over the internet.
async function openDashboard() {
  const r = await window.pos.cloudConfig();
  const cfg = r.ok ? r.data : {};
  window.OwnerDashboard.mount($('#app'), { cloud: { url: cfg.url, anonKey: cfg.anonKey }, onExit: () => boot() });
}

// ---------- till PIN screen: staff list on the left, big keypad in the centre ----------
let pinKeyHandler = null;
async function renderPinLogin(tid) {
  const r = await window.pos.call('pinUsers', { tenantId: tid });
  if (!r.ok) {
    toast(r.error, true);
    return renderLogin(true);
  }
  const { users, tenant } = r.data;
  let selected = users.length === 1 ? users[0] : null;
  let pin = '';
  let busy = false;
  const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  const list = h('div', { class: 'pin-staff' });
  const who = h('div', { class: 'pin-who' });
  // Hidden way to the password sign-in on touch screens: press and hold the title for 2 seconds.
  let holdTimer = null;
  const holdStart = () => {
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      document.removeEventListener('keydown', pinKeyHandler);
      renderLogin(true);
    }, 2000);
  };
  const holdEnd = () => clearTimeout(holdTimer);
  who.addEventListener('pointerdown', holdStart);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => who.addEventListener(ev, holdEnd));
  who.addEventListener('contextmenu', (e) => e.preventDefault());
  const dots = h('div', { class: 'pin-dots' });
  const msg = h('div', { class: 'pin-msg' });
  const pad = h('div', { class: 'pin-pad' });

  const draw = () => {
    put(list, users.length
      ? users.map((u) => h('button', { class: 'pin-person' + (selected && selected.id === u.id ? ' on' : ''), onclick: () => { selected = u; pin = ''; msg.textContent = ''; draw(); } },
          h('span', { class: 'pin-avatar' }, initials(u.name)), h('span', { class: 'pin-name' }, u.name)))
      : h('div', { class: 'pin-empty' },
          h('div', {}, 'No staff with a till PIN yet for ', h('b', {}, tenant ? tenant.name : 'this business'), '.'),
          h('div', { style: 'margin-top:8px' }, 'Sign in as the owner or an admin, open Users, and give each person a 4-digit Till PIN.'),
          h('button', { class: 'btn', style: 'margin-top:16px', onclick: () => { document.removeEventListener('keydown', pinKeyHandler); renderLogin(true); } }, 'Sign in with password')));
    who.textContent = selected ? selected.name : 'Tap your name';
    put(dots, [0, 1, 2, 3].map((i) => h('span', { class: 'pin-dot' + (i < pin.length ? ' full' : '') })));
    pad.classList.toggle('disabled', !selected);
  };

  const submit = async () => {
    busy = true;
    const res = await window.pos.call('loginPin', { tenantId: tid, userId: selected.id, pin });
    busy = false;
    if (!res.ok) {
      pin = '';
      msg.textContent = res.error;
      dots.classList.remove('shake');
      void dots.offsetWidth;
      dots.classList.add('shake');
      return draw();
    }
    document.removeEventListener('keydown', pinKeyHandler);
    S.session = res.data;
    await enter();
  };

  const press = (k) => {
    if (!selected || busy) return;
    msg.textContent = '';
    if (k === 'back') pin = pin.slice(0, -1);
    else if (k === 'clear') pin = '';
    else if (pin.length < 4) pin += k;
    draw();
    if (pin.length === 4) submit();
  };

  put(pad, ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map((k) =>
    h('button', { class: 'pin-key' + (k.length > 1 ? ' fn' : ''), onclick: () => press(k) }, k === 'back' ? '⌫' : k === 'clear' ? 'C' : k)));

  if (pinKeyHandler) document.removeEventListener('keydown', pinKeyHandler);
  pinKeyHandler = (e) => {
    if (!document.querySelector('.pin-screen')) return document.removeEventListener('keydown', pinKeyHandler);
    if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
      e.preventDefault();
      document.removeEventListener('keydown', pinKeyHandler);
      return renderLogin(true);
    }
    if (/^\d$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Escape') press('clear');
    else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && users.length) {
      const i = selected ? users.findIndex((u) => u.id === selected.id) : -1;
      selected = users[(i + (e.key === 'ArrowDown' ? 1 : users.length - 1) + (i < 0 && e.key === 'ArrowUp' ? 1 : 0)) % users.length];
      pin = '';
      draw();
    }
  };
  document.addEventListener('keydown', pinKeyHandler);

  draw();
  mount(h('div', { class: 'pin-screen' }, list, h('div', { class: 'pin-centre' }, who, dots, msg, pad)));
}

async function enter() {
  const me = await api('me');
  S.user = me.user;
  S.tenant = me.tenant;
  S.feats = me.tenant ? me.tenant.features : {};
  S.cart = newCart();
  if (typeof SCH !== 'undefined') SCH.info = null;
  S.page = S.tenant ? (S.feats.school ? 'school' : 'pos') : 'businesses';
  if (S.page === 'pos' && !canMoney()) S.page = S.feats.school ? 'school' : 'settings';
  // class teachers start on their register
  if (S.feats && S.feats.school && !can('manager')) {
    const i = await window.pos.call('schoolInfo');
    if (i.ok && i.data.myClasses.length) S.page = 'attendance';
  }
  if (S.tenant) await loadCatalog();
  renderShell();
}

// Tills: sign the cashier out after every sale (Settings → Till mode).
const autoSignOutOn = () => !!S.tenant && prefs.get('tillTenant', null) === S.tenant.id && prefs.get('autoLogout', true);

// Big "done / give change" screen for a few seconds, then back to the PIN pad.
function saleDoneThenSignOut(sale) {
  let left = sale.change_due > 0 ? 6 : 3;
  const count = h('div', { class: 'done-count' });
  let timer;
  const finish = async () => {
    clearInterval(timer);
    document.removeEventListener('keydown', onKey, true);
    ov.remove();
    await window.pos.call('logout', { auto: true });
    Object.assign(S, { session: null, user: null, tenant: null, cart: null });
    renderLogin();
  };
  const onKey = (e) => {
    if (['Enter', 'Escape', ' '].includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      finish();
    }
  };
  const tick = () => {
    count.textContent = `Signing out in ${left}…  (tap to sign out now)`;
    if (left-- <= 0) finish();
  };
  const ov = h('div', { class: 'done-screen', onclick: finish },
    h('div', { class: 'done-check' }, '✓'),
    h('div', { class: 'done-title' }, 'Sale complete'),
    h('div', { class: 'done-sub' }, sale.receipt_no),
    sale.change_due > 0 ? [h('div', { class: 'done-label' }, 'Give change'), h('div', { class: 'done-change' }, money(sale.change_due, true))] : null,
    count);
  document.body.append(ov);
  document.addEventListener('keydown', onKey, true);
  tick();
  timer = setInterval(tick, 1000);
}

async function logout() {
  if (S.cart && S.cart.items.length && !(await confirmBox('Sign out', 'The current cart will be cleared. Hold it first if you need it.', 'Sign out'))) return;
  await window.pos.call('logout');
  Object.assign(S, { session: null, user: null, tenant: null, cart: null });
  renderLogin();
}

async function loadCatalog() {
  S.products = await api('listProducts');
  S.categories = await api('listCategories');
  S.stylists = S.feats.stylists ? await api('listStylists') : [];
}

function add(el, ...kids) {
  Element.prototype.append.apply(el, kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
}
function put(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
}

function mount(node) {
  const app = $('#app');
  put(app, node);
}

// ================= shell =================
const NAV = [
  ['school', '🏫', 'School', () => S.tenant && S.feats.school],
  ['pupils', '🎒', 'Pupils', () => S.tenant && S.feats.school],
  ['applications', '📨', 'Applications', () => S.tenant && S.feats.school && can('manager')],
  ['attendance', '✅', 'Attendance', () => S.tenant && S.feats.school],
  ['exams', '📝', 'Exams', () => S.tenant && S.feats.school],
  ['timetable', '🗓', 'Timetable', () => S.tenant && S.feats.school],
  ['fees', '💰', 'Fees', () => S.tenant && S.feats.school && can('manager')],
  ['pos', '🛒', () => (S.feats.school ? 'School shop' : 'Sell'), () => !!S.tenant && canMoney()],
  ['tables', '🍽', 'Tables', () => S.tenant && S.feats.tables],
  ['sales', '🧾', 'Sales', () => !!S.tenant && canMoney()],
  ['products', '📦', 'Products', () => S.tenant && can('manager')],
  ['stock', '⚠', 'Stock alerts', () => S.tenant && S.feats.stock && canMoney()],
  ['stocktake', '🔢', 'Stock take', () => S.tenant && S.feats.stock && (can('manager') || (S.dash && S.dash.stockTake))],
  ['customers', '👥', 'Customers', () => S.tenant && S.feats.accounts],
  ['reports', '📊', 'Reports', () => S.tenant && can('manager')],
  ['activity', '📋', 'Activity', () => S.tenant && can('admin')],
  ['users', '🔑', () => (isSchool() ? 'Staff logins' : 'Users'), () => S.tenant && can('admin')],
  ['settings', '⚙', 'Settings', () => !!S.tenant],
  ['businesses', '🏢', 'Businesses', () => can('owner')],
];

// ----- each business's own colours and logo (Settings → Logo & colours) -----
const BRANDS = {
  davetech: ['Daalpha navy & red', '#110e4a', '#e3262f'],
  green: ['Green', '#0e3b2b', '#178a4c'],
  blue: ['Royal blue', '#0b2559', '#1d5fd1'],
  maroon: ['Maroon', '#3a0a15', '#9b1c31'],
  navy: ['Navy & gold', '#0d1b3d', '#b8860b'],
  purple: ['Purple', '#2a0f4f', '#7a2fbf'],
  gold: ['Gold & brown', '#3a2606', '#b7791f'],
  orange: ['Orange', '#3b1805', '#d9580b'],
  teal: ['Teal', '#063b3c', '#0f8b8d'],
};
const mixHex = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.substr(i, 2), 16) * (1 - k) + parseInt(b.substr(i, 2), 16) * k).toString(16).padStart(2, '0')).join('');
// { side, accent, accent2, soft, grad } for a tenant (or the Daalpha Systems colours).
function brandOf(t) {
  const key = (t && t.brand) || 'davetech';
  let side, accent;
  if (BRANDS[key]) [, side, accent] = BRANDS[key];
  else if (/^#[0-9a-f]{6}$/i.test(key)) { accent = key.toLowerCase(); side = mixHex(accent, '#000000', 0.72); }
  else [, side, accent] = BRANDS.davetech;
  const accent2 = key === 'davetech' || !t || !t.brand ? '#d6195f' : mixHex(accent, '#ffffff', 0.22);
  return { side, accent, accent2, soft: mixHex(accent, '#ffffff', 0.9), grad: `linear-gradient(100deg, ${key === 'davetech' || !t || !t.brand ? '#f0372a' : accent} 0%, ${accent2} 100%)` };
}
function applyBrand(t) {
  const b = brandOf(t);
  const r = document.documentElement.style;
  r.setProperty('--side', b.side);
  r.setProperty('--accent', b.accent);
  r.setProperty('--accent-2', b.accent2);
  r.setProperty('--accent-soft', b.soft);
  r.setProperty('--grad', b.grad);
}
// The logo as an <img> for printouts (empty when there is none).
const logoImg = (t, cls = 'logo') => (t && t.logo ? `<img class="${cls}" src="${t.logo}" alt="">` : '');
// Pick a logo picture: shrink to 320px, keep see-through PNG backgrounds.
function pickLogo() {
  return new Promise((resolve) => {
    pickFileBase64('image/png,image/jpeg,image/webp').then((f) => {
      if (!f) return resolve(null);
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 320 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * k));
        c.height = Math.max(1, Math.round(im.height * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        let url = c.toDataURL('image/png');
        if (url.length > 280000) {
          const ctx = c.getContext('2d');
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          url = c.toDataURL('image/jpeg', 0.85);
        }
        resolve(url);
      };
      im.onerror = () => { toast('That file is not a picture this device can read.', true); resolve(null); };
      im.src = 'data:image;base64,' + f.base64;
    });
  });
}

function renderShell() {
  applyBrand(S.tenant);
  const side = h(
    'nav',
    { class: 'side' },
    h('div', { class: 'brand' + (S.tenant && S.tenant.logo ? ' has-logo' : '') }, S.tenant && S.tenant.logo ? h('img', { class: 'brand-logo', src: S.tenant.logo, alt: '' }) : null, h('div', {}, h('b', {}, S.tenant ? S.tenant.name : 'Daalpha Systems'), h('span', {}, S.tenant ? (S.tenant.motto || S.tenant.type_label) : 'System owner'))),
    NAV.filter((n) => n[3]()).map(([id, ico, label]) =>
      h('button', { class: 'nav' + (S.page === id ? ' on' : ''), onclick: () => go(id) }, h('span', { class: 'ico' }, ico), id === 'customers' && S.tenant.business_type === 'canteen' ? 'Students' : id === 'customers' && S.tenant.business_type === 'salon' ? 'Clients' : typeof label === 'function' ? label() : label, badgeFor(id))
    ),
    h('div', { class: 'who' }, h('b', {}, S.user.name), h('div', { class: 'muted', style: 'color:inherit;opacity:.7' }, S.user.title || roleLabel(S.user.role)), h('button', { class: 'btn sm', style: 'margin-top:8px', onclick: logout }, 'Sign out'))
  );
  const main = h('main', { class: 'main', id: 'main' });
  const navLabel = (NAV.find((n) => n[0] === S.page) || [])[2] || '';
  const pageName = typeof navLabel === 'function' ? navLabel() : navLabel;
  const bar = h('div', { class: 'mobile-bar' },
    h('button', { class: 'menu-btn', 'aria-label': 'Menu', onclick: () => document.body.classList.toggle('nav-open') }, '☰'),
    h('div', { class: 'mobile-title' }, h('b', {}, pageName), h('span', {}, S.tenant ? S.tenant.name : 'Daalpha Systems')));
  add(main, bar);
  if (isDemo()) add(main, demoBar());
  mount(h('div', { class: 'shell' }, side, h('div', { class: 'nav-backdrop', onclick: () => document.body.classList.remove('nav-open') }), main));
  PAGES[S.page](main);
  refreshBadges();
}

function badgeFor(id) {
  const d = S.dash;
  if (!d) return null;
  if (id === 'stock' && d.low + d.expiring + (d.noBatch || 0) > 0) return h('span', { class: 'count' }, d.low + d.expiring + (d.noBatch || 0));
  if (id === 'stocktake' && d.stockTake) return h('span', { class: 'count' }, 'open');
  if (id === 'applications' && d.applications > 0) return h('span', { class: 'count' }, d.applications);
  if ((id === 'tables' || (id === 'pos' && !S.feats.tables)) && d.open > 0) return h('span', { class: 'count' }, d.open);
  return null;
}
async function refreshBadges() {
  if (!S.tenant) return;
  const d = await window.pos.call('dashboard');
  if (!d.ok) return;
  const changed = JSON.stringify(d.data) !== JSON.stringify(S.dash);
  S.dash = d.data;
  if (changed) {
    document.querySelectorAll('.side .nav').forEach((b, i) => {
      const id = NAV.filter((n) => n[3]())[i][0];
      b.querySelector('.count') && b.querySelector('.count').remove();
      const bd = badgeFor(id);
      bd && add(b, bd);
    });
  }
}

function go(page) {
  if (window.__stopCamera) window.__stopCamera(); // leaving the QR scanner turns the camera off
  document.body.classList.remove('nav-open', 'cart-open');
  if (page !== S.page) S.stockTakeView = null;
  S.page = page;
  renderShell();
}

// ================= POS =================
function newCart() {
  return { id: null, table_id: null, table_name: '', customer: null, order_label: '', items: [], sel: -1, discount: 0 };
}
function cartTotal() {
  return r2(S.cart.items.reduce((a, i) => a + i.price * i.qty, 0));
}

function addToCart(p, qty = 1) {
  const c = S.cart;
  const staff = S.feats.stylists && !p.track_stock && c.stylist ? c.stylist : null;
  const idx = c.items.findIndex((i) => i.product_id === p.id && !i.note && (i.staff_id || null) === (staff ? staff.id : null));
  if (idx >= 0) {
    c.items[idx].qty = r2(c.items[idx].qty + qty);
    c.sel = idx;
  } else {
    c.items.push({ product_id: p.id, name: p.name, price: p.price, qty, note: '', sent_qty: 0, track_stock: p.track_stock, stock: S.feats.batches ? p.sellable : p.stock, unbatched: p.unbatched, unit: p.unit, rx: p.requires_prescription, staff_id: staff ? staff.id : null, staff_name: staff ? staff.name : '' });
    c.sel = c.items.length - 1;
  }
  const line = c.items[c.sel];
  if (S.feats.batches && line.track_stock && line.qty > line.stock)
    toast(line.stock > 0 ? `Only ${qtyFmt(line.stock)} ${p.unit} of ${p.name} has a valid batch and expiry date.` : p.unbatched > 0 ? `${p.name} has no batch number / expiry date yet, so it can’t be sold. A manager can add it (Products → Give batch).` : `${p.name}: no stock with a valid batch and expiry date.`, true);
  else if (S.feats.stock && line.track_stock && line.qty > line.stock && !S.tenant.allow_negative_stock) toast(`Only ${qtyFmt(line.stock)} ${p.unit} of ${p.name} in stock.`, true);
  renderCart();
}

function pagePos(main) {
  const search = h('input', {
    class: 'input',
    id: 'pos-search',
    placeholder: isPhone() ? 'Search products' : S.feats.barcode ? 'Scan barcode or search products  (F2)' : 'Search products  (F2)',
    autocomplete: 'off',
    oninput: () => renderTiles(),
    onkeydown: async (e) => {
      if (e.key !== 'Enter') return;
      const v = search.value.trim();
      if (!v) return;
      // "3*code" adds three
      const m = v.match(/^(\d+(?:\.\d+)?)\*(.+)$/);
      const qty = m ? Number(m[1]) : 1;
      const code = m ? m[2] : v;
      let p = S.products.find((x) => (x.barcode && x.barcode === code) || (x.sku && x.sku.toLowerCase() === code.toLowerCase()));
      if (!p) {
        const hits = filteredProducts(code);
        if (hits.length === 1) p = hits[0];
      }
      if (p) {
        addToCart(p, qty);
        search.value = '';
        renderTiles();
      } else toast('No product matches "' + code + '".', true);
    },
  });
  const left = h(
    'section',
    { class: 'pos-left' },
    h('div', { class: 'pos-search' }, search, h('button', { class: 'btn', title: 'Orders on hold', onclick: showHeld }, '⏸ Held', S.dash && S.dash.open ? ` (${S.dash.open})` : '')),
    h('div', { class: 'chips', id: 'chips' }),
    h('div', { class: 'tiles', id: 'tiles' })
  );
  const cart = h('aside', { class: 'cart', id: 'cart' });
  const cartBar = h('button', { class: 'cart-bar', id: 'cart-bar', onclick: () => document.body.classList.add('cart-open') });
  add(main, h('div', { class: 'pos' }, left, cart), cartBar);
  renderChips();
  renderTiles();
  renderCart();
  if (!isPhone()) setTimeout(() => search.focus(), 20);
}

// ----- till look: a picture for every product (its photo, or an icon on its category's colour) -----
const CAT_TONES = [['#fde8ea', '#c62842'], ['#e5efff', '#2b5fc9'], ['#e3f5ea', '#1d8a4c'], ['#fff1d9', '#b86e00'], ['#f0e7ff', '#7339c4'], ['#dff4f4', '#0f7f80'], ['#ffe6f2', '#bd2f7a'], ['#eceef3', '#4a5368']];
const catTone = (catId) => {
  const i = (S.categories || []).findIndex((c) => c.id === catId);
  return CAT_TONES[(i < 0 ? CAT_TONES.length - 1 : i) % CAT_TONES.length];
};
const ICONS = [
  [/\b(tea|chai)\b/, '🍵'], [/coffee|latte|cappuc/, '☕'], [/juice/, '🧃'], [/soda|coke|fanta|sprite|energy/, '🥤'], [/water/, '💧'], [/milk|mala|yogh?urt/, '🥛'],
  [/beer|lager|tusker|guinness|pilsner|white ?cap|balozi|cider/, '🍺'], [/wine/, '🍷'], [/gin|vodka|whisk|cane|rum|brandy|spirit|chrome/, '🥃'],
  [/chips|fries/, '🍟'], [/chicken|kuku/, '🍗'], [/beef|stew|nyama|meat|goat|mbuzi|choma/, '🍖'], [/fish|samaki|tilapia/, '🐟'], [/rice|pilau|biryani/, '🍚'], [/ugali|sukuma|githeri|chapati/, '🍽'],
  [/smokie|sausage|hot ?dog/, '🌭'], [/samosa/, '🥟'], [/mandazi|bread|bun|scone/, '🍞'], [/omelet|egg/, '🍳'], [/cake/, '🍰'], [/pizza/, '🍕'], [/burger/, '🍔'], [/salad|vegetable/, '🥗'], [/fruit|banana|apple|orange/, '🍎'],
  [/sugar|salt/, '🧂'], [/flour|unga|maize/, '🌾'], [/oil/, '🫒'], [/soap|detergent|omo/, '🧼'], [/tissue|toilet/, '🧻'], [/biscuit|cookie/, '🍪'], [/sweet|candy/, '🍬'], [/matchbox|match/, '🔥'],
  [/hair|cut|braid|blow|barber|shave|beard|wash/, '✂️'], [/nail|manicure|pedicure|polish/, '💅'], [/eyebrow|make ?up|facial/, '💄'], [/shampoo|hair food|lotion|cream/, '🧴'],
  [/mg\b|tablet|capsule|syrup|paracetamol|ibuprofen|amoxi|ors|antibiotic/, '💊'], [/sanitizer|mask|glove/, '🧴'],
  [/book|exercise/, '📒'], [/pen\b|pencil/, '✏️'], [/mathematical|ruler/, '📐'], [/sweater|shirt|shorts|skirt|socks|uniform|coat|overall|t-shirt/, '👕'], [/flash|usb/, '💾'],
];
const productIcon = (name) => {
  const n = String(name || '').toLowerCase();
  const hit = ICONS.find(([re]) => re.test(n));
  return hit ? hit[1] : null;
};
const initials2 = (name) => String(name || '?').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
function productPic(p, cls = 'pic') {
  if (p.photo) return h('div', { class: cls + ' photo', style: `background-image:url("${p.photo}")` });
  const [bg, fg] = catTone(p.category_id);
  const ico = productIcon(p.name);
  return h('div', { class: cls, style: `background:${bg};color:${fg}` }, ico ? h('span', { class: 'emo' }, ico) : h('span', { class: 'ini' }, initials2(p.name)));
}

function filteredProducts(q) {
  q = (q || '').toLowerCase();
  return S.products.filter(
    (p) => (!S.catFilter || p.category_id === S.catFilter) && (!q || p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q) || (p.barcode || '') === q)
  );
}

function renderChips() {
  const el = $('#chips');
  if (!el) return;
  put(el, 
    h('button', { class: 'chip' + (!S.catFilter ? ' on' : ''), onclick: () => { S.catFilter = null; renderChips(); renderTiles(); } }, 'All'),
    S.categories.map((c) => h('button', { class: 'chip' + (S.catFilter === c.id ? ' on' : ''), onclick: () => { S.catFilter = c.id; renderChips(); renderTiles(); } }, h('i', { class: 'dot', style: `background:${catTone(c.id)[1]}` }), c.name))
  );
}

function renderTiles() {
  const el = $('#tiles');
  if (!el) return;
  const list = filteredProducts($('#pos-search') ? $('#pos-search').value.trim() : '');
  if (!list.length) {
    put(el, h('div', { class: 'empty', style: 'grid-column:1/-1' }, S.products.length ? 'No products match.' : can('manager') ? 'No products yet. Add them under Products.' : 'No products yet. Ask a manager to add them.'));
    return;
  }
  put(el, 
    ...list.slice(0, 400).map((p) => {
      const tracked = S.feats.stock && p.track_stock;
      const have = S.feats.batches ? p.sellable : p.stock; // pharmacies: only stock with a valid batch can be sold
      const out = tracked && have <= 0;
      const low = tracked && !out && p.reorder_level > 0 && have <= p.reorder_level;
      const inCart = S.cart && S.cart.items.filter((i) => i.product_id === p.id).reduce((n, i) => n + Number(i.qty || 0), 0);
      return h(
        'button',
        { class: 'tile' + (out ? ' out' : ''), onclick: () => addToCart(p) },
        productPic(p),
        inCart ? h('span', { class: 'in-cart' }, qtyFmt(inCart)) : null,
        p.requires_prescription ? h('span', { class: 'rx' }, 'Rx') : null,
        h('div', { class: 'info' },
          h('div', { class: 'nm' }, p.name),
          h('div', { class: 'row' }, h('span', { class: 'pr' }, money(p.price)), h('span', { class: 'spacer' }),
            tracked ? h('span', { class: 'st ' + (out ? 'out' : low ? 'low' : 'ok') }, out ? (S.feats.batches && p.unbatched > 0 ? 'No batch' : 'Out') : `${qtyFmt(have)} left`) : null))
      );
    })
  );
}

function renderCart() {
  const el = $('#cart');
  if (!el) return;
  renderTiles(); // keeps the "in cart" counts on the product pictures right
  const c = S.cart;
  const total = cartTotal();
  const head = h(
    'div',
    { class: 'cart-head' },
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn sm mobile-only', onclick: () => document.body.classList.remove('cart-open') }, '← Products'),
      h('h2', {}, c.id ? (c.table_name || c.order_label || 'Order #' + c.id) : c.table_name ? c.table_name : 'New sale'),
      h('span', { class: 'spacer' }),
      c.items.length || c.id ? h('button', { class: 'btn sm danger', onclick: clearCart }, c.id ? 'Close' : 'Clear') : null
    ),
    S.feats.accounts || c.customer
      ? h('div', { class: 'pill-select', onclick: pickCustomer }, '👤', c.customer ? h('span', {}, h('b', {}, c.customer.name), c.customer.account_no ? ' · ' + c.customer.account_no : '', h('span', { class: 'muted small' }, ' · ' + balanceText(c.customer))) : h('span', { class: 'muted' }, 'Walk-in customer (click to choose)'), c.customer ? h('button', { class: 'btn ghost sm', style: 'margin-left:auto', onclick: (e) => { e.stopPropagation(); c.customer = null; renderCart(); } }, '✕') : null)
      : null,
    S.feats.stylists
      ? h('div', { class: 'pill-select', onclick: () => pickStylist('New services', (st) => { c.stylist = st; renderCart(); }) }, '✂', c.stylist ? h('span', {}, 'Stylist: ', h('b', {}, c.stylist.name), h('span', { class: 'muted small' }, ' · new services go to them')) : h('span', { class: 'muted' }, 'Choose the stylist, then tap services'))
      : null,
    S.feats.tables && !c.table_id ? h('input', { class: 'input', placeholder: 'Order name (e.g. takeaway – Mary)', value: c.order_label, oninput: (e) => (c.order_label = e.target.value) }) : null
  );
  const lines = h(
    'div',
    { class: 'cart-lines' },
    c.items.length
      ? c.items.map((it, i) =>
          h(
            'div',
            { class: 'line' + (c.sel === i ? ' sel' : ''), onclick: () => { c.sel = i; renderCart(); } },
            h('div', {}, h('div', { class: 'nm' }, it.name), h('div', { class: 'sub' }, `${money(it.price)} each`, it.sent_qty > 0 ? ` · ${qtyFmt(it.sent_qty)} sent to kitchen` : '', it.note ? h('div', {}, '» ' + it.note) : null,
              S.feats.stylists && (!it.track_stock || it.staff_id) ? h('button', { class: 'stylist-chip' + (it.staff_id ? '' : ' missing'), onclick: (e) => { e.stopPropagation(); pickStylist(it.name, (st) => { it.staff_id = st ? st.id : null; it.staff_name = st ? st.name : ''; renderCart(); }); } }, '✂ ', it.staff_id ? it.staff_name : 'Choose stylist') : null)),
            h('div', { class: 'amt' }, money(it.price * it.qty)),
            h(
              'div',
              { class: 'qty' },
              h('button', { onclick: (e) => { e.stopPropagation(); changeQty(i, -1); } }, '−'),
              h('input', { class: 'input', value: qtyFmt(it.qty), onclick: (e) => e.stopPropagation(), onchange: (e) => setQty(i, e.target.value) }),
              h('button', { onclick: (e) => { e.stopPropagation(); changeQty(i, 1); } }, '+'),
              S.feats.kitchen ? h('button', { title: 'Add note', onclick: async (e) => { e.stopPropagation(); const n = await promptBox('Note for kitchen', it.name, it.note); if (n !== null) { it.note = n; renderCart(); } } }, '✎') : null,
              can('manager') ? h('button', { title: 'Change price', onclick: async (e) => { e.stopPropagation(); const n = await promptBox('Change price', it.name, String(it.price)); if (n !== null && !isNaN(+n) && +n >= 0) { it.price = r2(n); renderCart(); } } }, h('span', { class: 'small' }, 'KSh')) : null
            ),
            h('div', { style: 'text-align:right' }, h('button', { class: 'btn ghost sm danger', onclick: (e) => { e.stopPropagation(); removeLine(i); } }, 'Remove'))
          )
        )
      : h('div', { class: 'cart-empty' }, h('div', { class: 'ce-ico' }, '🛒'), h('b', {}, 'No items yet'), h('span', { class: 'muted small' }, S.feats.barcode ? 'Tap a product or scan a barcode.' : 'Tap a product to add it.'))
  );
  const foot = h(
    'div',
    { class: 'cart-foot' },
    h('div', { class: 'totals' }, h('div', { class: 'muted' }, h('span', {}, `${c.items.length} item(s)`), h('span', {}, 'VAT incl.')), h('div', { class: 'grand' }, h('span', {}, 'Total'), h('span', {}, money(total)))),
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn', style: 'flex:1', disabled: !c.items.length, onclick: holdCart, title: 'F4' }, c.id ? 'Save order' : 'Hold'),
      S.feats.kitchen ? h('button', { class: 'btn', style: 'flex:1', disabled: !c.items.some((i) => i.qty > i.sent_qty), onclick: sendKitchen }, '🔔 Kitchen') : null,
      S.feats.tables ? h('button', { class: 'btn', style: 'flex:1', disabled: !c.items.length, onclick: printBill, title: 'Print the bill for the customer to check before paying' }, '🧾 Bill') : null
    ),
    h('button', { class: 'btn primary big', disabled: !c.items.length, onclick: openPay }, isPhone() ? `Pay ${money(total)}` : `Pay ${money(total)}  (F9)`)
  );
  put(el, head, lines, foot);
  // phones: the cart is a separate sheet; this bar at the bottom of the product list opens it
  const bar = $('#cart-bar');
  if (bar) {
    const n = c.items.reduce((a, i) => a + Number(i.qty), 0);
    put(bar, h('span', { class: 'cart-bar-count' }, qtyFmt(n)), h('span', {}, n ? 'View cart' : 'Cart is empty'), h('span', { class: 'spacer' }), h('b', {}, money(total)));
    bar.classList.toggle('empty', !c.items.length);
    bar.classList.remove('bump');
    void bar.offsetWidth;
    if (c.items.length) bar.classList.add('bump');
  }
  if (!c.items.length && !c.id) document.body.classList.remove('cart-open');
  const selEl = el.querySelector('.line.sel');
  selEl && selEl.scrollIntoView({ block: 'nearest' });
}

function balanceText(c) {
  if (c.balance > 0) return `owes ${money(c.balance)}`;
  if (c.balance < 0) return `credit ${money(-c.balance)}`;
  return 'balance 0';
}

function changeQty(i, d) {
  const it = S.cart.items[i];
  const next = r2(it.qty + d);
  if (next <= 0) return removeLine(i);
  if (next < it.sent_qty && !can('manager')) return toast('Already sent to kitchen. A manager must reduce it.', true);
  it.qty = next;
  S.cart.sel = i;
  renderCart();
}
function setQty(i, v) {
  const n = Number(v);
  if (!(n > 0)) return removeLine(i);
  const it = S.cart.items[i];
  if (n < it.sent_qty && !can('manager')) {
    toast('Already sent to kitchen. A manager must reduce it.', true);
    return renderCart();
  }
  it.qty = r2(n);
  renderCart();
}
function removeLine(i) {
  const it = S.cart.items[i];
  if (it.sent_qty > 0 && !can('manager')) return toast('Already sent to kitchen. A manager must remove it.', true);
  S.cart.items.splice(i, 1);
  S.cart.sel = Math.min(S.cart.sel, S.cart.items.length - 1);
  renderCart();
}
async function clearCart() {
  if (S.cart.items.length && !S.cart.id && !(await confirmBox('Clear cart', 'Remove all items from this sale?', 'Clear', true))) return;
  S.cart = newCart();
  renderCart();
  $('#pos-search') && $('#pos-search').focus();
}

function cartPayload() {
  const c = S.cart;
  return {
    id: c.id,
    table_id: c.table_id,
    customer_id: c.customer ? c.customer.id : null,
    order_label: c.order_label,
    items: c.items.map((i) => ({ product_id: i.product_id, qty: i.qty, price: i.price, note: i.note, sent_qty: i.sent_qty, staff_id: i.staff_id || null })),
  };
}

async function holdCart() {
  if (!S.cart.items.length) return;
  if (!S.cart.id && !S.cart.table_id && !S.cart.order_label && !S.cart.customer) {
    const name = await promptBox('Hold sale', 'Name this sale so you can find it later', '');
    if (name === null) return;
    S.cart.order_label = name || 'Held ' + new Date().toLocaleTimeString();
  }
  const r = await tryApi('holdSale', cartPayload());
  if (!r) return;
  toast('Order saved.');
  S.cart = newCart();
  await refreshBadges();
  if (S.feats.tables && r.table_id) go('tables');
  else renderShell();
}

// Print the bill before payment. The order is saved first (it stays open), so the customer can pay later.
async function printBill() {
  if (!S.cart.items.length) return;
  if (!S.cart.id && !S.cart.table_id && !S.cart.order_label && !S.cart.customer) {
    const name = await promptBox('Print bill', 'Name this order so you can find it when they pay (e.g. Table 4, John)', '');
    if (name === null) return;
    S.cart.order_label = name || 'Bill ' + new Date().toLocaleTimeString();
  }
  const saved = await tryApi('holdSale', cartPayload());
  if (!saved) return;
  const bill = await tryApi('printBill', { id: saved.id });
  if (!bill) return;
  await printJob('bill', { sale: bill });
  loadSaleIntoCart(await api('getSale', { id: saved.id }));
  renderCart();
  toast(bill.bill_count > 1 ? `Bill printed again (${bill.bill_count} times).` : 'Bill printed. Take payment when the customer is ready.');
  refreshBadges();
}

async function sendKitchen() {
  let saved = await tryApi('holdSale', cartPayload());
  if (!saved) return;
  const tk = await tryApi('kitchenTicket', { id: saved.id });
  if (!tk) return;
  if (tk.lines.length) await printJob('kitchen', { ticket: tk });
  saved = await api('getSale', { id: saved.id });
  loadSaleIntoCart(saved);
  renderCart();
  toast(`Sent ${tk.lines.length} item(s) to the kitchen.`);
  refreshBadges();
}

function loadSaleIntoCart(sale) {
  S.cart = {
    id: sale.id,
    table_id: sale.table_id,
    table_name: sale.table_name || '',
    order_label: sale.order_label || '',
    customer: sale.customer_id ? { id: sale.customer_id, name: sale.customer_name, account_no: sale.account_no, balance: sale.customer_balance || 0 } : null,
    items: sale.items.map((i) => {
      const p = S.products.find((x) => x.id === i.product_id) || {};
      return { product_id: i.product_id, name: i.name, price: i.price, qty: i.qty, note: i.note, sent_qty: i.sent_qty, track_stock: p.track_stock, stock: p.stock, unit: p.unit, rx: p.requires_prescription, staff_id: i.staff_id || null, staff_name: i.staff_name || '' };
    }),
    sel: -1,
    discount: 0,
  };
}

async function showHeld() {
  const list = await tryApi('listOpenOrders');
  if (!list) return;
  modal({
    title: 'Orders on hold',
    wide: true,
    body: (close) =>
      list.length
        ? h(
            'table',
            { class: 'list' },
            h('tr', {}, h('th', {}, 'Order'), h('th', {}, 'Customer'), h('th', {}, 'Opened by'), h('th', {}, 'Time'), h('th', { class: 'num' }, 'Total'), h('th', {})),
            list.map((o) =>
              h(
                'tr',
                { class: 'click', onclick: async () => { if (S.cart.items.length && !S.cart.id && !(await confirmBox('Replace cart', 'The current cart will be cleared.', 'Continue'))) return; const s = await tryApi('getSale', { id: o.id }); if (s) { loadSaleIntoCart(s); close(); if (S.page !== 'pos') go('pos'); else renderCart(); } } },
                h('td', {}, h('b', {}, o.table_name || o.order_label || 'Order #' + o.id), h('div', { class: 'muted small' }, `${o.lines} line(s)`)),
                h('td', {}, o.customer_name || '—'),
                h('td', {}, o.cashier),
                h('td', {}, fmtDate(o.created_at)),
                h('td', { class: 'num' }, money(o.total)),
                h('td', {}, h('button', { class: 'btn sm danger', onclick: async (e) => { e.stopPropagation(); if (await confirmBox('Delete order', 'Delete this held order?', 'Delete', true)) { if (await tryApi('deleteOpenOrder', { id: o.id })) { close(); showHeld(); refreshBadges(); } } } }, 'Delete'))
              )
            )
          )
        : h('div', { class: 'empty' }, 'No orders on hold.'),
  });
}

// ---------- stylist picker (salons) ----------
function pickStylist(forWhat, done) {
  const list = S.stylists || [];
  modal({
    title: 'Who is doing it?',
    body: (close) => [
      h('div', { class: 'muted' }, forWhat),
      list.length
        ? h('div', { class: 'stylist-grid' }, list.map((st) => h('button', { class: 'stylist-btn', onclick: () => { close(); done(st); } }, st.name)))
        : h('div', { class: 'notice' }, 'No stylists yet. A manager or admin can tick “Does services (stylist)” on a person under Users.'),
    ],
    foot: (close) => [h('button', { class: 'btn', onclick: () => { close(); done(null); } }, 'No stylist'), h('button', { class: 'btn', onclick: close }, 'Cancel')],
  });
}

// ---------- customer picker ----------
async function pickCustomer() {
  const results = h('div');
  const search = h('input', { class: 'input', placeholder: 'Search name, phone or account number', autofocus: true });
  let m;
  const load = async () => {
    const list = (await tryApi('listCustomers', { q: search.value.trim() })) || [];
    put(results, 
      list.length
        ? h(
            'table',
            { class: 'list' },
            list.slice(0, 50).map((c) =>
              h('tr', { class: 'click', onclick: () => { S.cart.customer = c; m.close(); renderCart(); } }, h('td', {}, h('b', {}, c.name), h('div', { class: 'muted small' }, [c.account_no, c.phone, c.notes].filter(Boolean).join(' · '))), h('td', { class: 'num' }, balanceText(c)))
            )
          )
        : h('div', { class: 'empty' }, 'No customers found.')
    );
  };
  search.addEventListener('input', load);
  m = modal({
    title: 'Choose customer',
    body: [search, results],
    foot: (close) => [h('button', { class: 'btn', onclick: () => { close(); editCustomer(null, (c) => { S.cart.customer = c; renderCart(); }); } }, '+ New customer'), h('button', { class: 'btn', onclick: close }, 'Cancel')],
  });
  load();
}

// ---------- payment ----------
function openPay() {
  const c = S.cart;
  if (!c.items.length) return;
  const t = S.tenant;
  const subtotal = cartTotal();
  const canDiscount = can('manager') || t.cashier_max_discount > 0;
  const needsRx = c.items.some((i) => i.rx);
  const fields = {
    discount: h('input', { class: 'input num', value: '', placeholder: '0.00', disabled: !canDiscount }),
    cash: h('input', { class: 'input num', placeholder: '0.00', autofocus: true }),
    mpesa: h('input', { class: 'input num', placeholder: '0.00' }),
    mpesaRef: h('input', { class: 'input', placeholder: 'M-Pesa code e.g. SJK3X…', style: 'text-transform:uppercase' }),
    card: h('input', { class: 'input num', placeholder: '0.00' }),
    cardRef: h('input', { class: 'input', placeholder: 'Card slip / ref (optional)' }),
    account: h('input', { class: 'input num', placeholder: '0.00' }),
    rx: h('input', { type: 'checkbox' }),
  };
  const totalEl = h('div', { class: 'pay-total' });
  const changeEl = h('div', { class: 'change' });
  const val = (el) => r2(el.value);
  const due = () => r2(subtotal - Math.min(val(fields.discount), subtotal));
  const update = () => {
    totalEl.textContent = money(due(), true);
    const paid = val(fields.cash) + val(fields.mpesa) + val(fields.card) + val(fields.account);
    const diff = r2(paid - due());
    changeEl.className = 'change' + (diff < 0 ? ' short' : '');
    changeEl.textContent = diff < 0 ? `Still to pay: ${money(-diff)}` : `Change: ${money(diff)}`;
  };
  Object.values(fields).forEach((f) => f.addEventListener('input', update));
  const setOnly = (key) => {
    ['cash', 'mpesa', 'card', 'account'].forEach((k) => (fields[k].value = ''));
    fields[key].value = due().toFixed(2);
    update();
    (key === 'mpesa' ? fields.mpesaRef : fields[key]).focus();
  };
  const quick = () => {
    const d = due();
    const ups = [...new Set([d, Math.ceil(d / 50) * 50, Math.ceil(d / 100) * 100, Math.ceil(d / 500) * 500, Math.ceil(d / 1000) * 1000])].filter((v) => v >= d).slice(0, 5);
    return h('div', { class: 'quick' }, ups.map((v) => h('button', { class: 'btn sm', onclick: () => { fields.cash.value = v.toFixed(2); update(); } }, v === d ? 'Exact' : money(v))));
  };
  const complete = async (print, close) => {
    if (needsRx && !fields.rx.checked) return toast('Tick the prescription check first.', true);
    const payments = [
      { method: 'cash', amount: val(fields.cash) },
      { method: 'mpesa', amount: val(fields.mpesa), reference: fields.mpesaRef.value.trim().toUpperCase() },
      { method: 'card', amount: val(fields.card), reference: fields.cardRef.value.trim() },
      { method: 'account', amount: val(fields.account) },
    ];
    const sale = await tryApi('completeSale', { ...cartPayload(), discount: val(fields.discount), payments, prescription_ok: fields.rx.checked });
    if (!sale) return;
    close();
    if (print) await printJob('receipt', { sale });
    S.cart = newCart();
    if (autoSignOutOn()) return saleDoneThenSignOut(sale);
    toast(`Sale ${sale.receipt_no} done.` + (sale.change_due > 0 ? ` Give change ${money(sale.change_due)}.` : ''));
    await loadCatalog();
    if (S.page === 'pos') {
      renderTiles();
      renderCart();
      $('#pos-search') && $('#pos-search').focus();
    }
    refreshBadges();
  };
  const autoPrint = prefs.get('autoPrint', true);
  modal({
    title: 'Take payment',
    body: (close) => {
      const keyer = (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
          e.preventDefault();
          complete(autoPrint, close);
        }
      };
      Object.values(fields).forEach((f) => f.addEventListener('keydown', keyer));
      return [
        totalEl,
        c.customer ? h('div', { class: 'muted', style: 'text-align:center' }, `${c.customer.name} — ${balanceText(c.customer)}`) : null,
        h('div', { class: 'pay-row' }, h('b', {}, 'Cash'), fields.cash, quick()),
        h('div', { class: 'pay-row' }, h('b', {}, 'M-Pesa'), fields.mpesa, fields.mpesaRef),
        h('div', { class: 'pay-row' }, h('b', {}, 'Card'), fields.card, fields.cardRef),
        S.feats.accounts ? h('div', { class: 'pay-row' }, h('b', {}, 'On account'), fields.account, c.customer ? h('span', { class: 'muted small' }, 'Charged to ' + c.customer.name) : h('span', { class: 'muted small' }, 'Choose a customer first')) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => setOnly('cash') }, 'All cash'), h('button', { class: 'btn sm', onclick: () => setOnly('mpesa') }, 'All M-Pesa'), h('button', { class: 'btn sm', onclick: () => setOnly('card') }, 'All card'), S.feats.accounts && c.customer ? h('button', { class: 'btn sm', onclick: () => setOnly('account') }, 'All on account') : null),
        h('div', { class: 'pay-row' }, h('span', { class: 'muted' }, 'Discount'), fields.discount, h('span', { class: 'muted small' }, canDiscount ? (can('manager') ? 'Amount off the total' : `Up to ${t.cashier_max_discount}%`) : 'Manager only')),
        needsRx ? h('label', { class: 'check notice' }, fields.rx, 'I have checked a valid prescription for the Rx items') : null,
        changeEl,
      ];
    },
    foot: (close) => [
      h('button', { class: 'btn', onclick: () => complete(!autoPrint, close) }, autoPrint ? 'Complete, no receipt' : 'Complete & print'),
      h('button', { class: 'btn primary big', onclick: () => complete(autoPrint, close) }, autoPrint ? (isPhone() ? 'Complete & print' : 'Complete & print (Enter)') : isPhone() ? 'Complete' : 'Complete (Enter)'),
    ],
  });
  update();
}

// keyboard shortcuts on the selling screen
document.addEventListener('keydown', (e) => {
  if (S.page !== 'pos' || !S.cart || $('#modal-root').children.length) return;
  const typing = e.target.tagName === 'INPUT' && e.target.id !== 'pos-search';
  if (e.key === 'F2') {
    e.preventDefault();
    $('#pos-search') && $('#pos-search').focus();
  } else if (e.key === 'F9') {
    e.preventDefault();
    openPay();
  } else if (e.key === 'F4') {
    e.preventDefault();
    holdCart();
  } else if (!typing && S.cart.sel >= 0 && $('#pos-search').value === '') {
    if (e.key === '+' ) { e.preventDefault(); changeQty(S.cart.sel, 1); }
    else if (e.key === '-') { e.preventDefault(); changeQty(S.cart.sel, -1); }
    else if (e.key === 'Delete') { e.preventDefault(); removeLine(S.cart.sel); }
  }
});

// ================= tables =================
async function pageTables(main) {
  const tables = await api('listTables');
  const wrap = h('div', { class: 'page' });
  add(wrap, 
    h('div', { class: 'page-head' }, h('h1', {}, 'Tables'), h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: showHeld }, 'All open orders'), can('manager') ? h('button', { class: 'btn', onclick: manageTables }, 'Edit tables') : null),
    h(
      'div',
      { class: 'floor' },
      tables.map((t) =>
        h(
          'div',
          {
            class: 'table-tile' + (t.open_sale_id ? ' busy' : ''),
            onclick: async () => {
              if (t.open_sale_id) {
                const s = await tryApi('getSale', { id: t.open_sale_id });
                if (s) loadSaleIntoCart(s);
              } else S.cart = { ...newCart(), table_id: t.id, table_name: t.name };
              go('pos');
            },
          },
          h('b', {}, t.name),
          t.open_sale_id ? [h('span', { class: 'badge warn' }, 'Occupied'), h('div', { class: 'num', style: 'text-align:left;font-weight:700' }, money(t.open_total))] : h('span', { class: 'badge green' }, 'Free')
        )
      )
    )
  );
  add(main, wrap);
}

async function manageTables() {
  const tables = await api('listTables');
  modal({
    title: 'Edit tables',
    body: (close) => [
      h('table', { class: 'list' }, tables.map((t) => h('tr', {}, h('td', {}, t.name), h('td', { style: 'text-align:right' }, h('button', { class: 'btn sm', onclick: async () => { const n = await promptBox('Rename table', 'Name', t.name); if (n && (await tryApi('saveTable', { id: t.id, name: n }))) { close(); go('tables'); } } }, 'Rename'), ' ', h('button', { class: 'btn sm danger', onclick: async () => { if (await tryApi('deleteTable', { id: t.id })) { close(); go('tables'); } } }, 'Remove'))))),
      h('button', { class: 'btn', onclick: async () => { const n = await promptBox('Add table', 'Table name', 'Table ' + (tables.length + 1)); if (n && (await tryApi('saveTable', { name: n }))) { close(); go('tables'); } } }, '+ Add table'),
    ],
  });
}

// ================= sales history =================
async function pageSales(main) {
  const st = (S.salesFilter = S.salesFilter || { from: todayStr(), to: todayStr(), q: '' });
  const wrap = h('div', { class: 'page' });
  const listBox = h('div', { class: 'card' });
  const load = async () => {
    const rows = await tryApi('listSales', st);
    if (!rows) return;
    const done = rows.filter((r) => r.status === 'completed');
    put(listBox, 
      rows.length
        ? h(
            'table',
            { class: 'list' },
            h('tr', {}, h('th', {}, 'Receipt'), h('th', {}, 'Time'), h('th', {}, isSchool() ? 'Served by' : 'Cashier'), h('th', {}, 'Customer'), h('th', {}, 'Paid by'), h('th', { class: 'num' }, 'Total')),
            rows.map((r) =>
              h(
                'tr',
                { class: 'click', onclick: () => showSale(r.id, load) },
                h('td', {}, h('b', {}, r.receipt_no), r.status === 'void' ? h('span', { class: 'badge red', style: 'margin-left:6px' }, 'Void') : null),
                h('td', {}, fmtDate(r.completed_at)),
                h('td', {}, r.cashier),
                h('td', {}, r.customer_name || '—'),
                h('td', {}, (r.methods || '').replace('mpesa', 'M-Pesa')),
                h('td', { class: 'num', style: r.status === 'void' ? 'text-decoration:line-through;color:var(--muted)' : '' }, money(r.total))
              )
            ),
            h('tr', {}, h('td', { colspan: 5 }, h('b', {}, `${done.length} sale(s)`)), h('td', { class: 'num' }, h('b', {}, money(done.reduce((a, r) => a + r.total, 0)))))
          )
        : h('div', { class: 'empty' }, 'No sales in this period.')
    );
  };
  add(wrap, 
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Sales'),
      h('span', { class: 'spacer' }),
      h('input', { class: 'input', type: 'date', value: st.from, style: 'width:auto', onchange: (e) => { st.from = e.target.value; load(); } }),
      h('span', { class: 'muted' }, 'to'),
      h('input', { class: 'input', type: 'date', value: st.to, style: 'width:auto', onchange: (e) => { st.to = e.target.value; load(); } }),
      h('input', { class: 'input', placeholder: 'Receipt, customer or M-Pesa code', value: st.q, style: 'width:260px', oninput: (e) => { st.q = e.target.value; load(); } })
    ),
    can('manager') ? null : h('div', { class: 'muted small' }, 'Showing your own sales.'),
    listBox
  );
  add(main, wrap);
  load();
}

async function showSale(id, after) {
  const s = await tryApi('getSale', { id });
  if (!s) return;
  const methodName = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', account: 'On account' };
  modal({
    title: `Receipt ${s.receipt_no || ''}`,
    wide: true,
    body: [
      h('div', { class: 'row wrap' }, s.status === 'void' ? h('span', { class: 'badge red' }, 'VOID: ' + s.void_reason) : h('span', { class: 'badge green' }, 'Completed'), h('span', { class: 'muted' }, fmtDate(s.completed_at)), h('span', { class: 'muted' }, '· ' + s.cashier), s.customer_name ? h('span', {}, '· ' + s.customer_name) : null, s.table_name ? h('span', {}, '· ' + s.table_name) : null),
      h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'num' }, 'Qty'), h('th', { class: 'num' }, 'Price'), h('th', { class: 'num' }, 'Total')), s.items.map((i) => h('tr', {}, h('td', {}, i.name), h('td', { class: 'num' }, qtyFmt(i.qty)), h('td', { class: 'num' }, money(i.price)), h('td', { class: 'num' }, money(i.total))))),
      h('div', { class: 'grid2' }, h('div', {}, h('div', { class: 'section-title' }, 'Payments'), s.payments.map((p) => h('div', { class: 'row' }, h('span', {}, p.amount < 0 ? 'Change given' : methodName[p.method]), p.reference && p.amount > 0 ? h('span', { class: 'muted' }, p.reference) : null, h('span', { class: 'spacer' }), h('span', { class: 'num' }, money(p.amount))))), h('div', { class: 'totals' }, h('div', {}, h('span', {}, 'Subtotal'), h('span', {}, money(s.subtotal))), s.discount ? h('div', {}, h('span', {}, 'Discount'), h('span', {}, '-' + money(s.discount))) : null, h('div', {}, h('span', {}, 'VAT included'), h('span', {}, money(s.tax))), h('div', { class: 'grand' }, h('span', {}, 'Total'), h('span', {}, money(s.total))))),
    ],
    foot: (close) => [
      can('manager') && s.status === 'completed'
        ? h('button', { class: 'btn danger', onclick: async () => { const reason = await promptBox('Void sale', 'Reason (stock and account balances will be reversed)'); if (!reason) return; if (await tryApi('voidSale', { id: s.id, reason })) { toast('Sale voided.'); close(); await loadCatalog(); after && after(); } } }, 'Void sale')
        : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: () => printJob('receipt', { sale: s, copy: true }) }, 'Reprint receipt'),
    ],
  });
}

// ================= products =================
async function pageProducts(main) {
  const st = (S.prodFilter = S.prodFilter || { q: '', cat: '', inactive: false });
  const wrap = h('div', { class: 'page' });
  const box = h('div', { class: 'card' });
  const load = async () => {
    const rows = await tryApi('listProducts', { q: st.q, categoryId: st.cat ? Number(st.cat) : null, includeInactive: st.inactive });
    if (!rows) return;
    put(box, 
      rows.length
        ? h(
            'table',
            { class: 'list' },
            h('tr', {}, h('th', {}, 'Product'), h('th', {}, 'Category'), h('th', {}, S.feats.barcode ? 'Barcode / SKU' : 'SKU'), h('th', { class: 'num' }, 'Cost'), h('th', { class: 'num' }, 'Price'), S.feats.stock ? h('th', { class: 'num' }, 'Stock') : null, S.feats.batches ? h('th', {}, 'Next expiry') : null, h('th', {})),
            rows.map((p) =>
              h(
                'tr',
                {},
                h('td', {}, h('b', { style: p.active ? '' : 'color:var(--muted)' }, p.name), p.requires_prescription ? h('span', { class: 'badge warn', style: 'margin-left:6px' }, 'Rx') : null, p.active ? null : h('span', { class: 'badge', style: 'margin-left:6px' }, 'Inactive')),
                h('td', {}, p.category || '—'),
                h('td', { class: 'small' }, [p.barcode, p.sku].filter(Boolean).join(' · ') || '—'),
                h('td', { class: 'num' }, money(p.cost)),
                h('td', { class: 'num' }, h('b', {}, money(p.price))),
                S.feats.stock ? h('td', { class: 'num' }, p.track_stock ? h('span', { class: p.stock <= p.reorder_level ? 'badge ' + (p.stock <= 0 ? 'red' : 'warn') : '' }, `${qtyFmt(p.stock)} ${p.unit}`) : h('span', { class: 'muted' }, '—'),
                  S.feats.batches && p.track_stock && p.unbatched > 0 ? h('div', {}, h('span', { class: 'badge red', style: 'white-space:nowrap', title: 'Can’t be sold until it has a batch number and expiry date' }, `${qtyFmt(p.unbatched)} no batch`)) : null) : null,
                S.feats.batches ? h('td', {}, p.next_expiry || '—') : null,
                h(
                  'td',
                  { style: 'text-align:right;white-space:nowrap' },
                  h('button', { class: 'btn sm', onclick: () => editProduct(p, load) }, 'Edit'),
                  S.feats.batches && p.track_stock && p.unbatched > 0 ? [' ', h('button', { class: 'btn sm primary', onclick: () => giveBatch(p, load) }, 'Give batch')] : null,
                  S.feats.stock && p.track_stock ? [' ', h('button', { class: 'btn sm', onclick: () => receiveStock(p, load) }, 'Receive'), ' ', h('button', { class: 'btn sm', onclick: () => adjustStock(p, load) }, 'Adjust'), ' ', h('button', { class: 'btn sm', onclick: () => productHistory(p) }, 'History')] : null
                )
              )
            )
          )
        : h('div', { class: 'empty' }, 'No products found.')
    );
  };
  const cats = await api('listCategories');
  add(wrap, 
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Products'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: manageCategories }, 'Categories'),
      S.feats.stock ? h('button', { class: 'btn', onclick: () => go('stocktake') }, 'Stock take') : null,
      h('button', { class: 'btn', onclick: exportProducts, title: 'Save all products as a CSV file (opens in Excel)' }, '⬇ Export'),
      can('admin') ? h('button', { class: 'btn', onclick: () => openImport('products'), title: 'Add or update products from a CSV file' }, '⬆ Import') : null,
      h('button', { class: 'btn primary', onclick: () => editProduct(null, load) }, '+ Add product')
    ),
    h(
      'div',
      { class: 'row' },
      h('input', { class: 'input', placeholder: 'Search name, SKU or barcode', value: st.q, style: 'max-width:340px', oninput: (e) => { st.q = e.target.value; load(); } }),
      h('select', { class: 'input', style: 'max-width:220px', onchange: (e) => { st.cat = e.target.value; load(); } }, h('option', { value: '' }, 'All categories'), cats.map((c) => h('option', { value: c.id, selected: String(c.id) === st.cat }, c.name))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: st.inactive, onchange: (e) => { st.inactive = e.target.checked; load(); } }), 'Show inactive')
    ),
    box
  );
  add(main, wrap);
  load();
}

async function editProduct(p, after) {
  const cats = await api('listCategories');
  const isNew = !p;
  p = p || { track_stock: S.feats.stock ? 1 : 0, unit: 'pc', active: 1 };
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  let photo = p.photo || '';
  const photoBox = h('div', { class: 'photo-box' });
  const drawPhoto = () => put(photoBox, productPic({ ...p, photo, name: p.name || 'New' }, 'pic big'));
  drawPhoto();
  add(body, 
    h('div', { class: 'row', style: 'gap:14px;align-items:flex-start' },
      photoBox,
      h('div', { style: 'flex:1;display:flex;flex-direction:column;gap:12px' }, field('Name', inp('name', p.name, { autofocus: true })),
        h('div', { class: 'row', style: 'gap:8px' }, h('button', { class: 'btn sm', onclick: async () => { const u = await pickPhoto(320, 0.78); if (u) { photo = u; drawPhoto(); } } }, '📷 Photo'), h('button', { class: 'btn sm', onclick: () => { photo = ''; drawPhoto(); } }, 'Remove photo'), h('span', { class: 'muted small' }, 'Optional. Shows on the till.')))),
    h('div', { class: 'grid2' }, field('Category', sel('category_id', [['', '— none —'], ...cats.map((c) => [c.id, c.name])], p.category_id)), field('Unit', inp('unit', p.unit, { placeholder: 'pc, kg, box, plate…' }))),
    h('div', { class: 'grid2' }, field('Selling price (VAT incl.)', inp('price', p.price, { type: 'number', step: '0.01', min: 0 })), field('Buying cost', inp('cost', p.cost, { type: 'number', step: '0.01', min: 0 }))),
    h('div', { class: 'grid2' }, S.feats.barcode ? field('Barcode', inp('barcode', p.barcode, { placeholder: 'Scan here' })) : null, field('SKU / code', inp('sku', p.sku)), field(`VAT % (blank = ${S.tenant.default_tax_rate}%)`, inp('tax_rate', p.tax_rate ?? '', { type: 'number', step: '0.01' }))),
    S.feats.stock ? h('div', { class: 'grid2' }, chk('track_stock', 'Track stock for this item', p.track_stock), field('Reorder when stock falls to', inp('reorder_level', p.reorder_level || 0, { type: 'number' }))) : null,
    isNew && S.feats.stock
      ? h('div', { class: S.feats.batches ? 'grid3' : 'grid2' }, field('Opening stock', inp('opening_stock', '', { type: 'number', min: 0 })), S.feats.batches ? field('Batch no. *', inp('batch_no')) : null, S.feats.batches ? field('Expiry date *', inp('expiry_date', '', { type: 'date' })) : null)
      : null,
    h('div', { class: 'row' }, S.feats.batches ? chk('requires_prescription', 'Prescription only (Rx)', p.requires_prescription) : null, !isNew ? chk('active', 'Active (shown at the till)', p.active) : null)
  );
  modal({
    title: isNew ? 'Add product' : 'Edit product',
    body,
    foot: (close) => [
      h('button', { class: 'btn', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: async () => { const d = formData(body); if (isNew) d.active = true; d.category_id = d.category_id ? Number(d.category_id) : null; if (!S.feats.stock) d.track_stock = false; const r = await tryApi('saveProduct', { ...d, id: p.id, photo: photo === (p.photo || '') ? undefined : photo }); if (r) { toast('Product saved.'); close(); await loadCatalog(); after && after(); } } }, 'Save'),
    ],
  });
}

// Pharmacies: stock that has no batch number / expiry date can't be sold. Give it one (all or part of it).
function giveBatch(p, after) {
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  add(body,
    h('div', { class: 'muted' }, `${qtyFmt(p.unbatched)} ${p.unit} of ${p.name} has no batch, so the till won’t sell it. Look at the boxes on the shelf and enter their batch number and expiry date. If boxes have different batches, do it once for each.`),
    h('div', { class: 'grid3' }, field('Quantity', inp('qty', p.unbatched, { type: 'number', min: 0, step: 'any' })), field('Batch no. *', inp('batch_no', '', { autofocus: true })), field('Expiry date *', inp('expiry_date', '', { type: 'date' }))));
  modal({
    title: 'Give batch — ' + p.name,
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
      const r = await tryApi('giveBatch', { ...formData(body), product_id: p.id });
      if (!r) return;
      toast(r.unbatched > 0 ? `Saved. ${qtyFmt(r.unbatched)} ${p.unit} still has no batch.` : 'Saved. All of it can be sold now.');
      close();
      await loadCatalog().catch(() => {});
      refreshBadges();
      after && after();
    } }, 'Save')],
  });
}

function receiveStock(p, after) {
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  add(body, 
    h('div', { class: 'muted' }, `Current stock: ${qtyFmt(p.stock)} ${p.unit}`),
    h('div', { class: 'grid2' }, field('Quantity received', inp('qty', '', { type: 'number', min: 0, autofocus: true })), field('Cost per unit', inp('cost', p.cost, { type: 'number', step: '0.01' }))),
    S.feats.batches ? h('div', { class: 'grid2' }, field('Batch no. *', inp('batch_no')), field('Expiry date *', inp('expiry_date', '', { type: 'date' }))) : null,
    field('Supplier / delivery note', inp('note'))
  );
  modal({
    title: 'Receive stock — ' + p.name,
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { if (await tryApi('receiveStock', { ...formData(body), product_id: p.id })) { toast('Stock received.'); close(); await loadCatalog(); after && after(); } } }, 'Receive')],
  });
}

async function adjustStock(p, after) {
  const hist = S.feats.batches ? await api('productHistory', { product_id: p.id }) : { batches: [] };
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  add(body, 
    h('div', { class: 'muted' }, `Current stock: ${qtyFmt(p.stock)} ${p.unit}. Use a minus sign to remove (e.g. -3).`),
    h('div', { class: 'grid2' }, field('Change by', inp('qty', '', { type: 'number', autofocus: true })), field('Reason', sel('reason', [['damaged', 'Damaged'], ['expired', 'Expired'], ['theft / loss', 'Theft / loss'], ['own use', 'Own use'], ['correction', 'Count correction'], ['returned to supplier', 'Returned to supplier'], ['other', 'Other']], 'damaged'))),
    S.feats.batches && hist.batches.length ? field('Batch', sel('batch_id', [['', '— no batch —'], ...hist.batches.map((b) => [b.id, `${b.batch_no || 'Batch'} · exp ${b.expiry_date} · ${qtyFmt(b.qty)} left`])])) : null,
    field('Note', inp('note'))
  );
  modal({
    title: 'Adjust stock — ' + p.name,
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { const d = formData(body); d.batch_id = d.batch_id ? Number(d.batch_id) : null; if (await tryApi('adjustStock', { ...d, product_id: p.id })) { toast('Stock adjusted.'); close(); await loadCatalog(); after && after(); } } }, 'Save')],
  });
}

async function productHistory(p) {
  const d = await tryApi('productHistory', { product_id: p.id });
  if (!d) return;
  modal({
    title: 'Stock history — ' + p.name,
    wide: true,
    body: [
      d.batches.length ? [h('div', { class: 'section-title' }, 'Batches in stock'), h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Batch'), h('th', {}, 'Expiry'), h('th', { class: 'num' }, 'Qty')), d.batches.map((b) => h('tr', {}, h('td', {}, b.batch_no || '—'), h('td', {}, b.expiry_date, b.expiry_date < todayStr() ? h('span', { class: 'badge red', style: 'margin-left:6px' }, 'Expired') : null), h('td', { class: 'num' }, qtyFmt(b.qty)))))] : null,
      h('div', { class: 'section-title' }, 'Movements'),
      h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'What'), h('th', {}, 'Ref'), h('th', {}, 'By'), h('th', { class: 'num' }, 'Qty')), d.movements.map((m) => h('tr', {}, h('td', {}, fmtDate(m.created_at)), h('td', {}, m.reason, m.batch_no ? h('span', { class: 'muted small' }, ' · ' + m.batch_no) : null), h('td', { class: 'small' }, m.ref), h('td', {}, m.user || '—'), h('td', { class: 'num', style: m.qty < 0 ? 'color:var(--danger)' : 'color:var(--ok)' }, (m.qty > 0 ? '+' : '') + qtyFmt(m.qty))))),
    ],
  });
}

// ================= stock take =================
async function pageStockTake(main) {
  const wrap = h('div', { class: 'page' });
  add(main, wrap);
  if (S.stockTakeView) return stockTakeReport(wrap, S.stockTakeView);
  const st = await tryApi('stockTakeStatus');
  if (st) return stockTakeCount(wrap, st.id);
  if (!can('manager')) return add(wrap, h('div', { class: 'card pad muted' }, 'No stock take is open. A manager starts one.'));
  const [hist, cats] = await Promise.all([tryApi('listStockTakes'), api('listCategories')]);
  const nameIn = inp('name', 'Stock take ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }));
  const catSel = sel('category_id', [['', 'All products'], ...cats.map((c) => [c.id, 'Only ' + c.name])], '');
  add(wrap,
    h('div', { class: 'page-head' }, h('h1', {}, 'Stock take')),
    h('div', { class: 'card pad stack', style: 'gap:12px' },
      h('h2', {}, 'Start a stock take'),
      h('div', { class: 'muted' }, 'The system notes what it expects now. Staff then count the shelves — on this computer or on phones — and the count is saved as they go, so it can take hours or days. Selling can continue; sales made while counting are taken into account. Stock only changes when a manager presses Finish.'),
      h('div', { class: 'grid2' }, field('Name', nameIn), field('What to count', catSel)),
      h('div', {}, h('button', { class: 'btn primary', onclick: async () => { if (await tryApi('startStockTake', { name: nameIn.value, category_id: catSel.value })) { refreshBadges(); renderShell(); } } }, 'Start stock take'))),
    h('div', { class: 'card' }, h('div', { class: 'card pad', style: 'border:0;box-shadow:none' }, h('h2', {}, 'Past stock takes')),
      hist && hist.length
        ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Stock take'), h('th', {}, 'Finished'), h('th', { class: 'num' }, 'Counted'), h('th', { class: 'num' }, 'Differences'), h('th', { class: 'num' }, 'Short (cost)'), h('th', { class: 'num' }, 'Extra (cost)'), h('th', {})),
            hist.map((t) => h('tr', { class: 'click', onclick: () => { S.stockTakeView = t.id; go('stocktake'); } }, h('td', {}, h('b', {}, t.name)), h('td', {}, t.finished_at ? fmtDate(t.finished_at) + (t.finished_by ? ' · ' + t.finished_by : '') : '—'),
              h('td', { class: 'num' }, `${t.counted || 0}/${t.lines || 0}`), h('td', { class: 'num' }, t.differences || 0), h('td', { class: 'num' }, t.short_value ? h('span', { style: 'color:var(--danger)' }, money(t.short_value)) : '0.00'), h('td', { class: 'num' }, money(t.extra_value || 0)), h('td', { style: 'text-align:right' }, h('button', { class: 'btn sm' }, 'Open')))))
        : h('div', { class: 'empty' }, 'No stock takes yet.')));
}

async function stockTakeCount(wrap, id) {
  let d = await tryApi('getStockTake', { id });
  if (!d) return;
  const t = d.take;
  const mgr = !d.blind;
  let filter = S.stFilter || 'todo';
  let q = '';
  const progress = h('div', { class: 'muted' });
  const tableBox = h('div', { class: 'card', style: 'overflow:auto' });
  const drawProgress = () => {
    const c = d.lines.filter((l) => l.counted !== null).length;
    put(progress, `Counted ${c} of ${d.lines.length}`, mgr ? ` · ${d.lines.filter((l) => l.counted !== null && l.counted !== l.expected).length} difference(s)` : '');
  };
  const save = async (l, value, addOne) => {
    const r = await tryApi('countStockTake', { id: t.id, lines: [{ line_id: l.id, counted: value, add: !!addOne }] });
    if (!r) return false;
    l.counted = r[0].counted;
    if (mgr) l.difference = l.counted === null ? null : r2(l.counted - l.expected);
    l.counted_by = S.user.name;
    drawProgress();
    return true;
  };
  const label = (l) => [h('b', {}, l.name), l.batch_no ? h('div', { class: 'small muted' }, `Batch ${l.batch_no} · exp ${l.expiry_date}`) : l.no_batch ? h('div', { class: 'small', style: 'color:var(--danger)' }, 'No batch') : null];
  const shown = () => d.lines.filter((l) => {
    if (q && !(`${l.name} ${l.barcode || ''} ${l.sku || ''} ${l.batch_no || ''}`.toLowerCase().includes(q))) return false;
    if (filter === 'todo') return l.counted === null;
    if (filter === 'done') return l.counted !== null;
    if (filter === 'diff') return l.counted !== null && l.counted !== l.expected;
    return true;
  });
  const drawTable = () => {
    const rows = shown();
    put(tableBox, rows.length
      ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Product'), mgr ? h('th', { class: 'num' }, 'System') : null, h('th', { class: 'num' }, 'Counted'), mgr ? h('th', { class: 'num' }, 'Difference') : null, h('th', {})),
          rows.slice(0, 600).map((l) => {
            const diffCell = h('td', { class: 'num' });
            const drawDiff = () => put(diffCell, l.difference === null || l.difference === undefined ? '' : h('span', { style: l.difference < 0 ? 'color:var(--danger);font-weight:700' : l.difference > 0 ? 'color:var(--ok);font-weight:700' : '' }, (l.difference > 0 ? '+' : '') + qtyFmt(l.difference)));
            drawDiff();
            const input = h('input', { class: 'input num', type: 'number', min: 0, step: 'any', inputmode: 'decimal', style: 'width:110px', value: l.counted ?? '', placeholder: '—',
              onchange: async (e) => { if (await save(l, e.target.value)) { drawDiff(); e.target.classList.add('saved'); } },
              onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.dispatchEvent(new Event('change')); const all = [...tableBox.querySelectorAll('input')]; const nx = all[all.indexOf(e.target) + 1]; nx ? nx.focus() : searchIn.focus(); } } });
            return h('tr', {}, h('td', {}, label(l)), mgr ? h('td', { class: 'num' }, qtyFmt(l.expected)) : null, h('td', { class: 'num' }, input), mgr ? diffCell : null,
              h('td', { class: 'small muted' }, l.counted !== null && l.counted_by ? l.counted_by : ''));
          }), rows.length > 600 ? h('tr', {}, h('td', { colspan: 5, class: 'muted' }, `Showing 600 of ${rows.length}. Search to find the rest.`)) : null)
      : h('div', { class: 'empty' }, filter === 'todo' && !q ? 'Everything has been counted.' : 'Nothing here.'));
  };
  // scan a barcode (or type a code and press Enter): +1 to that item
  const searchIn = h('input', { class: 'input', placeholder: 'Scan a barcode to add 1, or type to search', style: 'max-width:420px', autofocus: true,
    oninput: (e) => { q = e.target.value.trim().toLowerCase(); drawTable(); },
    onkeydown: async (e) => {
      if (e.key !== 'Enter') return;
      const code = e.target.value.trim();
      if (!code) return;
      const hits = d.lines.filter((l) => l.barcode === code || l.sku === code);
      if (!hits.length) return;
      e.preventDefault();
      let l = hits[0];
      if (hits.length > 1) {
        l = await new Promise((res) => modal({ title: 'Which batch?', body: (close) => h('div', { class: 'stack' }, hits.map((x) => h('button', { class: 'btn', onclick: () => { close(); res(x); } }, x.batch_no ? `Batch ${x.batch_no} · exp ${x.expiry_date}` : 'No batch'))), onClose: () => res(null) }));
        if (!l) return;
      }
      if (await save(l, 1, true)) { toast(`${l.name}: ${qtyFmt(l.counted)}`); e.target.value = ''; q = ''; drawTable(); }
    } });
  const chips = () => tabs([['todo', 'Not counted'], ['done', 'Counted'], mgr ? ['diff', 'Differences'] : null, ['all', 'All']], filter, (f) => { filter = S.stFilter = f; put(chipBox, chips()); drawTable(); });
  const chipBox = h('div', {}, chips());
  const finish = async () => {
    d = await tryApi('getStockTake', { id: t.id });
    const s = d.summary;
    const uncounted = s.lines - s.counted;
    const choice = sel('uncounted', [['keep', 'Leave them as they are (not counted)'], ['zero', 'Set them to 0 (not found on the shelf)']], 'keep');
    modal({
      title: 'Finish ' + t.name,
      body: h('div', { class: 'stack', style: 'gap:10px' },
        h('div', {}, `Counted ${s.counted} of ${s.lines}. ${s.differences} difference(s).`),
        h('div', { class: 'grid2' }, h('div', { class: 'card pad' }, h('div', { class: 'muted small' }, 'Short (at cost)'), h('div', { style: 'font-size:22px;font-weight:800;color:var(--danger)' }, money(s.short_value, true)), h('div', { class: 'small muted' }, `${s.short_lines} item(s)`)),
          h('div', { class: 'card pad' }, h('div', { class: 'muted small' }, 'Extra (at cost)'), h('div', { style: 'font-size:22px;font-weight:800' }, money(s.extra_value, true)), h('div', { class: 'small muted' }, `${s.extra_lines} item(s)`))),
        uncounted ? field(`${uncounted} item(s) were not counted`, choice) : null,
        h('div', { class: 'muted small' }, 'Stock is corrected by the difference found, so anything sold while counting stays sold. This cannot be undone (a backup is made every day).')),
      foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Back'), h('button', { class: 'btn primary', onclick: async () => {
        const r = await tryApi('finishStockTake', { id: t.id, uncounted: choice.value });
        if (!r) return;
        close();
        toast('Stock updated.');
        await loadCatalog().catch(() => {});
        refreshBadges();
        S.stockTakeView = t.id;
        renderShell();
      } }, 'Finish & update stock')],
    });
  };
  const addFound = async () => {
    const prods = [...new Map(d.lines.map((l) => [l.product_id, l.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const body = h('div', { class: 'stack', style: 'gap:12px' });
    add(body, h('div', { class: 'muted' }, 'A batch on the shelf that is not on the list.'),
      field('Product', sel('product_id', [['', '— choose —'], ...prods.map(([id, n]) => [id, n])], '')),
      h('div', { class: 'grid3' }, field('Batch no. *', inp('batch_no')), field('Expiry date *', inp('expiry_date', '', { type: 'date' })), field('Counted', inp('counted', '', { type: 'number', min: 0 }))));
    modal({ title: 'Batch found on the shelf', body, foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { if (await tryApi('addStockTakeLine', { ...formData(body), id: t.id })) { close(); renderShell(); } } }, 'Add')] });
  };
  const exportSheet = () => saveCsv(`${t.name.replace(/[^a-z0-9]+/gi, '-')}.csv`, d.lines, [['name', 'Product'], ['batch_no', 'Batch'], ['expiry_date', 'Expiry'], ...(mgr ? [['expected', 'System']] : []), [(l) => l.counted ?? '', 'Counted'], ...(mgr ? [[(l) => l.difference ?? '', 'Difference']] : []), ['counted_by', 'Counted by']]);
  drawProgress();
  drawTable();
  add(wrap,
    h('div', { class: 'page-head' }, h('h1', {}, t.name), h('span', { class: 'badge warn' }, 'Counting'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: exportSheet, title: 'Paper count sheet / Excel' }, '⬇ Sheet'),
      d.batches ? h('button', { class: 'btn', onclick: addFound }, '+ Batch found') : null,
      mgr ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('Cancel this stock take?', 'Counts are thrown away and stock stays as it is.', 'Cancel stock take', true)) { if (await tryApi('cancelStockTake', { id: t.id })) { refreshBadges(); renderShell(); } } } }, 'Cancel') : null,
      mgr ? h('button', { class: 'btn primary', onclick: finish }, 'Finish…') : null),
    h('div', { class: 'row', style: 'flex-wrap:wrap;gap:10px' }, searchIn, chipBox, h('span', { class: 'spacer' }), progress),
    d.blind ? h('div', { class: 'muted small' }, 'Count what is on the shelf and type the number. It saves by itself.') : null,
    tableBox);
  setTimeout(() => searchIn.focus(), 50);
}

async function stockTakeReport(wrap, id) {
  const d = await tryApi('getStockTake', { id });
  if (!d) return;
  const t = d.take;
  const s = d.summary;
  const diffs = d.lines.filter((l) => l.counted !== null && l.difference);
  const back = () => { S.stockTakeView = null; go('stocktake'); };
  const html = () => `<!doctype html><html><head><meta charset="utf-8"><style>body{font:12px/1.4 'Segoe UI',sans-serif;margin:14mm}h1{font-size:18px;margin:0}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left}.r{text-align:right}.neg{color:#b33a2e}</style></head><body>
    <h1>${escHtml(S.tenant.name)} — ${escHtml(t.name)}</h1><div>Started ${escHtml(t.started_at)} by ${escHtml(t.started_by_name)} · Finished ${escHtml(t.finished_at || '')} by ${escHtml(t.finished_by_name)}</div>
    <p>Counted ${s.counted} of ${s.lines} · ${s.differences} difference(s) · Short ${money(s.short_value)} · Extra ${money(s.extra_value)} (at cost, ${escHtml(S.tenant.currency)})</p>
    <table><tr><th>Product</th><th>Batch</th><th class="r">System</th><th class="r">Counted</th><th class="r">Difference</th><th class="r">Value</th><th>Counted by</th></tr>
    ${diffs.map((l) => `<tr><td>${escHtml(l.name)}</td><td>${escHtml(l.batch_no || '')}</td><td class="r">${qtyFmt(l.expected)}</td><td class="r">${qtyFmt(l.counted)}</td><td class="r ${l.difference < 0 ? 'neg' : ''}">${l.difference > 0 ? '+' : ''}${qtyFmt(l.difference)}</td><td class="r">${money(l.value)}</td><td>${escHtml(l.counted_by)}</td></tr>`).join('')}</table>
    <p style="margin-top:30px">Checked by ____________________ &nbsp; Signature ____________________</p></body></html>`;
  add(wrap,
    h('div', { class: 'page-head' }, h('button', { class: 'btn', onclick: back }, '← Back'), h('h1', {}, t.name), t.status === 'done' ? h('span', { class: 'badge green' }, 'Finished') : null, h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => saveCsv(`${t.name.replace(/[^a-z0-9]+/gi, '-')}-differences.csv`, diffs, [['name', 'Product'], ['batch_no', 'Batch'], ['expiry_date', 'Expiry'], ['expected', 'System'], ['counted', 'Counted'], ['difference', 'Difference'], ['cost', 'Cost each'], ['value', 'Value'], ['counted_by', 'Counted by']]) }, '⬇ Excel'),
      !isPhone() ? h('button', { class: 'btn', onclick: () => printHtml(html()) }, 'Print') : null),
    h('div', { class: 'muted' }, `Started ${fmtDate(t.started_at)} by ${t.started_by_name || '—'} · finished ${t.finished_at ? fmtDate(t.finished_at) : '—'} by ${t.finished_by_name || '—'}${t.category ? ' · only ' + t.category : ''}`),
    h('div', { class: 'stats' },
      h('div', { class: 'card stat' }, h('div', { class: 'k' }, 'Counted'), h('div', { class: 'v' }, `${s.counted}/${s.lines}`)),
      h('div', { class: 'card stat' }, h('div', { class: 'k' }, 'Differences'), h('div', { class: 'v' }, String(s.differences))),
      h('div', { class: 'card stat' }, h('div', { class: 'k' }, 'Short (at cost)'), h('div', { class: 'v', style: 'color:var(--danger)' }, money(s.short_value)), h('div', { class: 'muted small' }, `${s.short_lines} item(s)`)),
      h('div', { class: 'card stat' }, h('div', { class: 'k' }, 'Extra (at cost)'), h('div', { class: 'v' }, money(s.extra_value)), h('div', { class: 'muted small' }, `${s.extra_lines} item(s)`))),
    h('div', { class: 'card' }, diffs.length
      ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Product'), h('th', { class: 'num' }, 'System'), h('th', { class: 'num' }, 'Counted'), h('th', { class: 'num' }, 'Difference'), h('th', { class: 'num' }, 'Value'), h('th', {}, 'Counted by')),
          diffs.sort((a, b) => a.value - b.value).map((l) => h('tr', {}, h('td', {}, h('b', {}, l.name), l.batch_no ? h('div', { class: 'small muted' }, `Batch ${l.batch_no} · exp ${l.expiry_date}`) : null), h('td', { class: 'num' }, qtyFmt(l.expected)), h('td', { class: 'num' }, qtyFmt(l.counted)),
            h('td', { class: 'num', style: l.difference < 0 ? 'color:var(--danger);font-weight:700' : 'color:var(--ok);font-weight:700' }, (l.difference > 0 ? '+' : '') + qtyFmt(l.difference)), h('td', { class: 'num' }, money(l.value)), h('td', { class: 'small' }, l.counted_by))))
      : h('div', { class: 'empty' }, 'No differences — everything matched.')));
}

async function stockTake(after) {
  const rows = (await api('listProducts')).filter((p) => p.track_stock);
  const inputs = new Map();
  modal({
    title: 'Stock take',
    wide: true,
    body: [
      h('div', { class: 'muted' }, 'Enter what is physically on the shelf. Leave blank to skip an item. Differences are saved as adjustments.'),
      h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Product'), h('th', { class: 'num' }, 'System'), h('th', { class: 'num' }, 'Counted')), rows.map((p) => { const i = h('input', { class: 'input num', type: 'number', style: 'width:110px' }); inputs.set(p.id, i); return h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, qtyFmt(p.stock)), h('td', { class: 'num' }, i)); })),
    ],
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { const counts = [...inputs].filter(([, i]) => i.value !== '').map(([id, i]) => ({ product_id: id, counted: Number(i.value) })); if (!counts.length) return toast('Nothing counted.', true); const r = await tryApi('stockTake', { counts }); if (r) { toast(`${r.changed} item(s) adjusted.`); close(); await loadCatalog(); after && after(); } } }, 'Save count')],
  });
}

async function manageCategories() {
  const cats = await api('listCategories');
  modal({
    title: 'Categories',
    body: (close) => [
      cats.length ? h('table', { class: 'list' }, cats.map((c) => h('tr', {}, h('td', {}, c.name), h('td', { style: 'text-align:right' }, h('button', { class: 'btn sm', onclick: async () => { const n = await promptBox('Rename category', 'Name', c.name); if (n && (await tryApi('saveCategory', { id: c.id, name: n }))) { close(); await loadCatalog(); manageCategories(); } } }, 'Rename'), ' ', h('button', { class: 'btn sm danger', onclick: async () => { if (await confirmBox('Delete category', `Delete "${c.name}"? Its products stay, without a category.`, 'Delete', true)) { await tryApi('deleteCategory', { id: c.id }); close(); await loadCatalog(); manageCategories(); } } }, 'Delete'))))) : h('div', { class: 'empty' }, 'No categories yet.'),
      h('button', { class: 'btn', onclick: async () => { const n = await promptBox('New category', 'Name'); if (n && (await tryApi('saveCategory', { name: n }))) { close(); await loadCatalog(); manageCategories(); } } }, '+ Add category'),
    ],
    onClose: () => S.page === 'products' && go('products'),
  });
}

// ================= stock alerts =================
async function pageStock(main) {
  const days = (S.expDays = S.expDays || 90);
  const a = await api('stockAlerts', { days });
  const wrap = h('div', { class: 'page' });
  add(wrap, 
    h('div', { class: 'page-head' }, h('h1', {}, 'Stock alerts')),
    a.no_batch && a.no_batch.length
      ? h('div', { class: 'card' }, h('div', { class: 'card pad stack', style: 'border:0;box-shadow:none;gap:6px' }, h('h2', {}, `No batch or expiry date — can’t be sold (${a.no_batch.length})`),
          h('div', { class: 'muted small' }, 'Give each one its batch number and expiry date from the boxes. For many products at once: Products → ⬇ Export, fill in “Batch no” and “Expiry date” in Excel (one row per batch), then ⬆ Import.')),
        h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Product'), h('th', { class: 'num' }, 'Without batch'), h('th', {})),
          a.no_batch.map((p) => h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, h('span', { class: 'badge red' }, `${qtyFmt(p.unbatched)} ${p.unit}`)),
            h('td', { style: 'text-align:right' }, can('manager') ? h('button', { class: 'btn sm primary', onclick: () => giveBatch(p, () => go('stock')) }, 'Give batch') : null)))))
      : null,
    h('div', { class: 'card' }, h('div', { class: 'card pad', style: 'border:0;box-shadow:none' }, h('h2', {}, `Low stock (${a.low.length})`)), a.low.length ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Product'), h('th', { class: 'num' }, 'In stock'), h('th', { class: 'num' }, 'Reorder level')), a.low.map((p) => h('tr', {}, h('td', {}, p.name), h('td', { class: 'num' }, h('span', { class: 'badge ' + (p.stock <= 0 ? 'red' : 'warn') }, `${qtyFmt(p.stock)} ${p.unit}`)), h('td', { class: 'num' }, qtyFmt(p.reorder_level))))) : h('div', { class: 'empty' }, 'Nothing is running low.')),
    S.feats.batches
      ? h('div', { class: 'card' }, h('div', { class: 'row card pad', style: 'border:0;box-shadow:none' }, h('h2', {}, `Expired or expiring (${a.expiring.length})`), h('span', { class: 'spacer' }), h('span', { class: 'muted' }, 'within'), h('select', { class: 'input', style: 'width:auto', onchange: (e) => { S.expDays = Number(e.target.value); go('stock'); } }, [30, 60, 90, 180].map((d) => h('option', { value: d, selected: d === days }, d + ' days')))), a.expiring.length ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Product'), h('th', {}, 'Batch'), h('th', {}, 'Expiry'), h('th', { class: 'num' }, 'Qty')), a.expiring.map((b) => h('tr', {}, h('td', {}, b.name), h('td', {}, b.batch_no || '—'), h('td', {}, b.expiry_date, ' ', b.expiry_date < a.today ? h('span', { class: 'badge red' }, 'Expired — remove from shelf') : h('span', { class: 'badge warn' }, 'Expiring')), h('td', { class: 'num' }, `${qtyFmt(b.qty)} ${b.unit}`)))) : h('div', { class: 'empty' }, 'No batches expiring in this period.'))
      : null
  );
  add(main, wrap);
}

// ================= customers =================
async function pageCustomers(main) {
  const wrap = h('div', { class: 'page' });
  const box = h('div', { class: 'card' });
  let q = '';
  const load = async () => {
    const rows = await tryApi('listCustomers', { q });
    if (!rows) return;
    put(box, 
      rows.length
        ? h(
            'table',
            { class: 'list' },
            h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Account no.'), h('th', {}, 'Phone'), h('th', {}, 'Notes'), h('th', { class: 'num' }, 'Limit'), h('th', { class: 'num' }, 'Balance'), h('th', {})),
            rows.map((c) =>
              h(
                'tr',
                {},
                h('td', {}, h('b', {}, c.name)),
                h('td', {}, c.account_no || '—'),
                h('td', {}, c.phone || '—'),
                h('td', { class: 'small muted' }, c.notes),
                h('td', { class: 'num' }, money(c.credit_limit)),
                h('td', { class: 'num' }, h('span', { class: 'badge ' + (c.balance > 0 ? 'red' : c.balance < 0 ? 'green' : '') }, balanceText(c))),
                h('td', { style: 'text-align:right;white-space:nowrap' }, h('button', { class: 'btn sm', onclick: () => takePayment(c, load) }, c.balance > 0 ? 'Receive payment' : 'Top up'), ' ', h('button', { class: 'btn sm', onclick: () => statement(c) }, 'Statement'), ' ', h('button', { class: 'btn sm', onclick: () => editCustomer(c, load) }, 'Edit'))
              )
            )
          )
        : h('div', { class: 'empty' }, 'No customers yet.')
    );
  };
  add(wrap, 
    h('div', { class: 'page-head' }, h('h1', {}, S.tenant.business_type === 'canteen' ? 'Students & accounts' : 'Customers & accounts'), h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: () => editCustomer(null, load) }, '+ Add customer')),
    h('div', { class: 'muted small' }, 'Balance above zero = the customer owes you. Below zero = prepaid credit (e.g. a student’s canteen money). Credit limit is how much they may owe.'),
    h('input', { class: 'input', placeholder: 'Search', style: 'max-width:340px', oninput: (e) => { q = e.target.value; load(); } }),
    box
  );
  add(main, wrap);
  load();
}

function editCustomer(c, after) {
  const isNew = !c;
  c = c || {};
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  add(body, 
    field('Name', inp('name', c.name, { autofocus: true })),
    h('div', { class: 'grid2' }, field(S.tenant.business_type === 'canteen' ? 'Admission / account no.' : 'Account no.', inp('account_no', c.account_no)), field('Phone', inp('phone', c.phone))),
    h('div', { class: 'grid2' }, field(S.tenant.business_type === 'canteen' ? 'Class / notes' : 'Notes', inp('notes', c.notes)), field('Credit limit (may owe up to)', inp('credit_limit', c.credit_limit || 0, { type: 'number', disabled: !can('manager') })))
  );
  modal({
    title: isNew ? 'Add customer' : 'Edit customer',
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { const r = await tryApi('saveCustomer', { ...formData(body), id: c.id }); if (r) { close(); const list = await api('listCustomers', {}); after && after(list.find((x) => x.id === r.id)); } } }, 'Save')],
  });
}

function takePayment(c, after) {
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  add(body, 
    h('div', {}, h('b', {}, c.name), ' — ', balanceText(c)),
    h('div', { class: 'grid2' }, field('Amount', inp('amount', c.balance > 0 ? c.balance : '', { type: 'number', step: '0.01', autofocus: true })), field('Paid by', sel('method', [['cash', 'Cash'], ['mpesa', 'M-Pesa'], ['card', 'Card'], ['bank', 'Bank']], 'cash'))),
    field('Reference (M-Pesa code, slip no.)', inp('reference', '', { style: 'text-transform:uppercase' }))
  );
  modal({
    title: c.balance > 0 ? 'Receive payment' : 'Top up account',
    body,
    foot: (close) => [
      h('button', { class: 'btn', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: async () => { const d = formData(body); d.reference = d.reference.toUpperCase(); const r = await tryApi('customerPayment', { ...d, customer_id: c.id }); if (r) { toast(`Received ${money(d.amount)}. New balance: ${balanceText(r)}.`); close(); after && after(); } } }, 'Save'),
    ],
  });
}

async function statement(c) {
  const d = await tryApi('customerStatement', { customer_id: c.id });
  if (!d) return;
  const kind = { purchase: 'Purchase', payment: 'Payment / top-up', void: 'Voided sale', opening: 'Opening balance (old system)' };
  modal({
    title: 'Statement — ' + d.name,
    wide: true,
    body: [
      h('div', { class: 'row' }, h('span', {}, 'Current: ', h('b', {}, balanceText(d))), h('span', { class: 'spacer' }), h('button', { class: 'btn sm', onclick: () => saveCsv(`statement-${d.name}.csv`, d.transactions, [['created_at', 'Date'], [(r) => kind[r.kind] || r.kind, 'Type'], ['receipt_no', 'Receipt'], ['method', 'Method'], ['reference', 'Reference'], ['amount', 'Amount']]) }, 'Export CSV')),
      d.transactions.length ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Type'), h('th', {}, 'Ref'), h('th', {}, 'By'), h('th', { class: 'num' }, 'Amount')), d.transactions.map((x) => h('tr', {}, h('td', {}, fmtDate(x.created_at)), h('td', {}, kind[x.kind] || x.kind, x.method ? h('span', { class: 'muted small' }, ' · ' + x.method) : null), h('td', {}, x.receipt_no || x.reference || ''), h('td', {}, x.user || '—'), h('td', { class: 'num' }, (x.amount > 0 ? '+' : '') + money(x.amount))))) : h('div', { class: 'empty' }, 'No transactions yet.'),
    ],
  });
}

// ================= reports =================
async function pageReports(main) {
  const st = (S.repFilter = S.repFilter || { from: todayStr(), to: todayStr() });
  const wrap = h('div', { class: 'page' });
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:16px' });
  const methodName = { cash: 'Cash (after change)', mpesa: 'M-Pesa', card: 'Card', account: 'On account' };
  let last;
  const load = async () => {
    const r = (last = await tryApi('report', st));
    if (!r) return;
    const s = r.summary;
    const stat = (k, v, sub) => h('div', { class: 'card stat' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), sub ? h('div', { class: 'muted small' }, sub) : null);
    const tbl = (title, cols, rows) => h('div', { class: 'card' }, h('div', { class: 'card pad', style: 'border:0;box-shadow:none;padding-bottom:4px' }, h('h2', {}, title)), rows.length ? h('table', { class: 'list' }, h('tr', {}, cols.map((c) => h('th', { class: c[2] ? 'num' : '' }, c[1]))), rows.map((row) => h('tr', {}, cols.map((c) => h('td', { class: c[2] ? 'num' : '' }, c[2] === 'm' ? money(row[c[0]]) : c[2] === 'q' ? qtyFmt(row[c[0]]) : typeof c[0] === 'function' ? c[0](row) : row[c[0]]))))) : h('div', { class: 'empty' }, 'No data.'));
    put(body, 
      h('div', { class: 'stats' }, stat('Net sales', money(s.net), `${s.count} sale(s)`), stat('Gross profit', money(s.profit), s.net ? `${Math.round((s.profit / s.net) * 100)}% margin` : ''), stat('VAT in sales', money(s.tax)), stat('Discounts', money(s.discount)), stat('Voided', money(s.void_amount), `${s.voids} sale(s)`), S.feats.accounts ? stat('Owed by customers', money(r.accountsOwed), 'all time') : null, S.feats.stock ? stat('Stock value (cost)', money(r.stockValue), 'right now') : null),
      h('div', { class: 'grid2' }, tbl('By payment method', [[(x) => methodName[x.method] || x.method, 'Method'], ['count', 'Sales', 'q'], ['amount', 'Amount', 'm']], r.byMethod), tbl(isSchool() ? 'By staff' : 'By cashier', [['name', isSchool() ? 'Served by' : 'Cashier'], ['count', 'Sales', 'q'], ['amount', 'Amount', 'm']], r.byCashier)),
      S.feats.stylists ? tbl('Stylists & commission', [['name', 'Stylist'], ['services', 'Services', 'q'], ['amount', 'Sales (after discounts)', 'm'], [(x) => qtyFmt(x.commission_pct) + '%', 'Rate'], ['commission', 'Commission', 'm']], r.byStylist || []) : null,
      tbl('Top products', [['name', 'Product'], ['qty', 'Qty', 'q'], ['amount', 'Sales', 'm'], ['profit', 'Profit', 'm']], r.topProducts),
      r.byDay.length > 1 ? tbl('By day', [['day', 'Day'], ['count', 'Sales', 'q'], ['amount', 'Amount', 'm']], r.byDay) : null
    );
  };
  const preset = (label, from, to) => h('button', { class: 'btn sm', onclick: () => { st.from = from; st.to = to; go('reports'); } }, label);
  const d = new Date();
  const iso = (x) => x.toLocaleDateString('en-CA');
  const monthStart = iso(new Date(d.getFullYear(), d.getMonth(), 1));
  const weekStart = iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
  const yest = iso(new Date(Date.now() - 864e5));
  add(wrap, 
    h(
      'div',
      { class: 'page-head' },
      h('h1', {}, 'Reports'),
      h('span', { class: 'spacer' }),
      preset('Today', todayStr(), todayStr()),
      preset('Yesterday', yest, yest),
      preset('This week', weekStart, todayStr()),
      preset('This month', monthStart, todayStr()),
      h('input', { class: 'input', type: 'date', value: st.from, style: 'width:auto', onchange: (e) => { st.from = e.target.value; load(); } }),
      h('span', { class: 'muted' }, 'to'),
      h('input', { class: 'input', type: 'date', value: st.to, style: 'width:auto', onchange: (e) => { st.to = e.target.value; load(); } }),
      h('button', { class: 'btn', onclick: () => last && printJob('summary', { report: last }) }, 'Print summary'),
      h('button', { class: 'btn', onclick: async () => saveCsv(`sales_${st.from}_${st.to}.csv`, await api('listSales', st), [['receipt_no', 'Receipt'], ['completed_at', 'Date'], ['status', 'Status'], ['cashier', 'Cashier'], ['customer_name', 'Customer'], ['methods', 'Paid by'], ['total', 'Total']]) }, 'Export sales CSV')
    ),
    body
  );
  add(main, wrap);
  load();
}

function zReportHtml(r) {
  const t = S.tenant;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const w = paperWidth();
  const line = (k, v) => `<tr><td>${esc(k)}</td><td class="r">${v}</td></tr>`;
  const methodName = { cash: 'Cash', mpesa: 'M-Pesa', card: 'Card', account: 'On account' };
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${w}mm auto;margin:0}body{width:${w - 6}mm;margin:2mm 3mm;font:11px/1.4 Consolas,monospace}h1{font-size:14px;text-align:center;margin:0}table{width:100%}.r{text-align:right}hr{border:0;border-top:1px dashed #000}</style></head><body>
  <h1>${esc(t.name)}</h1><div style="text-align:center">SALES SUMMARY<br>${r.from}${r.to !== r.from ? ' to ' + r.to : ''}<br>Printed ${new Date().toLocaleString()} by ${esc(S.user.name)}</div><hr>
  <table>${line('Sales count', r.summary.count)}${line('Gross', money(r.summary.gross))}${line('Discounts', money(r.summary.discount))}${line('NET SALES', '<b>' + money(r.summary.net) + '</b>')}${line('VAT included', money(r.summary.tax))}${line('Voided', `${r.summary.voids} / ${money(r.summary.void_amount)}`)}</table><hr>
  <table>${r.byMethod.map((m) => line(methodName[m.method] || m.method, money(m.amount))).join('')}</table><hr>
  <table>${r.byCashier.map((c) => line(c.name, money(c.amount))).join('')}</table><hr><br></body></html>`;
}

// ================= users =================
async function pageUsers(main) {
  const rows = await api('listUsers');
  const wrap = h('div', { class: 'page' });
  add(wrap, 
    h('div', { class: 'page-head' }, h('h1', {}, isSchool() ? 'Staff logins' : 'Users'), h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: () => editUser(null) }, isSchool() ? '+ Add staff' : '+ Add user')),
    h('div', { class: 'muted small' }, isSchool() ? 'Teacher / staff: registers, marks, timetable (and fees or the school shop only if they handle money). Deputy / manager: also pupils, fees, exams, timetables and reports. Head teacher / admin: also staff logins, settings and backups.' : 'Cashier: sell, hold orders, customers. Manager: also products, stock, reports, voids, price changes and discounts. Admin: also users, settings and backups.'),
    h('div', { class: 'card' }, rows.length ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Username'), h('th', {}, isSchool() ? 'Access' : 'Role'), h('th', {}, 'Till PIN'), h('th', {}, 'Status'), h('th', {})), rows.map((u) => h('tr', {}, h('td', {}, h('b', {}, u.name)), h('td', {}, u.username), h('td', {}, u.title ? [u.title, h('div', { class: 'muted small' }, roleLabel(u.role))] : roleLabel(u.role)), h('td', {}, u.has_pin ? h('span', { class: 'badge green' }, 'Set') : h('span', { class: 'muted' }, '—'), u.is_stylist ? h('span', { class: 'badge warn', style: 'margin-left:6px' }, `✂ ${qtyFmt(u.commission_pct)}%`) : null), h('td', {}, u.active ? h('span', { class: 'badge green' }, 'Active') : h('span', { class: 'badge' }, 'Disabled')), h('td', { style: 'text-align:right' }, h('button', { class: 'btn sm', onclick: () => editUser(u) }, 'Edit'))))) : h('div', { class: 'empty' }, S.user.role === 'owner' ? 'No staff yet. You are signed in as the system owner.' : 'No users.'))
  );
  add(main, wrap);
}

function editUser(u) {
  const isNew = !u;
  u = u || { role: 'cashier', active: 1, money: isSchool() ? 0 : 1 };
  const roles = ['cashier', 'manager', 'admin'].filter((r) => RANK[r] <= RANK[S.user.role]).map((r) => [r, roleLabel(r)]);
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
  const pinInput = inp('pin', '', { type: 'password', inputMode: 'numeric', maxLength: 4, placeholder: u.has_pin ? 'Leave blank to keep' : '4 digits', oninput: (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4)) });
  add(body,
    field('Full name', inp('name', u.name, { autofocus: true })),
    isSchool() ? field('Job title', h('input', { class: 'input', name: 'title', value: u.title || '', list: 'job-titles-u', placeholder: 'e.g. Teacher, Bursar, Cook' })) : null,
    isSchool() ? h('datalist', { id: 'job-titles-u' }, ['Teacher', 'Head teacher', 'Deputy head teacher', 'Bursar', 'Secretary', 'Cook', 'Driver', 'Security', 'Cleaner'].map((t) => h('option', { value: t }))) : null,
    h('div', { class: 'grid2' }, field(isSchool() ? 'Access' : 'Role', sel('role', roles, u.role)), field(u.has_pin ? 'New till PIN' : 'Till PIN (4 digits)', pinInput)),
    h('div', { class: 'muted small' }, isSchool() ? 'Most staff need just a name and PIN to sign in. A username and password are only needed for the full login screen (e.g. the head teacher).' : 'Staff who only use the till need just a name and PIN. A username and password are only needed to sign in with the full login screen.'),
    h('div', { class: 'grid2' }, field('Username (optional)', inp('username', u.username, { placeholder: 'made from the name if blank' })), field(isNew ? 'Password (optional)' : 'New password (leave blank to keep)', inp('password', '', { type: 'password' }))),
    S.feats.stylists
      ? h('div', { class: 'grid2' }, h('div', { style: 'align-self:end' }, chk('is_stylist', 'Does services (stylist / barber / therapist)', u.is_stylist)), field('Commission on their services (%)', inp('commission_pct', u.commission_pct || 0, { type: 'number', min: 0, max: 100 })))
      : null,
    S.feats.stylists ? h('div', { class: 'muted small' }, 'Stylists who never use the till need no PIN or password — they only appear when choosing who did a service.') : null,
    chk('money', isSchool() ? 'Handles money: receives fees and sells in the school shop (e.g. bursar). Leave off for teachers.' : 'Can take money: sell, receive payments and fees (staff role only; managers always can)', u.money !== 0),
    !isNew && u.has_pin ? chk('removePin', 'Remove this person’s PIN (they disappear from the till screen)', false) : null,
    !isNew ? chk('active', 'Account active', u.active) : null
  );
  modal({
    title: isNew ? (isSchool() ? 'Add staff' : 'Add user') : (isSchool() ? 'Edit staff' : 'Edit user'),
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { const d = formData(body); if (isNew) d.active = true; if (d.pin && !/^\d{4}$/.test(d.pin)) return toast('PIN must be exactly 4 digits.', true); if (await tryApi('saveUser', { ...d, id: u.id })) { toast('User saved.'); close(); go('users'); } } }, 'Save')],
  });
}

// ================= settings =================
// Settings → Start fresh (system owner): clear everything on this computer / phone to set it up for a new customer.
function startFreshCard() {
  const where = isPhone() ? 'this phone' : 'this computer';
  return h('div', { class: 'card pad danger-zone', style: 'display:flex;flex-direction:column;gap:10px' },
    h('h2', {}, 'Start fresh'),
    h('div', { class: 'muted' }, `Removes every business, user, product, sale, customer, pupil and fee record on ${where}, so you can set it up for a new customer. The app then opens on the first-time setup screen.`),
    h('div', {}, h('button', { class: 'btn danger', onclick: startFresh }, 'Start fresh…')));
}

async function startFresh() {
  const where = isPhone() ? 'this phone' : 'this computer';
  const biz = (await tryApi('loginOptions')) || [];
  const body = h('div', { class: 'stack', style: 'gap:12px' },
    h('div', { class: 'notice' }, h('b', {}, 'This removes ALL data on ', where, ':'), ' ', biz.length ? biz.map((b) => b.name).join(', ') : 'every business', ', with their users, sales, stock, customers, pupils, fees and exams.'),
    h('div', { class: 'muted small' }, 'A safety copy is saved first (in the backups folder) in case you need it back: Settings → Backups → Restore. Businesses linked to the online dashboard stay there; delete them in the dashboard if they were only for testing.'),
    field('Your owner password', inp('password', '', { type: 'password', autocomplete: 'current-password' })),
    field('Type START FRESH to confirm', inp('confirm', '', { placeholder: 'START FRESH', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false })));
  modal({
    title: 'Start fresh',
    body,
    foot: (close) => [
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: close }, 'Cancel'),
      h('button', { class: 'btn danger', onclick: async () => {
        const d = formData(body);
        const r = await window.pos.startFresh({ password: d.password, confirm: d.confirm });
        if (!r.ok) return toast(r.error, true);
        close();
        for (const k of ['tillTenant', 'lastTenant']) prefs.set(k, null);
        Object.assign(S, { session: null, user: null, tenant: null, cart: null, dash: null });
        if (typeof SCH !== 'undefined') SCH.info = null;
        toast('Everything was cleared. Set up the new customer.');
        boot();
      } }, 'Remove everything'),
    ],
  });
}

// Settings → Logo & colours: shown on screens, receipts, report cards, ID cards and the school website.
function brandingCard(t) {
  const st = { logo: t.logo || '', brand: t.brand || 'davetech' };
  const box = h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:14px' });
  const admin = can('admin');
  const draw = () => {
    const b = brandOf({ brand: st.brand === 'davetech' ? '' : st.brand });
    const custom = /^#/.test(st.brand);
    put(box,
      h('h2', {}, 'Logo & colours'),
      h('div', { class: 'muted small', style: 'margin-top:-8px' }, isSchool() ? 'Shown on the menu, school home, report cards, fee receipts, statements, ID cards and your school website.' : 'Shown on the menu and on printed receipts.'),
      h('div', { class: 'row', style: 'gap:16px;align-items:flex-start;flex-wrap:wrap' },
        h('div', { class: 'logo-box' }, st.logo ? h('img', { src: st.logo, alt: 'Logo' }) : h('span', { class: 'muted small', style: 'text-align:center' }, 'No logo yet')),
        h('div', { class: 'stack', style: 'gap:8px' },
          admin ? h('button', { class: 'btn', onclick: async () => { const u = await pickLogo(); if (u) { st.logo = u; draw(); } } }, st.logo ? 'Change logo' : 'Choose logo picture') : null,
          admin && st.logo ? h('button', { class: 'btn', onclick: () => { st.logo = ''; draw(); } }, 'Remove logo') : null,
          h('div', { class: 'muted small', style: 'max-width:260px' }, 'A PNG with a clear background looks best. It is made small automatically.'))),
      field(isSchool() ? 'Motto (optional)' : 'Slogan (optional)', inp('motto', box.dataset.motto ?? t.motto ?? '', { placeholder: isSchool() ? 'e.g. Strive for excellence' : 'e.g. Quality you can trust', oninput: (e) => (box.dataset.motto = e.target.value) })),
      h('div', { class: 'section-title' }, 'Colour'),
      h('div', { class: 'swatches' },
        Object.entries(BRANDS).map(([k, [label, side, acc]]) => h('button', { class: 'swatch' + (st.brand === k ? ' on' : ''), disabled: !admin, onclick: () => { st.brand = k; draw(); } }, h('i', { style: `background:linear-gradient(90deg, ${side} 0 50%, ${acc} 50% 100%)` }), h('span', {}, label))),
        h('label', { class: 'swatch' + (custom ? ' on' : ''), style: 'position:relative' }, h('i', { style: `background:${custom ? st.brand : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)'}` }), h('span', {}, 'Own colour…'),
          h('input', { type: 'color', value: custom ? st.brand : '#1d5fd1', disabled: !admin, style: 'position:absolute;inset:0;opacity:0;cursor:pointer', onchange: (e) => { st.brand = e.target.value; draw(); } }))),
      h('div', { class: 'brand-preview' },
        h('div', { style: `background:${b.side};color:#fff;padding:12px 14px;width:42%;display:flex;align-items:center;gap:10px` }, st.logo ? h('img', { src: st.logo, style: 'width:36px;height:36px;object-fit:contain;background:#fff;border-radius:8px;padding:2px' }) : null, h('b', {}, t.name)),
        h('div', { style: 'flex:1;background:#fff;padding:12px 14px;display:flex;align-items:center;gap:10px' }, h('span', { style: `background:${b.grad};color:#fff;border-radius:8px;padding:7px 14px;font-weight:600` }, 'Button'), h('span', { style: `background:${b.soft};border-radius:99px;padding:3px 10px;font-size:12px` }, 'Label'))),
      admin
        ? h('div', {}, h('button', { class: 'btn primary', onclick: async () => {
            const r = await tryApi('saveBranding', { logo: st.logo, brand: st.brand === 'davetech' ? '' : st.brand, motto: box.querySelector('[name=motto]').value });
            if (r) { toast('Logo and colours saved.'); S.tenant = r; S.feats = r.features; if (typeof SCH !== 'undefined') SCH.info = null; renderShell(); }
          } }, 'Save logo & colours'))
        : h('div', { class: 'muted small' }, 'Only an admin can change these.'));
    if (!admin) box.querySelectorAll('input').forEach((el) => (el.disabled = true));
  };
  draw();
  return box;
}

// Business type change: the customer reads a code to Daalpha Systems and types in the answer.
async function changeBusinessType(t) {
  const st = await tryApi('changeTypeStart');
  if (!st) return;
  const types = Object.entries(S.status.businessTypes).filter(([k]) => k !== t.business_type);
  const body = h('div', { class: 'stack', style: 'gap:12px' },
    h('div', { class: 'muted' }, 'The business type decides which screens this business has. To change it, call or WhatsApp Daalpha Systems and read them this code:'),
    h('div', { class: 'recovery-code' }, st.code),
    field('New business type', sel('business_type', types, types[0] && types[0][0])),
    field('Answer code from Daalpha Systems', inp('answer', '', { placeholder: 'XXXX-XXXX', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false })),
    h('div', { class: 'muted small' }, 'Products, sales and customers stay. Features go back to the new type’s defaults.'));
  modal({
    title: 'Change business type',
    body,
    foot: (close) => [
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: async () => {
        const d = formData(body);
        const r = await tryApi('changeTypeFinish', { business_type: d.business_type, answer: d.answer });
        if (!r) return;
        close();
        toast('Business type changed to ' + r.type_label + '.');
        S.tenant = r;
        S.feats = r.features;
        if (typeof SCH !== 'undefined') SCH.info = null;
        await loadCatalog();
        renderShell();
      } }, 'Change type'),
    ],
  });
}

async function pageSettings(main) {
  const t = await api('getSettings');
  const wrap = h('div', { class: 'page' });
  const types = Object.entries(S.status.businessTypes);
  const featLabels = { barcode: 'Barcode scanning', stock: 'Stock tracking', batches: 'Batches & expiry dates', tables: 'Tables', kitchen: 'Kitchen tickets', accounts: 'Customer accounts (credit / prepaid)', stylists: 'Stylists & commission (services)', school: 'School: pupils, classes, fees' };
  const biz = h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:12px' });
  add(biz, 
    h('h2', {}, 'Business'),
    h('div', { class: 'grid2' }, field('Business name', inp('name', t.name)),
      field('Business type', h('div', { class: 'row', style: 'gap:8px' }, h('div', { class: 'input locked', style: 'flex:1' }, '🔒 ', t.type_label || t.business_type), can('admin') ? h('button', { class: 'btn', onclick: () => changeBusinessType(t) }, 'Change…') : null))),
    h('div', { class: 'grid3' }, field('Phone', inp('phone', t.phone)), field('Email', inp('email', t.email)), field('KRA PIN', inp('kra_pin', t.kra_pin))),
    field('Address', inp('address', t.address)),
    h('div', { class: 'grid3' }, field('M-Pesa Till number (Buy Goods)', inp('mpesa_till', t.mpesa_till || '', { inputmode: 'numeric', placeholder: 'e.g. 5123456' })), field('M-Pesa Paybill (optional)', inp('mpesa_paybill', t.mpesa_paybill || '', { inputmode: 'numeric', placeholder: 'e.g. 247247' })), field('Paybill account no.', inp('mpesa_account', t.mpesa_account || '', { placeholder: isSchool() ? 'blank = pupil’s admission no.' : 'e.g. your phone no.' }))),
    h('div', { class: 'muted small', style: 'margin-top:-6px' }, 'Printed on every receipt and bill so customers know where to pay.'),
    h('div', { class: 'grid3' }, field('Currency', inp('currency', t.currency)), field('Default VAT %', inp('default_tax_rate', t.default_tax_rate, { type: 'number' })), field('Receipt number prefix', inp('receipt_prefix', t.receipt_prefix))),
    field('Receipt footer', inp('receipt_footer', t.receipt_footer)),
    h('div', { class: 'grid2' }, field('Max discount a cashier may give (%)', inp('cashier_max_discount', t.cashier_max_discount, { type: 'number' })), h('div', { style: 'align-self:end' }, chk('allow_negative_stock', 'Allow selling when stock shows zero', t.allow_negative_stock))),
    h('div', { class: 'section-title' }, 'Features'),
    h('div', { class: 'grid3', id: 'feats' }, Object.entries(featLabels).map(([k, l]) => h('label', { class: 'check', title: k === 'school' ? 'Set by Daalpha Systems' : '' }, h('input', { type: 'checkbox', 'data-feat': k, checked: t.features[k], 'data-locked': k === 'school' ? '1' : null }), k === 'school' ? '🔒 ' + l : l))),
    h('div', { class: 'muted small' }, 'The business type and the school module are set by Daalpha Systems. Changing them needs a code from Daalpha Systems.'),
    can('admin')
      ? h('div', {}, h('button', { class: 'btn primary', onclick: async () => {
          const d = formData(biz);
          const features = {};
          biz.querySelectorAll('[data-feat]').forEach((el) => { if (!el.dataset.locked) features[el.dataset.feat] = el.checked; });
          const r = await tryApi('saveSettings', { ...d, features });
          if (r) { toast('Settings saved.'); S.tenant = r; S.feats = r.features; renderShell(); }
        } }, 'Save settings'))
      : h('div', { class: 'muted small' }, 'Only an admin can change these.')
  );
  biz.querySelectorAll('input,select').forEach((el) => (el.disabled = !can('admin') || el.dataset.locked === '1'));

  const pr = await printerCard();

  const acct = h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:12px' });
  add(acct, 
    h('h2', {}, 'My account'),
    h('div', { class: 'grid2' }, field('Current password', inp('current', '', { type: 'password' })), field('New password', inp('next', '', { type: 'password' }))),
    h('div', {}, h('button', { class: 'btn', onclick: async () => { if (await tryApi('changePassword', formData(acct))) { toast('Password changed.'); acct.querySelectorAll('input').forEach((i) => (i.value = '')); } } }, 'Change password'))
  );
  if (S.user.role !== 'owner') {
    const pinBox = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });
    add(pinBox,
      h('div', { class: 'section-title' }, 'My till PIN'),
      h('div', { class: 'grid2' }, field('Current password or PIN', inp('password', '', { type: 'password' })), field('New 4-digit PIN', inp('pin', '', { type: 'password', inputMode: 'numeric', maxLength: 4, oninput: (e) => (e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4)) }))),
      h('div', {}, h('button', { class: 'btn', onclick: async () => { if (await tryApi('setMyPin', formData(pinBox))) { toast('PIN saved.'); pinBox.querySelectorAll('input').forEach((i) => (i.value = '')); } } }, 'Save PIN')));
    add(acct, pinBox);
  }

  // This computer as a till: sign-in becomes staff list + PIN pad.
  const tillOn = prefs.get('tillTenant', null) === S.tenant.id;
  const till = can('admin')
    ? h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:12px' },
        h('h2', {}, isPhone() ? 'Till mode (this phone)' : 'Till mode (this computer)'),
        h('div', { class: 'muted' }, (isPhone() ? 'When on, the sign-in screen on this phone shows only the staff of ' : 'When on, the sign-in screen on this computer shows only the staff of '), h('b', {}, S.tenant.name), ' and a PIN pad. Give each person a PIN under Users.'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: tillOn, onchange: (e) => { prefs.set('tillTenant', e.target.checked ? S.tenant.id : null); toast(e.target.checked ? 'Till mode on. Sign out to see the PIN screen.' : 'Till mode off.'); } }), isPhone() ? 'Use this phone as a till for this business' : 'Use this computer as a till for this business'),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: prefs.get('autoLogout', true), onchange: (e) => prefs.set('autoLogout', e.target.checked) }), 'Sign the cashier out automatically after each sale (shows the change to give first)'),
        h('div', { class: 'muted small' }, isPhone() ? 'On the PIN screen, press and hold “Tap your name” for 2 seconds to open the normal username/password sign-in (for the owner, or to switch business).' : 'On the PIN screen, press Ctrl + Shift + L (or press and hold “Tap your name”) to open the normal username/password sign-in (for the owner, or to switch business).'))
    : null;

  const data = can('admin') ? await backupCard() : null;
  const online = can('admin') ? await cloudCard() : null;
  const move = can('admin') ? importCard() : null;

  add(wrap, h('div', { class: 'page-head' }, h('h1', {}, 'Settings')), biz, brandingCard(t), online, pr, till, acct, data, move, S.user.role === 'owner' && !isDemo() ? startFreshCard() : null);
  add(main, wrap);
}

// ---------- moving from another system (CSV import) ----------
const IMPORTS = {
  products: {
    title: 'Products & stock', api: 'importProducts',
    fields: [['name', 'Product name', true, /^(product|item)?.?name|description|product$|item$/i], ['category', 'Category', false, /categ|group|department/i], ['price', 'Selling price', false, /sell|^price|retail|unit.?price/i], ['cost', 'Cost / buying price', false, /cost|buy|purchase/i],
      ['stock', 'Stock quantity', false, /stock|qty|quantity|on.?hand|balance/i], ['barcode', 'Barcode', false, /bar.?code|ean|upc/i], ['sku', 'Code / SKU', false, /sku|code|item.?no/i], ['unit', 'Unit', false, /unit|uom/i], ['reorder_level', 'Reorder level', false, /reorder|min/i],
      ['batch_no', 'Batch no. (pharmacies)', false, /batch|lot/i], ['expiry_date', 'Expiry date (pharmacies)', false, /expir|^exp/i]],
    help: 'Products that already exist (same barcode, code or name) are updated, not doubled; new ones are added. Stock is set to the number in the file — if you only want to change prices, choose “— not in file —” for Stock. Pharmacies: one row per batch, with its batch number and expiry date (e.g. 2027-08-31, 08/2027 or Aug 2027); stock without them is not taken in, because it could not be sold.',
  },
  customers: {
    title: 'Customers & balances', api: 'importCustomers',
    fields: [['name', 'Customer name', true, /name|customer/i], ['phone', 'Phone', false, /phone|mobile|tel/i], ['account_no', 'Account / customer no.', false, /acc|cust.*(no|id|code)|code/i], ['balance', 'Balance', false, /bal|owe|debt|credit/i], ['credit_limit', 'Credit limit', false, /limit/i], ['notes', 'Notes', false, /note|address|email/i]],
    help: 'Customers that already exist (same account no., phone or name) are updated. The balance becomes their opening balance.',
  },
  sales: {
    title: 'Past sales (history)', api: 'importSales',
    fields: [['receipt_no', 'Receipt / invoice no.', true, /receipt|invoice|sale.?(no|id)|^id$|ref/i], ['date', 'Date', true, /date|time|created/i], ['total', 'Sale total', false, /^total|grand|amount|net/i], ['item', 'Item name (one row per item)', false, /item|product|description/i],
      ['qty', 'Quantity', false, /qty|quantity/i], ['price', 'Item price', false, /^price|unit.?price/i], ['line_total', 'Item total', false, /line|item.?total|subtotal/i], ['method', 'Paid by', false, /method|pay|mode|tender/i], ['customer', 'Customer', false, /customer|client/i], ['cashier', 'Cashier', false, /cashier|user|served|staff/i], ['discount', 'Discount', false, /disc/i], ['status', 'Status (void?)', false, /status|void|cancel/i], ['reference', 'Payment reference', false, /mpesa|reference|trans/i]],
    help: 'For reports only: past sales never change stock or customer balances (import those above). Each receipt is imported once, so you can import again safely. Imported receipt numbers start with OLD-.',
  },
};

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return { header: (rows.shift() || []).map((x) => x.trim()), rows };
}

// Products → CSV with the same column names Import reads, so a file can go out to Excel and come back.
// Only products in use. Stock is left blank for items that don't count stock, so importing it back leaves them alone.
async function exportProducts() {
  const rows = await tryApi('productsForExport', {});
  if (!rows) return;
  if (!rows.length) return toast('No products to export yet.', true);
  const day = new Date().toLocaleDateString('en-CA');
  const cols = [['name', 'Product name'], ['category', 'Category'], ['price', 'Selling price'], ['cost', 'Cost price']];
  if (S.feats.stock) cols.push([(p) => (p.track_stock ? p.stock : ''), 'Stock'], [(p) => (p.track_stock ? p.reorder_level : ''), 'Reorder level']);
  // long number codes are written ="…" so Excel keeps every digit instead of showing 6.16E+12
  const asText = (v) => (/^\d{9,}$/.test(String(v || '')) ? `="${v}"` : v || '');
  if (S.feats.batches) cols.push(['batch_no', 'Batch no'], ['expiry_date', 'Expiry date']);
  cols.push([(p) => asText(p.barcode), 'Barcode'], [(p) => asText(p.sku), 'SKU'], ['unit', 'Unit']);
  await saveCsv(`products-${S.tenant.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${day}.csv`, rows, cols);
}

function importCard() {
  return h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:10px' },
    h('h2', {}, 'Move from another system'),
    h('div', { class: 'muted small' }, 'Bring in data exported from your old POS as a CSV file (in Excel: File → Save As → CSV). Import products first, then customers, then past sales.'),
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, Object.entries(IMPORTS).map(([k, v]) => h('button', { class: 'btn', onclick: () => openImport(k) }, 'Import ' + v.title.toLowerCase()))));
}

async function openImport(kind) {
  const def = IMPORTS[kind];
  const f = await pickFileBase64('.csv,text/csv,text/plain');
  if (!f) return;
  let csv;
  try {
    const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
    csv = parseCsv(new TextDecoder('utf-8').decode(bytes));
  } catch (e) {
    return toast('Could not read that file. Save it as CSV and try again.', true);
  }
  if (!csv.header.length || !csv.rows.length) return toast('That file is empty or not a CSV.', true);
  // guess which column is which from the header names
  const used = new Set();
  const guess = {};
  for (const [key, , , re] of def.fields) {
    const i = csv.header.findIndex((hd, j) => !used.has(j) && (hd.toLowerCase().replace(/[^a-z0-9]/g, '') === key.replace(/_/g, '') || re.test(hd)));
    if (i >= 0) { guess[key] = i; used.add(i); }
  }
  const sels = {};
  const preview = h('div', { class: 'card', style: 'overflow:auto;max-height:220px' });
  const mapped = () => csv.rows.map((r) => Object.fromEntries(Object.entries(sels).filter(([, el]) => el.value !== '').map(([k, el]) => [k, r[Number(el.value)] ?? ''])));
  const drawPreview = () => {
    const keys = def.fields.filter(([k]) => sels[k].value !== '');
    put(preview, h('table', { class: 'list' }, h('tr', {}, keys.map(([, label]) => h('th', {}, label))), mapped().slice(0, 5).map((r) => h('tr', {}, keys.map(([k]) => h('td', { class: 'small' }, r[k]))))));
  };
  const fields = def.fields.map(([key, label, req]) => {
    sels[key] = h('select', { class: 'input', onchange: drawPreview }, h('option', { value: '' }, req ? '— choose —' : '— not in file —'), csv.header.map((hd, i) => h('option', { value: i, selected: guess[key] === i }, hd || `Column ${i + 1}`)));
    return field(label + (req ? ' *' : ''), sels[key]);
  });
  const extra = kind === 'customers'
    ? field('In the old system, a positive balance means', sel('positive', [['owes', 'the customer owes us'], ['credit', 'the customer has prepaid / credit']], 'owes'))
    : kind === 'sales' ? field('Dates like 05/03/2026 are', sel('date_order', [['dmy', 'day/month/year (5 March)'], ['mdy', 'month/day/year (May 3)']], 'dmy')) : null;
  const body = h('div', { class: 'stack', style: 'gap:12px' },
    h('div', { class: 'muted small' }, `${f.name}: ${csv.rows.length} row(s), ${csv.header.length} column(s). ${def.help}`),
    h('div', { class: 'grid3' }, fields), extra, h('div', { class: 'section-title' }, 'Preview (first 5 rows)'), preview);
  drawPreview();
  modal({
    title: 'Import ' + def.title.toLowerCase(),
    wide: true,
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async (e) => {
      const missing = def.fields.filter(([k, , req]) => req && sels[k].value === '').map(([, l]) => l);
      if (missing.length) return toast('Choose the column for: ' + missing.join(', '), true);
      if (!(await confirmBox('Import now?', `${csv.rows.length} row(s) will be imported into ${S.tenant.name}. A backup is made automatically every day; save one now first if you want to be extra safe.`, 'Import'))) return;
      e.target.disabled = true;
      const opts = formData(body);
      const r = await tryApi(def.api, { rows: mapped(), positive: opts.positive, date_order: opts.date_order });
      e.target.disabled = false;
      if (!r) return;
      close();
      if (typeof loadCatalog === 'function') loadCatalog().catch(() => {});
      modal({
        title: 'Import finished',
        body: h('div', { class: 'stack' },
          h('div', {}, kind === 'sales' ? `${r.created} sale(s) imported (${money(r.total, true)}), ${r.items} item line(s).` : `${r.created} new, ${r.updated} updated.`),
          r.skipped ? h('div', { class: 'muted' }, `${r.skipped} row(s) skipped${kind === 'sales' ? ' (already imported or not readable)' : ''}.`) : null,
          r.errors.length ? h('div', { class: 'card', style: 'max-height:200px;overflow:auto' }, h('table', { class: 'list' }, r.errors.slice(0, 200).map((x) => h('tr', {}, h('td', {}, 'Row ' + x.row), h('td', {}, x.message))))) : null),
        foot: (c) => [r.errors.length ? h('button', { class: 'btn', onclick: () => saveCsv(`import-problems-${kind}.csv`, r.errors, [['row', 'Row'], ['message', 'Problem']]) }, 'Save problems list') : null, h('button', { class: 'btn primary', onclick: c }, 'OK')],
      });
    } }, 'Import')],
  });
}

// ---------- printing (settings, saved on this computer) ----------
async function printerCard() {
  const card = h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:12px' });
  const printers = (await window.pos.printers()).data || [];
  let mode = printerMode();
  const body = h('div', { style: 'display:flex;flex-direction:column;gap:12px' });

  const radio = (value, title, sub) =>
    h('label', { class: 'check', style: 'align-items:flex-start' },
      h('input', { type: 'radio', name: 'pmode', checked: mode === value, onchange: () => { mode = value; prefs.set('printerMode', value); render(); } }),
      h('span', {}, h('b', {}, title), h('div', { class: 'muted small' }, sub)));

  const portSelect = (key, ports, emptyLabel) =>
    h('select', { class: 'input', onchange: (e) => prefs.set(key, e.target.value) },
      h('option', { value: '' }, emptyLabel),
      ports.map((p) => h('option', { value: p.port, selected: prefs.get(key, '') === p.port }, isPhone() ? p.name + (p.printer ? '  🖨' : '') : p.name + (p.bluetooth ? '  ✓ Bluetooth' : ''))),
      // keep a saved port visible even if Windows does not list it right now (printer off)
      prefs.get(key, '') && !ports.some((p) => p.port === prefs.get(key, '')) ? h('option', { value: prefs.get(key, ''), selected: true }, prefs.get(key, '') + ' (not found now)') : null);

  async function render() {
    const parts = [];
    if (mode === 'escpos') {
      const portsBox = h('div', { style: 'display:flex;flex-direction:column;gap:12px' }, h('div', { class: 'muted small' }, 'Looking for printer ports…'));
      parts.push(portsBox);
      put(body, parts, common());
      const res = await window.pos.listPorts();
      const ports = res.ok ? res.data : [];
      put(portsBox,
        res.ok ? null : h('div', { class: 'notice' }, res.error),
        h('div', { class: 'row' }, field(isPhone() ? 'Bluetooth printer' : 'Printer port', portSelect('printerPort', ports, ports.length ? '— choose —' : isPhone() ? 'No paired Bluetooth devices' : 'No COM ports found')), h('button', { class: 'btn', style: 'align-self:end', onclick: render }, 'Refresh')),
        S.feats && S.feats.kitchen ? field(isPhone() ? 'Kitchen printer (optional — leave blank to use the same printer)' : 'Kitchen printer port (optional — leave blank to use the same printer)', portSelect('kitchenPort', ports, 'Same as receipt printer')) : null,
        h('details', {}, h('summary', { class: 'small', style: 'cursor:pointer;color:var(--accent);font-weight:600' }, 'How to connect a Bluetooth printer'),
          isPhone()
          ? h('ol', { class: 'small muted', style: 'margin:8px 0 0;padding-left:18px;line-height:1.7' },
            h('li', {}, 'Switch the printer on and charge it. Holding the feed button while switching on usually prints a self-test page with its Bluetooth name.'),
            h('li', {}, 'On the phone open Settings → Connected devices (or Bluetooth) → Pair new device, and choose the printer. If asked for a PIN, try 0000 or 1234.'),
            h('li', {}, 'Come back here, press Refresh, choose the printer and press Print test page. Allow “Nearby devices” if the phone asks.'),
            h('li', {}, 'Keep the printer close to the phone. The first print can take a few seconds while it connects.'))
          : h('ol', { class: 'small muted', style: 'margin:8px 0 0;padding-left:18px;line-height:1.7' },
            h('li', {}, 'Switch the printer on and charge it. Many print a self-test page if you hold the feed button while switching on — it shows the printer’s Bluetooth name and PIN.'),
            h('li', {}, 'On this PC open Settings → Bluetooth & devices → Add device → Bluetooth, choose the printer. If asked for a PIN, try 0000 or 1234.'),
            h('li', {}, 'Come back here and press Refresh. Bluetooth printers show as “Standard Serial over Bluetooth link (COMx)”. Windows usually creates two — pick one and press Print test page; if nothing prints, try the other.'),
            h('li', {}, 'Keep the printer within a few metres of the PC. The first print after switching on can take a few seconds while it connects.')))
      );
    } else {
      put(body,
        field('Printer', h('select', { class: 'input', onchange: (e) => prefs.set('printerName', e.target.value) },
          h('option', { value: '' }, 'Windows default printer' + ((printers.find((p) => p.isDefault) || {}).name ? ` (${printers.find((p) => p.isDefault).name})` : '')),
          printers.map((p) => h('option', { value: p.name, selected: prefs.get('printerName', '') === p.name }, p.name)))),
        h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: prefs.get('silentPrint', false), onchange: (e) => prefs.set('silentPrint', e.target.checked) }), 'Print straight to the printer (no print dialog)'),
        common());
    }
  }

  function common() {
    return [
      h('div', { class: 'grid2' }, field('Paper width', h('select', { class: 'input', onchange: (e) => prefs.set('receiptWidth', Number(e.target.value)) }, [58, 80].map((w) => h('option', { value: w, selected: paperWidth() === w }, w + ' mm' + (w === 58 ? ' (most Bluetooth / pocket printers)' : ' (wide desktop printers)')))))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: prefs.get('autoPrint', true), onchange: (e) => prefs.set('autoPrint', e.target.checked) }), 'Print a receipt for every sale by default'),
      mode === 'escpos' ? h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: prefs.get('openDrawer', false), onchange: (e) => prefs.set('openDrawer', e.target.checked) }), 'Open the cash drawer on cash sales (drawer plugged into the printer)') : null,
      h('div', {}, h('button', { class: 'btn', onclick: async (e) => { e.target.disabled = true; const ok = await printJob('test'); e.target.disabled = false; if (ok) toast('Test page sent.'); } }, 'Print test page')),
    ];
  }

  add(card,
    h('h2', {}, isPhone() ? 'Receipts & printing (this phone)' : 'Receipts & printing (this computer)'),
    isPhone()
      ? h('div', { class: 'muted small' }, 'Receipts print to a 58 mm or 80 mm Bluetooth receipt printer (ESC/POS) paired with this phone.')
      : h('div', { class: 'grid2' },
          radio('system', 'Windows printer', 'USB or network printers with a driver installed, A4 printers, “Microsoft Print to PDF”.'),
          radio('escpos', 'Bluetooth / serial thermal printer', 'Pocket and desktop 58 mm / 80 mm receipt printers paired over Bluetooth (ESC/POS). No driver needed.')),
    body);
  render();
  return card;
}

// ---------- online dashboard link (settings) ----------
async function cloudCard() {
  const card = h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:12px' });
  const r = await window.pos.cloudStatus();
  if (!r.ok) return null;
  const st = r.data;
  const refresh = async () => card.replaceWith(await cloudCard());
  add(card, h('h2', {}, 'Online dashboard'));
  const cc = await window.pos.cloudConfig();
  const site = cc.ok && cc.data.siteUrl ? cc.data.siteUrl.replace(/\/$/, '') + '/dashboard/' : '';
  if (st.configured && site) {
    add(card, h('div', { class: 'row wrap' },
      h('span', { class: 'muted' }, 'On a phone or any computer, open:'),
      h('b', { style: 'user-select:all;word-break:break-all' }, site),
      h('button', { class: 'btn sm', onclick: async () => { try { await navigator.clipboard.writeText(site); toast('Address copied.'); } catch { toast('Select the address and copy it.', true); } } }, 'Copy')));
  }
  if (!st.configured) {
    add(card, h('div', { class: 'muted' }, 'This version of the app was built without the online dashboard.'));
    return card;
  }
  if (!st.linked) {
    const code = h('input', { class: 'input', placeholder: 'e.g. K7QM-2XPA-9TDV', style: 'text-transform:uppercase;letter-spacing:.08em;max-width:260px' });
    const btn = h('button', { class: 'btn primary', onclick: async () => {
      btn.disabled = true;
      btn.textContent = 'Linking…';
      const res = await window.pos.cloudLink({ code: code.value });
      btn.disabled = false;
      btn.textContent = 'Link';
      if (!res.ok) return toast(res.error, true);
      toast(`Linked to ${res.data.shop_name}. Sales will now appear on the dashboard.`);
      refresh();
    } }, 'Link');
    add(card,
      h('div', { class: 'muted' }, 'See this business’s sales, staff activity and stock from your phone, anywhere. Selling still works without internet — everything is sent when there is a connection.'),
      h('ol', { class: 'small muted', style: 'margin:0;padding-left:18px;line-height:1.7' },
        h('li', {}, 'Open the dashboard and sign in (button on the sign-in screen: “Owner dashboard”).'),
        h('li', {}, 'Add this shop there — you get a till code.'),
        h('li', {}, 'Type the till code here and press Link.')),
      h('div', { class: 'row' }, code, btn));
    return card;
  }
  const line = (label, value) => h('div', { class: 'row' }, h('span', { style: 'min-width:150px' }, label), value);
  add(card,
    line('Linked to', h('b', {}, st.shop_name || 'online shop')),
    line('Last sent', st.last_sync_at ? h('span', {}, fmtDate(st.last_sync_at)) : h('span', { class: 'muted' }, 'not yet')),
    line('Waiting to send', h('span', {}, `${st.pending} item(s)`)),
    st.last_error ? h('div', { class: st.unlinked_online ? 'notice' : 'muted small' }, st.last_error) : null,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onclick: async (e) => { e.target.disabled = true; const res = await window.pos.cloudSyncNow(); e.target.disabled = false; if (!res.ok) toast(res.error, true); else toast('Sent.'); refresh(); } }, 'Send now'),
      h('button', { class: 'btn danger', onclick: async () => {
        if (!(await confirmBox('Unlink', 'Stop sending this business’s data to the online dashboard? Data already online stays there.', 'Unlink', true))) return;
        await window.pos.cloudUnlink();
        refresh();
      } }, st.unlinked_online ? 'Link again…' : 'Unlink')));
  return card;
}

// ---------- backups (settings) ----------
function ago(iso) {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + ' min ago';
  if (mins < 48 * 60) return Math.round(mins / 60) + ' h ago';
  return new Date(iso).toLocaleString();
}

async function backupCard() {
  const r = await window.pos.backupStatus();
  if (!r.ok) return h('div', { class: 'card pad' }, r.error);
  const st = r.data;
  if (st.mobile) return backupCardPhone(st);
  const owner = can('owner');
  const card = h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:12px' });
  const refresh = async () => {
    const fresh = await backupCard();
    card.replaceWith(fresh);
  };

  const statusLine = (label, b, emptyText) =>
    h('div', { class: 'row' },
      h('span', { style: 'width:150px' }, label),
      !b ? h('span', { class: 'muted' }, emptyText)
        : b.ok ? [h('span', { class: 'badge green' }, 'OK'), h('span', {}, ago(b.at)), h('span', { class: 'muted small' }, b.file ? '· ' + b.file.split(/[\\/]/).pop() : '')]
        : [h('span', { class: 'badge red' }, 'Failed'), h('span', {}, ago(b.at)), h('span', { class: 'small', style: 'color:var(--danger)' }, b.error)]
    );

  // --- cloud folder form (owner only) ---
  let folder = st.cloudDir;
  const folderEl = h('input', { class: 'input', value: folder, readOnly: true, placeholder: 'No online backup folder chosen' });
  const setFolder = (p) => { folder = p; folderEl.value = p; };
  const encBox = h('input', { type: 'checkbox', checked: st.encrypt });
  const pw1 = h('input', { class: 'input', type: 'password', placeholder: st.hasPassword ? 'Leave blank to keep the current password' : 'At least 6 characters' });
  const pw2 = h('input', { class: 'input', type: 'password', placeholder: 'Repeat password' });
  const pwRow = h('div', { class: 'grid2' }, field('Backup password', pw1), field('Repeat password', pw2));
  const syncPw = () => (pwRow.style.display = encBox.checked ? '' : 'none');
  encBox.addEventListener('change', syncPw);
  syncPw();

  const save = async () => {
    if (encBox.checked && pw1.value !== pw2.value) return toast('The two passwords do not match.', true);
    if (encBox.checked && pw1.value && !(await confirmBox('Backup password', h('div', {}, h('p', {}, 'Write this password down and keep it somewhere safe, away from this computer.'), h('p', {}, h('b', {}, 'Without it, the online backups cannot be opened — not even by Daalpha Systems.'))), 'I have written it down'))) return;
    const res = await window.pos.saveBackupSettings({ cloudDir: folder, encrypt: encBox.checked, password: pw1.value });
    if (!res.ok) return toast(res.error, true);
    toast(folder ? (res.data.lastCloud && res.data.lastCloud.ok ? 'Online backup is on. First copy saved.' : 'Saved, but the first backup failed — see below.') : 'Online backup turned off.');
    refresh();
  };

  add(card, 
    h('div', { class: 'row' }, h('h2', {}, 'Backups'), h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: async () => { const b = await window.pos.backupNow(); if (!b.ok) toast(b.error, true); else { toast('Backup done.'); refresh(); } } }, 'Back up now')),
    h('div', { class: 'muted' }, 'Backups run a few minutes after every change, every hour, and when the app closes. One file per day is kept for the last 30 days.'),
    statusLine('On this computer', st.lastLocal, 'not yet'),
    statusLine('Online folder', st.lastCloud, st.cloudDir ? 'not yet' : 'off — choose a folder below'),
    h('div', { class: 'section-title' }, 'Online backup (Google Drive / OneDrive)'),
    owner
      ? [
          h('div', { class: 'muted small' }, 'Install the Google Drive or OneDrive app on this computer and sign in with the business’s account. Pick a folder inside it here; the app uploads the backups whenever there is internet. Selling never waits for the internet.'),
          st.suggestions.length
            ? h('div', { class: 'row wrap' }, h('span', { class: 'muted small' }, 'Found on this computer:'), st.suggestions.map((sg) => h('button', { class: 'btn sm', title: sg.path, onclick: () => setFolder(sg.path) }, `Use ${sg.label}`)))
            : h('div', { class: 'notice' }, 'No Google Drive or OneDrive folder found on this computer. Install one of them and sign in first, or choose any folder (a second disk or a shared network folder also works).'),
          h('div', { class: 'row' }, folderEl, h('button', { class: 'btn', onclick: async () => { const p = await window.pos.chooseBackupFolder(); if (p.ok && p.data) setFolder(p.data); } }, 'Choose…'), folder ? h('button', { class: 'btn ghost', onclick: () => setFolder('') }, 'Clear') : null),
          h('div', { class: 'muted small' }, 'Backups go into a “Daalpha Systems Backups” sub-folder, one file per computer per day (this computer: ', h('b', {}, st.computer), ').'),
          h('label', { class: 'check' }, encBox, 'Encrypt online backups with a password (recommended — anyone who gets the file cannot read your sales or customers)'),
          pwRow,
          h('div', { class: 'row wrap' }, h('button', { class: 'btn primary', onclick: save }, 'Save backup settings'), st.cloudDir ? h('button', { class: 'btn', onclick: () => window.pos.openPath(st.cloudDir) }, 'Open online folder') : null, h('button', { class: 'btn', onclick: () => window.pos.openPath(st.localDir) }, 'Open local backups')),
        ]
      : h('div', { class: 'muted small' }, 'Only the system owner can change where online backups go.'),
    h('div', { class: 'section-title' }, 'Manual copy & restore'),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn', onclick: async () => { const b = await window.pos.backup(); if (!b.ok) toast(b.error, true); else if (b.data) toast('Backup saved to ' + b.data); } }, 'Save a copy to flash disk…'),
      owner ? h('button', { class: 'btn danger', onclick: restoreFlow }, 'Restore from backup…') : null
    )
  );
  return card;
}

// Phones: no folders to choose. Copies go to Google Drive (or WhatsApp/email) through Android's share sheet.
async function backupCardPhone(st) {
  const owner = can('owner');
  const card = h('div', { class: 'card pad', style: 'display:flex;flex-direction:column;gap:12px' });
  const refresh = async () => card.replaceWith(await backupCard());
  const days = st.lastShared ? (Date.now() - new Date(st.lastShared.at).getTime()) / 864e5 : Infinity;
  const encBox = h('input', { type: 'checkbox', checked: st.encrypt });
  const pw1 = h('input', { class: 'input', type: 'password', placeholder: st.hasPassword ? 'Leave blank to keep the current password' : 'At least 6 characters' });
  const pw2 = h('input', { class: 'input', type: 'password', placeholder: 'Repeat password' });
  const pwRow = h('div', { class: 'grid2' }, field('Backup password', pw1), field('Repeat password', pw2));
  const syncPw = () => (pwRow.style.display = encBox.checked ? '' : 'none');
  encBox.addEventListener('change', syncPw);
  syncPw();
  const line = (label, b, extra) => h('div', { class: 'row wrap' }, h('span', { style: 'min-width:140px' }, label), b ? [h('span', { class: 'badge ' + (b.ok === false ? 'red' : 'green') }, b.ok === false ? 'Failed' : 'OK'), h('span', {}, ago(b.at))] : h('span', { class: 'badge warn' }, 'never'), extra);
  add(card,
    h('h2', {}, 'Backups'),
    h('div', { class: 'muted' }, 'A copy is saved on this phone automatically every day (last 30 kept). If the phone is lost or the app is removed, those copies go with it — so also save a copy to Google Drive regularly.'),
    line('On this phone', st.lastLocal),
    line('Saved to Drive / shared', st.lastShared, st.lastShared ? h('span', { class: 'muted small' }, st.lastShared.file) : null),
    days > 3 ? h('div', { class: 'notice' }, st.lastShared ? `Your last copy outside this phone is ${Math.floor(days)} days old.` : 'No copy has been saved outside this phone yet.', ' Tap “Back up to Google Drive” and choose Drive.') : null,
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn primary', onclick: async () => { const b = await window.pos.backupNow(); if (!b.ok) toast(b.error, true); else { toast(b.data.lastShared && b.data.lastShared.at && Date.now() - new Date(b.data.lastShared.at).getTime() < 60000 ? 'Backup shared.' : 'Backup saved on this phone.'); refresh(); } } }, 'Back up to Google Drive…'),
      owner ? h('button', { class: 'btn danger', onclick: restoreFlow }, 'Restore from backup…') : null),
    h('div', { class: 'muted small' }, 'In the share list, choose Drive (or WhatsApp / Gmail to send it to yourself). Android’s own backup (Settings → Google → Backup) also copies this app’s data to your Google account when the phone is charging on Wi-Fi.'),
    owner
      ? [h('div', { class: 'section-title' }, 'Protect backups with a password'),
         h('label', { class: 'check' }, encBox, 'Encrypt backups I save to Drive (recommended)'),
         pwRow,
         h('div', {}, h('button', { class: 'btn', onclick: async () => {
           if (encBox.checked && pw1.value !== pw2.value) return toast('The two passwords do not match.', true);
           if (encBox.checked && pw1.value && !(await confirmBox('Backup password', h('div', {}, h('p', {}, 'Write this password down and keep it somewhere safe.'), h('p', {}, h('b', {}, 'Without it, encrypted backups cannot be opened — not even by Daalpha Systems.'))), 'I have written it down'))) return;
           const res = await window.pos.saveBackupSettings({ encrypt: encBox.checked, password: pw1.value });
           if (!res.ok) return toast(res.error, true);
           toast('Backup settings saved.');
           refresh();
         } }, 'Save'))]
      : null);
  return card;
}

// Phones pick the backup file with Android's file picker.
function pickFileBase64(accept) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: 'display:none' });
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f) return resolve(null);
      const rd = new FileReader();
      rd.onload = () => resolve({ name: f.name, base64: String(rd.result).split(',')[1] || '' });
      rd.onerror = () => resolve(null);
      rd.readAsDataURL(f);
    });
    document.body.append(input);
    input.click();
  });
}

async function restoreFlow() {
  let pick;
  if (isPhone()) {
    const file = await pickFileBase64('.sqlite,.dtpos,application/octet-stream,application/x-sqlite3');
    if (!file) return;
    pick = await window.pos.restoreFromBytes(file);
  } else pick = await window.pos.restorePick();
  if (!pick.ok) return toast(pick.error, true);
  if (!pick.data) return;
  const f = pick.data;
  let password = '';
  let useSaved = false;
  if (f.encrypted) {
    if (f.savedPasswordWorks && (await confirmBox('Encrypted backup', 'Use the backup password saved on this computer?', 'Use saved password'))) useSaved = true;
    else {
      password = await promptBoxPassword('Encrypted backup', 'Enter the backup password for ' + f.name);
      if (!password) return;
    }
  }
  const ok = await confirmBox('Restore backup', h('div', {}, h('p', {}, 'Replace ALL current data — every business on this computer — with ', h('b', {}, f.name), '?'), h('p', { class: 'muted' }, 'A safety copy of the current data is saved first.')), 'Replace all data', true);
  if (!ok) return;
  const r = await window.pos.restoreApply({ file: f.path, password, useSaved });
  if (!r.ok) return toast(r.error, true);
  toast('Backup restored. Please sign in again.');
  boot();
}

function promptBoxPassword(title, label) {
  return new Promise((resolve) => {
    let done = false;
    const i = h('input', { class: 'input', type: 'password', autofocus: true });
    const finish = (close) => { done = true; resolve(i.value); close(); };
    modal({
      title,
      body: (close) => { i.addEventListener('keydown', (e) => e.key === 'Enter' && finish(close)); return field(label, i); },
      foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => finish(close) }, 'Continue')],
      onClose: () => !done && resolve(null),
    });
  });
}

// ================= businesses (owner) =================
async function pageBusinesses(main) {
  const rows = await api('listTenants');
  const wrap = h('div', { class: 'page' });
  add(wrap, 
    h('div', { class: 'page-head' }, h('h1', {}, 'Businesses'), h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: addBusiness }, '+ Add business')),
    h('div', { class: 'muted small' }, 'Each business has its own products, staff, customers, sales and receipt numbers. Staff only see the business they sign in to.'),
    h('div', { class: 'card' }, h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Business'), h('th', {}, 'Type'), h('th', { class: 'num' }, 'Staff'), h('th', { class: 'num' }, 'Sales today'), h('th', {}, 'Status'), h('th', {})), rows.map((t) => h('tr', {}, h('td', {}, h('b', {}, t.name), S.tenant && S.tenant.id === t.id ? h('span', { class: 'badge green', style: 'margin-left:6px' }, 'Current') : null), h('td', {}, t.type_label), h('td', { class: 'num' }, t.users), h('td', { class: 'num' }, money(t.today_sales)), h('td', {}, t.active ? h('span', { class: 'badge green' }, 'Active') : h('span', { class: 'badge' }, 'Disabled')), h('td', { style: 'text-align:right;white-space:nowrap' }, h('button', { class: 'btn sm', onclick: async () => { await tryApi('setTenantActive', { id: t.id, active: !t.active }); go('businesses'); } }, t.active ? 'Disable' : 'Enable'), ' ', h('button', { class: 'btn sm primary', onclick: () => switchTo(t.id) }, 'Open'))))))
  );
  add(main, wrap);
}

async function switchTo(id) {
  if (S.cart && S.cart.items.length && !(await confirmBox('Switch business', 'The current cart will be cleared.', 'Switch'))) return;
  const r = await window.pos.call('switchTenant', { id });
  if (!r.ok) return toast(r.error, true);
  S.session = r.data;
  S.dash = null;
  await enter();
}

// Adding a business needs an answer code from Daalpha Systems (one code per business).
async function addBusiness() {
  const st = await tryApi('addShopStart');
  if (!st) return;
  const body = h('div', { class: 'stack recovery', style: 'gap:12px' });
  add(body, 
    h('div', { class: 'grid2' }, field('Business name', inp('name', '', { autofocus: true })), field('Type', sel('business_type', Object.entries(S.status.businessTypes), 'retail'))),
    h('div', { class: 'grid2' }, field('Phone', inp('phone')), field('KRA PIN', inp('kra_pin'))),
    field('Address', inp('address')),
    chk('sampleData', 'Add sample products', false),
    h('div', { class: 'section-title' }, 'Unlock from Daalpha Systems'),
    h('div', { class: 'muted small' }, 'Each new business needs an answer code from Daalpha Systems. Call or WhatsApp Daalpha Systems and read them this code:'),
    h('div', { class: 'recovery-code' }, st.code),
    field('Answer code from Daalpha Systems', inp('unlock', '', { placeholder: 'XXXX-XXXX', autocapitalize: 'characters', autocomplete: 'off', spellcheck: false, class: 'input recovery-answer' }))
  );
  modal({
    title: 'Add business',
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { const r = await tryApi('createTenant', formData(body)); if (r) { toast('Business added. Open it to add staff and products.'); close(); go('businesses'); } } }, 'Create')],
  });
}

// ================= activity (who did what) =================
const ACTIONS = {
  data_imported: ['📥', 'Data imported'], courses_changed: ['🎓', 'Courses changed'], application_admitted: ['📝', 'Application accepted'], application_rejected: ['🚫', 'Application turned down'],
  timetable_changed: ['🗓', 'Timetable changed'],
  marks_entered: ['📝', 'Marks entered'], exam_added: ['🗓️', 'Exam added'], exam_locked: ['🔒', 'Exam locked/unlocked'], grading_changed: ['📏', 'Grading changed'],
  attendance: ['✅', 'Register marked'],
  pupil_added: ['🎒', 'Pupil admitted'], pupil_moved: ['🔀', 'Pupil moved class'], pupil_status: ['🚪', 'Pupil status'], fee_payment: ['💰', 'Fee payment'], fee_void: ['❌', 'Fee payment voided'],
  fee_waiver: ['🎁', 'Fee waiver'], fee_extra: ['➕', 'Extra fee charge'], fee_adjust_removed: ['🗑️', 'Fee adjustment removed'], fee_structure: ['📑', 'Fee structure changed'], term_billed: ['🧮', 'Term billed'], term_saved: ['📅', 'Term'], pupils_promoted: ['🎓', 'Pupils promoted'],
  owner_recovered: ['🔑', 'Owner password reset'], recovery_failed: ['⚠️', 'Wrong recovery answer'],
  sign_in: ['🔓', 'Signed in'], sign_out: ['🔒', 'Signed out'], pin_failed: ['⚠️', 'Wrong PIN'], pin_locked: ['⛔', 'PIN locked'],
  sale: ['🧾', 'Sale'], discount: ['🏷️', 'Discount'], price_override: ['✏️', 'Price changed at till'], void: ['❌', 'Void'],
  bill: ['🧾', 'Bill printed'], bill_reduced: ['⚠️', 'Paid less than the bill'],
  order_deleted: ['🗑️', 'Held order deleted'], product_added: ['📦', 'Product added'], price_changed: ['💲', 'Price changed'],
  product_edited: ['📦', 'Product edited'], product_disabled: ['📦', 'Product stopped'], stock_received: ['📥', 'Stock received'],
  stock_adjusted: ['📉', 'Stock adjusted'], stock_take: ['🔢', 'Stock take finished'], stock_take_started: ['🔢', 'Stock take started'], stock_take_cancelled: ['🔢', 'Stock take cancelled'], account_payment: ['💵', 'Account payment'],
  credit_limit: ['💳', 'Credit limit'], user_added: ['👤', 'User added'], user_role: ['👤', 'Role changed'], user_disabled: ['👤', 'User disabled'],
  pin_changed: ['🔑', 'PIN changed'], password_changed: ['🔑', 'Password changed'], settings_changed: ['⚙️', 'Settings changed'],
};
// Things an owner usually wants to look at first.
const WATCH = new Set(['bill_reduced', 'fee_void', 'fee_waiver', 'fee_adjust_removed', 'fee_structure', 'owner_recovered', 'recovery_failed', 'pin_failed', 'pin_locked', 'discount', 'price_override', 'void', 'order_deleted', 'price_changed', 'stock_adjusted', 'credit_limit', 'user_role', 'pin_changed', 'password_changed']);

async function pageActivity(main) {
  const st = (S.actFilter = S.actFilter || { from: todayStr(), to: todayStr(), userId: '', action: '' });
  const wrap = h('div', { class: 'page' });
  const box = h('div', { class: 'card' });
  const peopleSel = h('select', { class: 'input', style: 'max-width:220px', onchange: (e) => { st.userId = e.target.value; load(); } });
  const load = async () => {
    const r = await tryApi('listActivity', st);
    if (!r) return;
    put(peopleSel, h('option', { value: '' }, 'Everyone'), r.people.map((p) => h('option', { value: p.id, selected: String(p.id) === String(st.userId) }, p.name)));
    put(box, r.rows.length
      ? h('table', { class: 'list' },
          h('tr', {}, h('th', {}, 'Time'), h('th', {}, 'Who'), h('th', {}, 'What')),
          r.rows.map((x) => h('tr', { class: WATCH.has(x.action) ? 'watch' : '' },
            h('td', { class: 'small', style: 'white-space:nowrap' }, fmtDate(x.created_at)),
            h('td', {}, h('b', {}, x.user_name || '—'), x.role ? h('div', { class: 'muted small' }, roleLabel(x.role)) : null),
            h('td', {}, h('span', { title: (ACTIONS[x.action] || [])[1] || x.action }, ((ACTIONS[x.action] || ['•'])[0]) + ' '), x.summary))))
      : h('div', { class: 'empty' }, 'Nothing recorded in this period.'));
  };
  const d = new Date();
  const iso = (x) => x.toLocaleDateString('en-CA');
  const preset = (label, from, to) => h('button', { class: 'btn sm', onclick: () => { st.from = from; st.to = to; go('activity'); } }, label);
  add(wrap,
    h('div', { class: 'page-head' }, h('h1', {}, 'Activity'), h('span', { class: 'spacer' }),
      preset('Today', todayStr(), todayStr()), preset('Yesterday', iso(new Date(Date.now() - 864e5)), iso(new Date(Date.now() - 864e5))), preset('7 days', iso(new Date(Date.now() - 6 * 864e5)), todayStr()),
      h('input', { class: 'input', type: 'date', value: st.from, style: 'width:auto', onchange: (e) => { st.from = e.target.value; load(); } }),
      h('span', { class: 'muted' }, 'to'),
      h('input', { class: 'input', type: 'date', value: st.to, style: 'width:auto', onchange: (e) => { st.to = e.target.value; load(); } })),
    h('div', { class: 'muted small' }, 'Everything staff do is recorded here and cannot be changed. Highlighted rows are the ones worth checking: wrong PINs, discounts, price changes, voids, deleted orders and stock adjustments.'),
    h('div', { class: 'row' }, peopleSel,
      h('select', { class: 'input', style: 'max-width:240px', onchange: (e) => { st.action = e.target.value; load(); } },
        h('option', { value: '' }, 'All activity'),
        Object.entries(ACTIONS).map(([k, v]) => h('option', { value: k, selected: st.action === k }, v[1]))),
      h('button', { class: 'btn', onclick: async () => { const r = await api('listActivity', st); saveCsv(`activity_${st.from}_${st.to}.csv`, r.rows, [['created_at', 'Time'], ['user_name', 'Who'], ['role', 'Role'], [(x) => (ACTIONS[x.action] || [])[1] || x.action, 'Type'], ['summary', 'What']]); } }, 'Export CSV')),
    box);
  add(main, wrap);
  load();
}

const PAGES = {
  pos: pagePos,
  tables: pageTables,
  sales: pageSales,
  products: pageProducts,
  stock: pageStock,
  customers: pageCustomers,
  reports: pageReports,
  activity: pageActivity,
  users: pageUsers,
  settings: pageSettings,
  businesses: pageBusinesses,
  school: pageSchool,
  pupils: pagePupils,
  stocktake: pageStockTake,
  applications: pageApplications,
  fees: pageFees,
  attendance: pageAttendance,
  exams: pageExams,
  timetable: pageTimetable,
};

window.addEventListener('error', (e) => toast('Error: ' + e.message, true));
window.addEventListener('unhandledrejection', (e) => toast('Error: ' + (e.reason && e.reason.message), true));
window.__posGo = (p) => go(p);
window.__posPage = () => (S.user ? S.page : null);
(window.__posReady || Promise.resolve()).then(boot);
