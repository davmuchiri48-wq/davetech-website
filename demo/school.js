// School screens: overview, pupils, fees. Loaded before app.js and uses its helpers (h, api, modal…)
// at run time. Shared by the PC and phone versions.

const SCH = { info: null, attTab: 'register', attClass: '', attDate: '', feeTab: 'balances', pupilFilter: { q: '', class_id: '', status: 'active', owing: false } };

async function schoolInfo(force) {
  if (!SCH.info || force) SCH.info = await api('schoolInfo');
  return SCH.info;
}
const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const balBadge = (b) => h('span', { class: 'badge ' + (b > 0 ? 'red' : b < 0 ? 'green' : '') }, b > 0 ? money(b) : b < 0 ? money(-b) + ' credit' : 'Paid up');
const tabs = (items, cur, onPick) => h('div', { class: 'chips' }, items.filter(Boolean).map(([id, label]) => h('button', { class: 'chip' + (cur === id ? ' on' : ''), onclick: () => onPick(id) }, label)));
// Kenyan numbers for WhatsApp: 07…/01… → 2547…/2541…
const waPhone = (p) => {
  const d = String(p || '').replace(/\D/g, '');
  if (/^0[17]\d{8}$/.test(d)) return '254' + d.slice(1);
  if (/^[17]\d{8}$/.test(d)) return '254' + d;
  return d;
};
function feeReminderText(p, termName) {
  return `Dear ${p.guardian_name || 'Parent'}, this is a reminder from ${S.tenant.name}. ${p.name} (Adm ${p.adm_no}, ${p.class_name}) has a fee balance of ${S.tenant.currency} ${money(p.balance)}${termName ? ' as at ' + termName : ''}. Kindly clear it. Thank you.`;
}
async function remindParent(p) {
  const info = await schoolInfo();
  const text = feeReminderText(p, info.term && info.term.name);
  if (!p.guardian_phone) {
    if (navigator.clipboard) await navigator.clipboard.writeText(text).catch(() => {});
    return toast('No parent phone saved. The reminder was copied instead.', true);
  }
  const r = await window.pos.openWhatsApp({ phone: waPhone(p.guardian_phone), text });
  if (!r.ok) toast(r.error, true);
}

// ================= School overview =================
const initialsOf = (name) => String(name || 'S').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(of|the|and|&)$/i.test(w)).slice(0, 3).map((w) => w[0].toUpperCase()).join('') || 'S';
function schoolCrest(t, cls = 'crest') {
  return t.logo ? h('div', { class: cls }, h('img', { src: t.logo, alt: '' })) : h('div', { class: cls + ' initials' }, initialsOf(t.name));
}
// "Week 7 of 13" from the term dates, or null.
function termWeek(t) {
  if (!t || !t.starts_on || !t.ends_on) return null;
  const a = new Date(t.starts_on + 'T00:00'), b = new Date(t.ends_on + 'T00:00'), now = new Date();
  if (!(b > a)) return null;
  const wk = 7 * 864e5;
  const total = Math.max(1, Math.ceil((b - a + 864e5) / wk));
  if (now < a) return { label: `Opens ${a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, pct: 0 };
  if (now > b) return { label: 'Term has closed', pct: 100 };
  const week = Math.min(total, Math.floor((now - a) / wk) + 1);
  return { label: `Week ${week} of ${total}`, pct: Math.round(((now - a) / (b - a)) * 100) };
}
// Short label for a class tile: Grade 4 → 4, PP1 → PP1, Form 2 → F2, Electrical Installation → EI
const classBadge = (g) => {
  g = String(g || '');
  const m = g.match(/^grade\s*(\d+)$/i);
  if (m) return m[1];
  if (g.replace(/\s/g, '').length <= 4) return g.replace(/\s/g, '');
  const d = g.match(/\d+/);
  return initialsOf(g).slice(0, d ? 1 : 3) + (d ? d[0] : '');
};
const shortDate = (s) => (s ? new Date(s + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
const meter = (pct, tone = '') => h('div', { class: 'meter ' + tone }, h('i', { style: `width:${Math.max(0, Math.min(100, pct))}%` }));

async function pageSchool(main) {
  const wrap = h('div', { class: 'page' });
  add(main, wrap);
  let info;
  try {
    info = await schoolInfo(true);
  } catch (e) {
    return add(wrap, h('div', { class: 'notice' }, e.message));
  }
  const t = info.term;
  const ten = S.tenant;
  const pct = info.termBilled ? Math.round((info.termCollected / info.termBilled) * 100) : 0;
  const body = h('div', { class: 'stack', style: 'gap:16px' });
  const tab = (S.schoolTab = S.schoolTab || 'classes');
  const wk = termWeek(t);
  const att = info.attendance;
  const attTotal = att ? att.P + att.L + att.A : 0;
  const attPct = attTotal ? Math.round(((att.P + att.L) / attTotal) * 100) : 0;

  const kpi = (ico, k, v, sub, extra, tone = '') => h('div', { class: 'card kpi ' + tone }, h('div', { class: 'kpi-top' }, h('span', { class: 'kpi-ico' }, ico), h('span', { class: 'k' }, k)), h('div', { class: 'v' }, v), sub ? h('div', { class: 'muted small' }, sub) : null, extra || null);
  const qa = (ico, label, fn, show = true) => (show ? h('button', { class: 'qa', onclick: fn }, h('span', { class: 'qa-ico' }, ico), h('span', {}, label)) : null);

  add(wrap,
    h('div', { class: 'sch-banner' },
      schoolCrest(ten),
      h('div', { class: 'sch-id' },
        h('h1', {}, ten.name),
        ten.motto ? h('div', { class: 'motto' }, ten.motto) : null,
        h('div', { class: 'sch-meta' }, h('span', {}, new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })), t ? h('span', { class: 'term-pill' }, t.name) : h('span', { class: 'term-pill' }, 'No term set'))),
      wk ? h('div', { class: 'sch-term' }, h('b', {}, wk.label), meter(wk.pct, 'light'), h('span', {}, shortDate(t.starts_on) + ' to ' + shortDate(t.ends_on))) : null),
    !ten.logo && can('admin') ? h('div', { class: 'notice soft' }, 'Add your school logo and colours so they show here, on report cards, receipts and ID cards. ', h('button', { class: 'btn sm', onclick: () => go('settings') }, 'Logo & colours')) : null,
    t && !t.billed && can('manager') ? h('div', { class: 'notice' }, `${t.name} has not been billed yet. Set the fee structure (Fees → Fee structure), then bill the term so every pupil’s fees are charged. `, h('button', { class: 'btn sm', onclick: () => { SCH.feeTab = 'structure'; go('fees'); } }, 'Fee structure')) : null,
    h('div', { class: 'quick' },
      qa('💰', 'Receive fees', () => receiveFees(null, () => go('school')), canMoney()),
      qa('✅', 'Mark register', () => { SCH.attTab = 'register'; go('attendance'); }),
      qa('📝', 'Enter marks', () => { SCH.examTab = 'marks'; go('exams'); }),
      qa('🎓', 'Report cards', () => { SCH.examTab = 'cards'; go('exams'); }, can('manager') || (info.myClasses && info.myClasses.length)),
      qa('➕', 'Admit pupil', () => editPupil(null, () => go('school')), can('manager')),
      qa('🗓', 'Timetable', () => go('timetable'))),
    h('div', { class: 'kpis' },
      kpi('🎒', 'Pupils', String(info.pupils), `in ${info.classes} classes`),
      att ? kpi('✅', 'Present today', attTotal ? `${attPct}%` : '—', attTotal ? `${att.P + att.L} in, ${att.A} absent. ${att.marked} of ${att.classes} registers marked` : `${att.marked} of ${att.classes} registers marked`, attTotal ? meter(attPct, attPct >= 90 ? 'ok' : attPct >= 75 ? '' : 'warn') : null) : null,
      kpi('💵', 'Collected today', money(info.todayCollected), `${info.todayCount} payment(s)`),
      can('manager') ? kpi('📈', 'Term fees collected', `${pct}%`, `${money(info.termCollected)} of ${money(info.termBilled)}`, meter(pct, pct >= 80 ? 'ok' : '')) : null,
      can('manager') ? kpi('⏳', 'Fees owed', money(info.owingTotal), `${info.owingCount} pupil(s), all terms`, null, info.owingCount ? 'owed' : '') : null),
    att && att.notMarked.length && new Date().getHours() >= 9 ? h('div', { class: 'notice' }, 'Register not marked yet today: ', att.notMarked.map((c) => c.name + (c.teacher ? ` (${c.teacher})` : '')).join(', '), ' ', h('button', { class: 'btn sm', onclick: () => go('attendance') }, 'Attendance')) : null,
    tabs([['classes', 'Classes'], isCollege() ? ['courses', 'Courses'] : null, ['staff', 'Staff'], ['terms', 'Terms'], can('manager') ? ['website', '🌐 Website'] : null, can('admin') && !isCollege() ? ['year', 'End of year'] : null], tab, (id) => { S.schoolTab = id; go('school'); }),
    body);
  myLessonsToday(wrap, body);
  if (tab === 'classes') schoolClasses(body);
  else if (tab === 'staff') schoolStaff(body);
  else if (tab === 'terms') schoolTerms(body);
  else if (tab === 'website') schoolWebsite(body);
  else if (tab === 'courses') collegeCourses(body);
  else schoolYearEnd(body, info);
}

async function schoolClasses(box) {
  const rows = await tryApi('listClasses');
  if (!rows) return;
  const openPupils = (c) => { SCH.pupilFilter = { q: '', class_id: String(c.id), status: 'active', owing: false }; go('pupils'); };
  put(box,
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, isCollege() ? 'A class is a course plus an intake, e.g. ICT Jan 2027. Add or rename courses under Courses.' : 'A class is a grade plus an optional stream, e.g. Grade 4 East.'), h('span', { class: 'spacer' }), can('manager') ? h('button', { class: 'btn', onclick: () => editClass(null, () => go('school')) }, '+ Add class / stream') : null),
    rows.length
      ? h('div', { class: 'class-grid' },
        rows.map((c) => h('div', { class: 'card class-card' + (c.active ? '' : ' off') },
          h('div', { class: 'cc-head' }, h('div', { class: 'cc-badge' }, classBadge(c.grade)), h('div', { class: 'cc-name' }, h('b', {}, c.name), h('span', { class: 'muted small' }, c.teacher ? 'Class teacher: ' + c.teacher : 'No class teacher')), c.active ? null : h('span', { class: 'badge' }, 'Not in use')),
          h('div', { class: 'cc-nums' },
            h('div', {}, h('b', {}, c.pupils), h('span', {}, 'pupils')),
            h('div', {}, h('b', {}, c.girls), h('span', {}, 'girls')),
            h('div', {}, h('b', {}, c.boys), h('span', {}, 'boys')),
            can('manager') ? h('div', { class: c.owing ? 'owe' : '' }, h('b', {}, c.owing), h('span', {}, 'owing')) : null),
          h('div', { class: 'cc-foot' },
            h('button', { class: 'btn sm', onclick: () => openPupils(c) }, 'Pupils'),
            h('button', { class: 'btn sm', onclick: () => { SCH.attClass = String(c.id); SCH.attTab = 'register'; go('attendance'); } }, 'Register'),
            h('span', { class: 'spacer' }),
            can('manager') ? h('button', { class: 'btn sm', onclick: () => editClass(c, () => go('school')) }, 'Edit') : null))))
      : h('div', { class: 'empty' }, 'No classes yet. Add the first one.'));
}

async function editClass(c, after) {
  const info = await schoolInfo();
  const users = (await tryApi('listStaff')) || [];
  c = c || {};
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  add(body,
    isCollege()
      ? h('div', { class: 'grid2' }, field('Course', sel('grade', info.grades.map((g) => [g, g]), c.grade || info.grades[0])), field('Intake / group (optional)', inp('stream', c.stream || '', { placeholder: 'e.g. Jan 2027, May 2027, Evening' })))
      : h('div', { class: 'grid2' }, field('Grade', sel('grade', info.grades.map((g) => [g, g]), c.grade || 'Grade 1')), field('Stream (optional)', inp('stream', c.stream || '', { placeholder: 'e.g. East, Blue, A' }))),
    field('Class teacher', sel('teacher_id', [['', '— none —'], ...users.filter((u) => u.active).map((u) => [u.id, u.name])], c.teacher_id || '')),
    c.id ? chk('active', 'In use', c.active !== 0) : null);
  modal({
    title: c.id ? 'Edit ' + c.name : 'Add class',
    body,
    foot: (close) => [
      c.id && !c.pupils ? h('button', { class: 'btn danger', onclick: async () => { if (await tryApi('deleteClass', { id: c.id })) { close(); after(); } } }, 'Delete') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: close }, 'Cancel'),
      h('button', { class: 'btn primary', onclick: async () => { const d = formData(body); if (await tryApi('saveClass', { ...d, id: c.id, teacher_id: d.teacher_id ?? c.teacher_id, active: c.id ? d.active : true })) { close(); after(); } } }, 'Save'),
    ],
  });
}

// Colleges: the list of courses (used for classes, fees, units and the website).
async function collegeCourses(box) {
  let rows = await tryApi('listCourses');
  if (!rows) return;
  let list = rows.map((r) => r.name);
  const rename = {};
  const save = async () => {
    const r = await tryApi('saveCourses', { courses: list, rename });
    if (r) {
      toast('Courses saved.');
      schoolInfo(true);
      collegeCourses(box);
    }
  };
  const draw = () =>
    put(box,
      h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Your courses, in the order they should appear. Each class is a course plus an intake.'), h('span', { class: 'spacer' }),
        can('manager') ? h('button', { class: 'btn', onclick: async () => { const n = await promptBox('Add course', 'Course name (e.g. Electrical Installation)', ''); if (n && n.trim()) { list.push(n.trim()); await save(); } } }, '+ Add course') : null),
      h('div', { class: 'card' }, h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Course'), h('th', { class: 'num' }, 'Classes'), h('th', { class: 'num' }, 'Students'), h('th', {})),
        list.map((name, i) => {
          const r = rows.find((x) => x.name === name) || { classes: 0, students: 0 };
          return h('tr', {}, h('td', {}, h('b', {}, name)), h('td', { class: 'num' }, r.classes), h('td', { class: 'num' }, r.students),
            h('td', { style: 'text-align:right;white-space:nowrap' }, can('manager') ? [
              h('button', { class: 'btn sm', disabled: i === 0, title: 'Move up', onclick: async () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; await save(); } }, '↑'), ' ',
              h('button', { class: 'btn sm', onclick: async () => { const n = await promptBox('Rename course', 'New name', name); if (n && n.trim() && n.trim() !== name) { list[i] = n.trim(); rename[name] = n.trim(); await save(); } } }, 'Rename'), ' ',
              h('button', { class: 'btn sm danger', disabled: r.classes > 0, title: r.classes ? 'Move or delete its classes first' : '', onclick: async () => { if (await confirmBox('Remove course', `Remove ${name}?`, 'Remove', true)) { list.splice(i, 1); await save(); } } }, 'Remove'),
            ] : null));
        }))));
  draw();
}

async function schoolTerms(box) {
  const rows = await tryApi('listTerms');
  if (!rows) return;
  put(box,
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Fees and payments are recorded against the current term. Change it when a new term starts.'), h('span', { class: 'spacer' }), can('manager') ? h('button', { class: 'btn', onclick: () => editTerm(null) }, '+ Add term') : null),
    h('div', { class: 'card' }, h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Term'), h('th', {}, 'Opens'), h('th', {}, 'Closes'), h('th', {}, 'Fees'), h('th', {})),
      rows.map((t) => h('tr', {}, h('td', {}, h('b', {}, t.name), t.is_current ? h('span', { class: 'badge green', style: 'margin-left:6px' }, 'Current') : null), h('td', {}, t.starts_on || '—'), h('td', {}, t.ends_on || '—'), h('td', {}, t.billed ? h('span', { class: 'badge green' }, 'Billed') : h('span', { class: 'muted' }, 'Not billed')),
        h('td', { style: 'text-align:right;white-space:nowrap' }, can('manager') ? h('button', { class: 'btn sm', onclick: () => editTerm(t) }, 'Edit') : null))))));
}

function editTerm(t) {
  const d = new Date();
  t = t || { year: d.getFullYear(), term: '' };
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  add(body,
    h('div', { class: 'grid2' }, field('Year', inp('year', t.year, { type: 'number' })), field('Term', sel('term', [['1', 'Term 1'], ['2', 'Term 2'], ['3', 'Term 3']], t.term || '1'))),
    h('div', { class: 'grid2' }, field('Opens', inp('starts_on', t.starts_on || '', { type: 'date' })), field('Closes', inp('ends_on', t.ends_on || '', { type: 'date' }))),
    chk('is_current', 'This is the current term', !!t.is_current || !t.id));
  modal({
    title: t.id ? 'Edit ' + t.name : 'Add term',
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { if (await tryApi('saveTerm', { ...formData(body), id: t.id })) { close(); S.schoolTab = 'terms'; go('school'); } } }, 'Save')],
  });
}

async function schoolYearEnd(box, info) {
  const classes = (await tryApi('listClasses')) || [];
  const grades = [...new Set(classes.map((c) => c.grade))];
  const top = h('select', { class: 'input', style: 'max-width:220px' }, grades.map((g) => h('option', { value: g, selected: g === grades[grades.length - 1] }, g)));
  put(box, h('div', { class: 'card pad stack' },
    h('h2', {}, 'Promote pupils to the next grade'),
    h('div', { class: 'muted' }, 'Do this once, at the end of the school year. Every active pupil moves up one grade (PP1 → PP2, Grade 3 → Grade 4…), keeping the same stream where it exists. Pupils in the last grade this school offers are marked as finished (graduated). Fee balances stay with each pupil.'),
    field('Last grade at this school', top),
    h('div', {}, h('button', { class: 'btn primary', onclick: async () => {
      if (!(await confirmBox('Promote all pupils?', `Everyone moves up one grade and ${top.value} pupils are marked as finished. This cannot be undone automatically (a backup is made every day).`, 'Promote', true))) return;
      const r = await tryApi('promotePupils', { top_grade: top.value });
      if (r) toast(`${r.moved} pupils moved up; ${r.graduated} finished ${r.top}. Now add the new year's Term 1.`);
      go('school');
    } }, 'Promote all pupils'))));
}

// ================= Pupils =================
// ================= Online applications =================
async function pageApplications(main) {
  const wrap = h('div', { class: 'page' });
  add(main, wrap);
  const st = (SCH.appTab = SCH.appTab || 'new');
  const [counts, rows, site] = await Promise.all([tryApi('applicationCounts'), tryApi('listApplications', { status: st }), tryApi('siteGet')]);
  if (!counts || !rows) return;
  const online = site && site.published && site.admissions && site.admissions.online;
  const check = async (e) => {
    e.target.disabled = true;
    const r = await window.pos.appsFetch();
    e.target.disabled = false;
    if (!r.ok) return toast(r.error, true);
    toast(r.data ? `${r.data} new application(s).` : 'No new applications.');
    refreshBadges();
    go('applications');
  };
  const when = (d) => (d ? fmtDate(String(d).replace('T', ' ')) : '');
  const line = (k, v) => (v ? h('div', {}, h('span', { class: 'muted' }, k + ': '), v) : null);
  add(wrap,
    h('div', { class: 'page-head' }, h('h1', {}, 'Applications'), h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: check }, '↻ Check for new')),
    !online ? h('div', { class: 'notice' }, 'People can apply on your website once you tick “Take applications online” and publish it (School → 🌐 Website). ', can('manager') ? h('button', { class: 'btn sm', onclick: () => { S.schoolTab = 'website'; go('school'); } }, 'Website') : null) : null,
    tabs([['new', `New (${counts.new})`], ['admitted', `Accepted (${counts.admitted})`], ['rejected', `Turned down (${counts.rejected})`]], st, (id) => { SCH.appTab = id; go('applications'); }),
    rows.length
      ? h('div', { class: 'stack', style: 'gap:12px' }, rows.map((a) => h('div', { class: 'card pad stack', style: 'gap:6px' },
          h('div', { class: 'row', style: 'flex-wrap:wrap;gap:8px' }, h('h2', {}, a.name), a.course ? h('span', { class: 'badge green' }, a.course + (a.intake ? ' · ' + a.intake : '')) : null, h('span', { class: 'spacer' }), h('span', { class: 'muted small' }, 'Applied ' + when(a.applied_at))),
          h('div', { class: 'grid2 small', style: 'gap:4px 16px' },
            line('Phone', a.phone), line('Email', a.email), line('Gender', a.gender), line('Date of birth', a.dob), line('ID / birth cert', a.id_no), line('Education', a.education),
            line('Lives in', [a.residence, a.region, a.country].filter(Boolean).join(', ')), line(isCollege() ? 'Sponsor' : 'Parent / guardian', [a.sponsor_name, a.sponsor_phone].filter(Boolean).join(' · '))),
          a.message ? h('div', { class: 'small', style: 'white-space:pre-wrap' }, h('span', { class: 'muted' }, 'Message: '), a.message) : null,
          st === 'admitted' && a.pupil ? h('div', { class: 'small' }, '✅ ', h('b', {}, `${a.pupil.name} — ${a.pupil.adm_no}`), h('span', { class: 'muted' }, ` · by ${a.decided_by || '—'}, ${when(a.decided_at)}`)) : null,
          st === 'rejected' ? h('div', { class: 'small muted' }, `Turned down by ${a.decided_by || '—'}, ${when(a.decided_at)}${a.note ? ' — ' + a.note : ''}`) : null,
          h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
            st === 'new' ? h('button', { class: 'btn primary', onclick: () => admitApplication(a) }, 'Accept…') : null,
            st === 'new' ? h('button', { class: 'btn danger', onclick: async () => { const note = await promptBox('Turn down ' + a.name, 'Reason (only you see this)', ''); if (note === null) return; if (await tryApi('rejectApplication', { id: a.id, note })) { refreshBadges(); go('applications'); } } }, 'Turn down') : null,
            st === 'rejected' ? h('button', { class: 'btn', onclick: async () => { if (await tryApi('reopenApplication', { id: a.id })) { refreshBadges(); go('applications'); } } }, 'Move back to new') : null,
            a.phone ? h('button', { class: 'btn', onclick: async () => { const r = await window.pos.openWhatsApp({ phone: waPhone(a.phone), text: `Hello ${a.name.split(' ')[0]}, this is ${S.tenant.name}. Thank you for applying${a.course ? ' for ' + a.course : ''}. ` }); if (!r.ok) toast(r.error, true); } }, 'WhatsApp') : null,
            a.phone ? h('a', { class: 'btn', style: 'text-decoration:none', href: 'tel:' + a.phone }, 'Call') : null))))
      : h('div', { class: 'card pad muted' }, st === 'new' ? 'No new applications. They appear here within a minute of someone applying (when this computer or phone has internet).' : 'Nothing here yet.'));
}

async function admitApplication(a) {
  const [classes, items] = await Promise.all([tryApi('listClasses'), tryApi('listFeeItems')]);
  if (!classes || !items) return;
  const active = classes.filter((c) => c.active);
  // best guess: same course and intake, then same course
  const guess = active.find((c) => c.grade === a.course && a.intake && c.stream.toLowerCase() === a.intake.toLowerCase()) || active.find((c) => c.grade === a.course) || {};
  const optional = items.filter((i) => i.optional && i.active);
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  add(body,
    h('div', { class: 'muted' }, `${a.name} applied for ${a.course || '—'}${a.intake ? ' (' + a.intake + ')' : ''}. Their details are copied in; you can edit them later.`),
    h('div', { class: 'grid2' }, field('Class', sel('class_id', [['', '— choose —'], ...active.map((c) => [c.id, c.name])], guess.id || '')), field(isCollege() ? 'Registration no. (blank = next number)' : 'Admission no. (blank = next number)', inp('adm_no', '', { placeholder: 'automatic' }))),
    optional.length ? h('div', { class: 'section-title' }, 'Also charge (each term)') : null,
    optional.length ? h('div', { class: 'row', style: 'gap:16px;flex-wrap:wrap' }, optional.map((i) => h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-svc': i.id, checked: /registration|admission/i.test(i.name) }), i.name))) : null);
  modal({
    title: 'Accept ' + a.name,
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
      const d = formData(body);
      const services = [...body.querySelectorAll('[data-svc]')].filter((x) => x.checked).map((x) => Number(x.dataset.svc));
      const p = await tryApi('admitApplication', { id: a.id, class_id: d.class_id, adm_no: d.adm_no, services });
      if (!p) return;
      close();
      refreshBadges();
      modal({
        title: `${p.name} accepted`,
        body: h('div', { class: 'stack', style: 'gap:8px' }, h('div', {}, h('b', {}, p.adm_no), ` · ${p.class_name}`), p.balance > 0 ? h('div', {}, `Fees charged: ${S.tenant.currency} ${money(p.balance)}`) : null),
        foot: (c2) => [h('button', { class: 'btn', onclick: () => { c2(); go('applications'); } }, 'Done'), canMoney() ? h('button', { class: 'btn primary', onclick: () => { c2(); receiveFees(p, () => go('applications')); } }, '💰 Receive fees') : null],
      });
    } }, 'Accept')],
  });
}

async function pagePupils(main) {
  const f = SCH.pupilFilter;
  const wrap = h('div', { class: 'page' });
  const box = h('div', { class: 'card' });
  const count = h('span', { class: 'muted small' });
  let rows = [];
  const classes = (await tryApi('listClasses')) || [];
  const load = async () => {
    rows = (await tryApi('listPupils', { q: f.q, class_id: f.class_id, status: f.status, owing: f.owing })) || [];
    count.textContent = `${rows.length} pupil(s)` + (f.owing ? ` · ${money(rows.reduce((a, r) => a + r.balance, 0))} owed` : '');
    put(box, rows.length
      ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Adm'), h('th', {}, 'Name'), h('th', {}, 'Class'), h('th', { class: 'hide-phone' }, 'Parent'), h('th', { class: 'num' }, 'Balance'), h('th', {})),
        rows.map((p) => h('tr', { style: 'cursor:pointer', onclick: (e) => { if (!e.target.closest('button')) openPupil(p.id, load); } },
          h('td', {}, p.adm_no), h('td', {}, h('b', {}, p.name), p.status !== 'active' ? h('span', { class: 'badge', style: 'margin-left:6px' }, p.status) : null), h('td', {}, p.class_name),
          h('td', { class: 'small hide-phone' }, p.guardian_name, p.guardian_phone ? h('div', { class: 'muted' }, p.guardian_phone) : null),
          h('td', { class: 'num' }, balBadge(p.balance)),
          h('td', { style: 'text-align:right;white-space:nowrap' }, canMoney() ? h('button', { class: 'btn sm primary', onclick: () => receiveFees(p, load) }, 'Pay') : null, p.balance > 0 ? [' ', h('button', { class: 'btn sm hide-phone', title: 'Send a fee reminder by WhatsApp', onclick: () => remindParent(p) }, 'Remind')] : null))))
      : h('div', { class: 'empty' }, f.q || f.class_id || f.owing ? 'No pupils match.' : 'No pupils yet. Tap “+ Admit pupil”.'));
  };
  add(wrap,
    h('div', { class: 'page-head' }, h('h1', {}, 'Pupils'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: () => printIdCards(rows.filter((p) => p.status === 'active'), classes.find((c) => String(c.id) === String(f.class_id))) }, '🪪 ID cards'),
      h('button', { class: 'btn', onclick: () => saveCsv('pupils.csv', rows, [['adm_no', 'Adm no'], ['name', 'Name'], ['gender', 'Gender'], ['class_name', 'Class'], ['upi', 'UPI'], ['guardian_name', 'Parent/guardian'], ['guardian_phone', 'Phone'], ['guardian_phone2', 'Phone 2'], ['status', 'Status'], ['balance', 'Balance']]) }, 'Export CSV'),
      can('manager') ? h('button', { class: 'btn primary', onclick: () => editPupil(null, load) }, '+ Admit pupil') : null),
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
      h('input', { class: 'input', placeholder: 'Search name, adm no, parent phone', value: f.q, style: 'max-width:300px', oninput: (e) => { f.q = e.target.value; load(); } }),
      h('select', { class: 'input', style: 'width:auto', onchange: (e) => { f.class_id = e.target.value; load(); } }, h('option', { value: '' }, 'All classes'), classes.map((c) => h('option', { value: c.id, selected: String(c.id) === String(f.class_id) }, c.name))),
      h('select', { class: 'input', style: 'width:auto', onchange: (e) => { f.status = e.target.value; load(); } }, [['active', 'In school'], ['left', 'Left'], ['graduated', 'Finished'], ['all', 'Everyone']].map(([v, l]) => h('option', { value: v, selected: f.status === v }, l))),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: f.owing, onchange: (e) => { f.owing = e.target.checked; load(); } }), 'Owing fees only'),
      count),
    box);
  add(main, wrap);
  load();
}

async function openPupil(id, after) {
  const p = await tryApi('getPupil', { id });
  if (!p) return;
  const att = await tryApi('pupilAttendance', { pupil_id: id });
  const refresh = () => { after && after(); };
  const row = (k, v) => (v ? h('div', {}, h('span', { class: 'muted small' }, k + ': '), v) : null);
  const m = modal({
    title: `${p.name} · ${p.adm_no}`,
    wide: true,
    body: h('div', { class: 'stack', style: 'gap:14px' },
      h('div', { class: 'row', style: 'align-items:flex-start;flex-wrap:wrap;gap:20px' },
        h('div', { class: 'stack', style: 'gap:4px;min-width:220px' }, row('Class', p.class_name), row('Status', p.status), row('Gender', p.gender), row('Date of birth', p.dob), row('UPI / NEMIS', p.upi), row('Joined', p.joined_on), row('Notes', p.notes)),
        h('div', { class: 'stack', style: 'gap:4px;min-width:220px' }, row('Parent / guardian', p.guardian_name), row('Phone', p.guardian_phone), row('Phone 2', p.guardian_phone2), row('Address', p.address)),
        att && att.days ? h('div', { class: 'card stat', style: 'min-width:160px' }, h('div', { class: 'k' }, 'Attendance'), h('div', { class: 'v' }, att.rate + '%'), h('div', { class: 'muted small' }, `${att.A} absent, ${att.L} late of ${att.days} days`)) : null,
        h('div', { class: 'card stat', style: 'min-width:180px' }, h('div', { class: 'k' }, 'Fee balance'), h('div', { class: 'v' }, p.balance > 0 ? money(p.balance) : p.balance < 0 ? money(-p.balance) : '0.00'), h('div', { class: 'muted small' }, p.balance > 0 ? 'owed to the school' : p.balance < 0 ? 'credit (paid ahead)' : 'paid up')))),
    foot: (close) => [
      can('manager') ? h('button', { class: 'btn', onclick: () => { close(); editPupil(p, refresh); } }, 'Edit') : null,
      can('manager') ? h('button', { class: 'btn', onclick: () => { close(); feeAdjustment(p, 'extra', refresh); } }, 'Extra charge') : null,
      can('manager') ? h('button', { class: 'btn', onclick: () => { close(); feeAdjustment(p, 'waiver', refresh); } }, 'Waiver / bursary') : null,
      h('span', { class: 'spacer' }),
      p.balance > 0 ? h('button', { class: 'btn', onclick: () => remindParent({ ...p }) }, 'WhatsApp reminder') : null,
      h('button', { class: 'btn', onclick: () => { close(); pupilStatement(p.id, refresh); } }, 'Statement'),
      canMoney() ? h('button', { class: 'btn primary', onclick: () => { close(); receiveFees(p, refresh); } }, 'Receive fees') : null,
    ],
  });
  return m;
}

async function editPupil(p, after) {
  const isNew = !p;
  p = p || { status: 'active', services: [] };
  const [classes, items] = await Promise.all([tryApi('listClasses'), tryApi('listFeeItems')]);
  if (!classes || !items) return;
  const optional = items.filter((i) => i.optional && i.active);
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  const classOpts = [['', '— choose —'], ...classes.filter((c) => c.active || c.id === p.class_id).map((c) => [c.id, c.name])];
  if (isCollege()) {
    add(body,
      h('div', { class: 'grid2' }, field('Full name', inp('name', p.name, { autofocus: true })), field('Registration no. (blank = next number)', inp('adm_no', p.adm_no, { placeholder: 'automatic' }))),
      h('div', { class: 'grid3' }, field('Class (course + intake)', sel('class_id', classOpts, p.class_id || '')), field('Gender', sel('gender', [['', '—'], ['F', 'Female'], ['M', 'Male']], p.gender || '')), field('Date of birth', inp('dob', p.dob, { type: 'date' }))),
      h('div', { class: 'grid3' }, field('Student’s phone', inp('phone', p.phone, { type: 'tel', placeholder: '07…' })), field('Email', inp('email', p.email, { type: 'email' })), field('ID / birth certificate no.', inp('upi', p.upi))),
      isNew ? field('Joined on', inp('joined_on', todayStr(), { type: 'date' })) : field('Status', sel('status', [['active', 'Studying'], ['left', 'Left the college'], ['graduated', 'Completed the course']], p.status)),
      h('div', { class: 'section-title' }, 'Sponsor / next of kin (who pays the fees)'),
      h('div', { class: 'grid3' }, field('Name', inp('guardian_name', p.guardian_name, { placeholder: 'or “Self”' })), field('Phone (for fee reminders)', inp('guardian_phone', p.guardian_phone, { type: 'tel', placeholder: '07…' })), field('Second phone', inp('guardian_phone2', p.guardian_phone2, { type: 'tel' }))),
      h('div', { class: 'grid2' }, field('Home area / address', inp('address', p.address)), field('Notes', inp('notes', p.notes))));
  } else add(body,
    h('div', { class: 'grid2' }, field('Full name', inp('name', p.name, { autofocus: true })), field('Admission no. (blank = next number)', inp('adm_no', p.adm_no, { placeholder: 'automatic' }))),
    h('div', { class: 'grid3' }, field('Class', sel('class_id', classOpts, p.class_id || '')), field('Gender', sel('gender', [['', '—'], ['F', 'Girl'], ['M', 'Boy']], p.gender || '')), field('Date of birth', inp('dob', p.dob, { type: 'date' }))),
    h('div', { class: 'grid2' }, field('UPI / NEMIS no.', inp('upi', p.upi)), isNew ? field('Joined on', inp('joined_on', todayStr(), { type: 'date' })) : field('Status', sel('status', [['active', 'In school'], ['left', 'Left the school'], ['graduated', 'Finished (graduated)']], p.status))),
    h('div', { class: 'section-title' }, 'Parent / guardian'),
    h('div', { class: 'grid3' }, field('Name', inp('guardian_name', p.guardian_name)), field('Phone (for fee reminders)', inp('guardian_phone', p.guardian_phone, { type: 'tel', placeholder: '07…' })), field('Second phone', inp('guardian_phone2', p.guardian_phone2, { type: 'tel' }))),
    h('div', { class: 'grid2' }, field('Home area / address', inp('address', p.address)), field('Notes (allergies, pickup…)', inp('notes', p.notes))));
  add(body,
    optional.length ? h('div', { class: 'section-title' }, 'Optional services (charged each term)') : null,
    optional.length ? h('div', { class: 'row', style: 'gap:16px;flex-wrap:wrap' }, optional.map((i) => h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-svc': i.id, checked: (p.services || []).includes(i.id) }), i.name))) : null);
  modal({
    title: isNew ? 'Admit pupil' : 'Edit ' + p.name,
    wide: true,
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => {
      const d = formData(body);
      d.services = [...body.querySelectorAll('[data-svc]')].filter((x) => x.checked).map((x) => Number(x.dataset.svc));
      const r = await tryApi('savePupil', { ...d, id: p.id });
      if (!r) return;
      toast(isNew ? `${r.name} admitted as ${r.adm_no}.` : 'Saved.');
      close();
      after && after(r);
    } }, isNew ? 'Admit' : 'Save')],
  });
}

function feeAdjustment(p, kind, after) {
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  add(body,
    h('div', { class: 'muted' }, kind === 'waiver' ? 'Reduces what the pupil owes (bursary, sibling or staff discount, sponsorship).' : 'Adds a one-off charge (trip, swimming, lost book, admission fee).'),
    h('div', { class: 'grid2' }, field('Amount', inp('amount', '', { type: 'number', step: '0.01', autofocus: true })), field(kind === 'waiver' ? 'Reason' : 'What for', inp('description', ''))));
  modal({
    title: (kind === 'waiver' ? 'Waiver / bursary — ' : 'Extra charge — ') + p.name,
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { const r = await tryApi('addFeeAdjustment', { ...formData(body), pupil_id: p.id, kind }); if (r) { toast('Saved. New balance: ' + money(r.balance)); close(); after && after(); } } }, 'Save')],
  });
}

// ================= Receiving fees =================
async function receiveFees(pupil, after) {
  if (!pupil) return pickPupil('Receive fees — choose the pupil', (p) => receiveFees(p, after));
  const p = await tryApi('getPupil', { id: pupil.id });
  if (!p) return;
  const info = await schoolInfo();
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  const ref = inp('reference', '', { style: 'text-transform:uppercase', placeholder: 'M-Pesa code / slip no.' });
  add(body,
    h('div', { class: 'row' }, h('div', {}, h('b', {}, p.name), h('div', { class: 'muted small' }, `${p.adm_no} · ${p.class_name}`)), h('span', { class: 'spacer' }), h('div', { style: 'text-align:right' }, h('div', { class: 'muted small' }, 'Balance'), balBadge(p.balance))),
    h('div', { class: 'grid2' }, field('Amount paid', inp('amount', '', { type: 'number', step: '0.01', min: '0', autofocus: true, inputMode: 'decimal' })), field('Paid by', sel('method', Object.entries(info.methods), 'mpesa'))),
    h('div', { class: 'grid2' }, field('Reference', ref), field('Date paid', inp('paid_on', todayStr(), { type: 'date', max: todayStr(), disabled: !can('manager') }))),
    field('Notes (optional)', inp('notes', '', { placeholder: 'e.g. paid by uncle' })));
  modal({
    title: 'Receive fees',
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async (e) => {
      const d = formData(body);
      d.reference = String(d.reference || '').toUpperCase();
      if (!can('manager')) d.paid_on = todayStr();
      e.target.disabled = true;
      const r = await tryApi('recordFeePayment', { ...d, pupil_id: p.id });
      e.target.disabled = false;
      if (!r) return;
      close();
      SCH.info = null;
      feePaid(r);
      after && after();
    } }, 'Save payment')],
  });
}

function feePaid(pay) {
  modal({
    title: 'Payment saved',
    body: h('div', { class: 'stack', style: 'gap:10px;text-align:center' },
      h('div', { style: 'font-size:44px;line-height:1;color:var(--ok);font-weight:800' }, '✓'),
      h('div', { style: 'font-size:24px;font-weight:800' }, money(pay.amount, true)),
      h('div', {}, `${pay.pupil_name} · ${pay.adm_no} · ${pay.receipt_no}`),
      h('div', { class: 'muted' }, 'Balance now: ', h('b', {}, pay.balance_after > 0 ? money(pay.balance_after) + ' owed' : pay.balance_after < 0 ? money(-pay.balance_after) + ' credit' : 'paid up'))),
    foot: (close) => [
      pay.guardian_phone ? h('button', { class: 'btn', onclick: async () => { const r = await window.pos.openWhatsApp({ phone: waPhone(pay.guardian_phone), text: `${S.tenant.name}: received ${S.tenant.currency} ${money(pay.amount)} for ${pay.pupil_name} (Adm ${pay.adm_no}), receipt ${pay.receipt_no}${pay.reference ? ', ' + pay.method_name + ' ' + pay.reference : ''}. Fee balance: ${S.tenant.currency} ${money(pay.balance_after)}. Thank you.` }); if (!r.ok) toast(r.error, true); } }, 'Send to parent (WhatsApp)') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: close }, 'Close'),
      h('button', { class: 'btn primary', onclick: () => printJob('fee', { payment: pay }) }, 'Print receipt'),
    ],
  });
}

function pickPupil(title, done) {
  const list = h('div', { class: 'stack', style: 'gap:6px;max-height:50vh;overflow:auto' });
  const q = h('input', { class: 'input', placeholder: 'Name, admission no. or parent phone', autofocus: true });
  let timer;
  const search = async () => {
    const rows = (await tryApi('listPupils', { q: q.value, limit: 30 })) || [];
    put(list, rows.length ? rows.map((p) => h('button', { class: 'btn', style: 'justify-content:space-between;display:flex;text-align:left', onclick: () => { m.close(); done(p); } }, h('span', {}, h('b', {}, p.name), h('span', { class: 'muted small' }, ` · ${p.adm_no} · ${p.class_name}`)), balBadge(p.balance))) : h('div', { class: 'empty' }, 'No pupils found.'));
  };
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 150); });
  const m = modal({ title, body: h('div', { class: 'stack', style: 'gap:10px' }, q, list), foot: (close) => h('button', { class: 'btn', onclick: close }, 'Cancel') });
  search();
}

// ----- shared look for A4 school printouts (logo + the school's colours) -----
function printTheme(t) {
  const b = brandOf(t);
  return `
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box }
    :root { --side: ${b.side}; --acc: ${b.accent}; --soft: ${b.soft}; --grad: ${b.grad} }
    .dh { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; background: var(--side); color: #fff; position: relative; overflow: hidden }
    .dh::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--grad) }
    .dh .crest { width: 62px; height: 62px; border-radius: 10px; background: #fff; display: flex; align-items: center; justify-content: center; padding: 4px; flex: none }
    .dh .crest img { max-width: 100%; max-height: 100%; object-fit: contain }
    .dh .crest.ini { background: var(--grad); color: #fff; font-weight: 800; font-size: 20px }
    .dh .who { flex: 1; min-width: 0 } .dh h1 { font-size: 19px; margin: 0; line-height: 1.2 } .dh .sub { font-size: 11px; opacity: .85 } .dh .motto { font-style: italic; font-size: 11px; opacity: .9 }
    .dh .ttl { text-align: right; font-weight: 800; font-size: 14px; flex: none } .dh .ttl span { display: block; font-weight: 400; font-size: 11px; opacity: .85 }
  `;
}
function printHead(t, title, sub) {
  const ini = escHtml(initialsOf(t.name));
  return `<div class="dh">${t.logo ? `<div class="crest"><img src="${t.logo}" alt=""></div>` : `<div class="crest ini">${ini}</div>`}
    <div class="who"><h1>${escHtml(t.name)}</h1>${t.motto ? `<div class="motto">${escHtml(t.motto)}</div>` : ''}<div class="sub">${[t.address, t.phone ? 'Tel ' + t.phone : '', t.email].filter(Boolean).map(escHtml).join(' &nbsp;|&nbsp; ')}</div></div>
    <div class="ttl">${escHtml(title)}${sub ? `<span>${escHtml(sub)}</span>` : ''}</div></div>`;
}

async function pupilStatement(pupilId, after) {
  const d = await tryApi('pupilStatement', { pupil_id: pupilId });
  if (!d) return;
  const p = d.pupil;
  const typeName = { fees: 'Fees', extra: 'Extra', waiver: 'Waiver', payment: 'Payment' };
  modal({
    title: 'Fee statement — ' + p.name,
    wide: true,
    body: h('div', { class: 'stack', style: 'gap:10px' },
      h('div', { class: 'row' }, h('span', {}, `${p.adm_no} · ${p.class_name} · Balance: `, balBadge(d.balance)), h('span', { class: 'spacer' }),
        h('button', { class: 'btn sm', onclick: () => saveCsv(`fees-${p.adm_no}.csv`, d.lines, [['date', 'Date'], [(l) => typeName[l.type], 'Type'], ['label', 'Details'], [(l) => (l.type === 'payment' ? '' : l.amount), 'Charged'], [(l) => (l.type === 'payment' && !l.voided ? l.amount : ''), 'Paid'], ['balance', 'Balance']]) }, 'Export CSV'),
        !isPhone() ? h('button', { class: 'btn sm', onclick: () => printHtml(statementHtml(d)) }, 'Print') : null),
      d.lines.length
        ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Details'), h('th', { class: 'num' }, 'Charged'), h('th', { class: 'num' }, 'Paid'), h('th', { class: 'num' }, 'Balance'), h('th', {})),
          d.lines.map((l) => h('tr', { style: l.voided ? 'opacity:.5;text-decoration:line-through' : '' }, h('td', {}, l.date), h('td', {}, l.label),
            h('td', { class: 'num' }, l.type === 'payment' ? '' : money(l.amount)), h('td', { class: 'num' }, l.type === 'payment' ? money(l.amount) : ''), h('td', { class: 'num' }, money(l.balance)),
            h('td', { style: 'text-align:right;white-space:nowrap' },
              l.type === 'payment' ? h('button', { class: 'btn sm', onclick: async () => { const pay = await tryApi('getFeePayment', { id: l.id }); if (pay) printJob('fee', { payment: pay, copy: true }); } }, 'Reprint') : null,
              l.type === 'payment' && !l.voided && can('manager') ? [' ', h('button', { class: 'btn sm danger', onclick: async () => { const why = await promptBox('Void ' + l.receipt_no, 'Why is this payment being cancelled?'); if (why && (await tryApi('voidFeePayment', { id: l.id, reason: why }))) { toast('Voided.'); document.querySelector('#modal-root .overlay:last-child')?.remove(); pupilStatement(pupilId, after); after && after(); } } }, 'Void')] : null,
              (l.type === 'extra' || l.type === 'waiver') && can('admin') ? h('button', { class: 'btn sm', onclick: async () => { if (await confirmBox('Remove this line?', l.label, 'Remove', true) && (await tryApi('deleteFeeAdjustment', { id: l.id }))) { document.querySelector('#modal-root .overlay:last-child')?.remove(); pupilStatement(pupilId, after); after && after(); } } }, 'Remove') : null))))
        : h('div', { class: 'empty' }, 'Nothing charged or paid yet.')),
  });
}

function statementHtml(d) {
  const t = S.tenant;
  const p = d.pupil;
  const rows = d.lines.map((l) => `<tr${l.voided ? ' class="v"' : ''}><td>${escHtml(l.date)}</td><td>${escHtml(l.label)}</td><td class="r">${l.type === 'payment' ? '' : money(l.amount)}</td><td class="r">${l.type === 'payment' ? money(l.amount) : ''}</td><td class="r">${money(l.balance)}</td></tr>`).join('');
  const charged = d.lines.filter((l) => l.type !== 'payment' && !l.voided).reduce((a, l) => a + Number(l.amount || 0), 0);
  const paid = d.lines.filter((l) => l.type === 'payment' && !l.voided).reduce((a, l) => a + Number(l.amount || 0), 0);
  const pay = mpesaHtml(t, p.adm_no, ' ').trim();
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 12mm } body { font: 12px/1.45 'Segoe UI', Arial, sans-serif; color: #111; margin: 0 }
    ${printTheme(t)}
    .info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 14px; background: var(--soft); border-radius: 8px; padding: 10px 12px; margin: 12px 0 }
    .info div { font-size: 11px; color: #555 } .info b { display: block; font-size: 13px; color: #111 }
    table { width: 100%; border-collapse: collapse } th { background: var(--side); color: #fff; text-align: left; padding: 6px 8px; font-size: 11px }
    th:first-child { border-radius: 6px 0 0 0 } th:last-child { border-radius: 0 6px 0 0 }
    td { border-bottom: 1px solid #e3e3ea; padding: 5px 8px } tr:nth-child(even) td { background: #fafafd } .r { text-align: right } .v td { text-decoration: line-through; color: #888 }
    .rn { color: #777; font-size: 10.5px }
    .sum { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px } .sum div { border: 1px solid #e3e3ea; border-radius: 8px; padding: 8px 14px; min-width: 130px; text-align: right; font-size: 11px; color: #555 }
    .sum b { display: block; font-size: 15px; color: #111 } .sum .bal { background: var(--side); color: #fff; border-color: transparent } .sum .bal b { color: #fff; font-size: 17px }
    .pay { margin-top: 14px; border: 1.5px dashed var(--acc); border-radius: 8px; padding: 8px 12px; font-size: 12px }
    .foot { margin-top: 18px; font-size: 10.5px; color: #777; display: flex; justify-content: space-between }
  </style></head><body>
    ${printHead(t, 'FEE STATEMENT', d.term_name || '')}
    <div class="info"><div>Pupil<b>${escHtml(p.name)}</b></div><div>Adm no<b>${escHtml(p.adm_no)}</b></div><div>Class<b>${escHtml(p.class_name || '—')}</b></div>
      <div>Parent<b>${escHtml(p.guardian_name || '—')}</b></div><div>Phone<b>${escHtml(p.guardian_phone || '—')}</b></div><div>Date<b>${escHtml(new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}</b></div></div>
    <table><tr><th>Date</th><th>Details</th><th class="r">Charged</th><th class="r">Paid</th><th class="r">Balance</th></tr>${rows}</table>
    <div class="sum"><div>Total charged<b>${money(charged)}</b></div><div>Total paid<b>${money(paid)}</b></div><div class="bal">${d.balance < 0 ? 'Credit' : 'Balance due'}<b>${escHtml(t.currency)} ${money(Math.abs(d.balance))}</b></div></div>
    ${pay ? `<div class="pay">Pay fees by ${pay}</div>` : ''}
    <div class="foot"><span>Printed ${escHtml(new Date().toLocaleString('en-GB'))}</span><span>Signature & stamp ____________________</span></div>
  </body></html>`;
}

function feeReceiptHtml(p, { copy = false } = {}) {
  const t = S.tenant;
  const w = paperWidth();
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: ${w}mm auto; margin: 0 }
    body { width: ${w - 6}mm; margin: 2mm 3mm; font: 11px/1.35 Consolas, 'DejaVu Sans Mono', monospace; color: #000 }
    h1 { font-size: 14px; text-align: center; margin: 0 0 2px } .c { text-align: center } .r { text-align: right }
    table { width: 100%; border-collapse: collapse } td { padding: 0; vertical-align: top }
    hr { border: 0; border-top: 1px dashed #000; margin: 5px 0 } .b { font-weight: bold; font-size: 13px }
    .lg { display: block; margin: 0 auto 3px; max-width: 26mm; max-height: 22mm; object-fit: contain } .m { text-align: center; font-style: italic; font-size: 10px }
  </style></head><body>
    ${t.logo ? `<img class="lg" src="${t.logo}" alt="">` : ''}
    <h1>${escHtml(t.name)}</h1>${t.motto ? `<div class="m">${escHtml(t.motto)}</div>` : ''}
    <div class="c">${escHtml(t.address)}${t.phone ? '<br>Tel: ' + escHtml(t.phone) : ''}${mpesaHtml(t, p.adm_no)}</div>
    <div class="c b">FEE RECEIPT${copy ? ' (COPY)' : ''}</div><hr>
    <table><tr><td>${escHtml(p.receipt_no)}</td><td class="r">${escHtml(p.paid_on)}</td></tr></table>
    <div>Pupil: ${escHtml(p.pupil_name)}</div>
    <table><tr><td>Adm: ${escHtml(p.adm_no)}</td><td class="r">${escHtml(p.class_name)}</td></tr></table>
    ${p.term_name ? `<div>Term: ${escHtml(p.term_name)}</div>` : ''}
    ${p.voided ? '<div class="c b">*** VOIDED ***</div>' : ''}<hr>
    <table><tr class="b"><td>PAID ${escHtml(t.currency)}</td><td class="r">${money(p.amount)}</td></tr>
    <tr><td colspan="2">${escHtml(p.method_name)}${p.reference ? ' ' + escHtml(p.reference) : ''}</td></tr>
    <tr><td>Fee balance</td><td class="r">${money(p.balance_after)}</td></tr></table>
    ${p.balance_after < 0 ? '<div>(credit carried forward)</div>' : ''}<hr>
    <div>Received by: ${escHtml(p.received_by)}</div><br>
  </body></html>`;
}

// ================= Fees (manager) =================
async function pageFees(main) {
  const wrap = h('div', { class: 'page' });
  const body = h('div', { class: 'stack', style: 'gap:16px' });
  const tab = SCH.feeTab;
  add(wrap,
    h('div', { class: 'page-head' }, h('h1', {}, 'Fees'), h('span', { class: 'spacer' }), canMoney() ? h('button', { class: 'btn primary', onclick: () => receiveFees(null, () => go('fees')) }, '💰 Receive fees') : null),
    tabs([['balances', 'Balances'], ['collections', 'Collections'], ['structure', 'Fee structure'], ['items', 'Fee items']], tab, (id) => { SCH.feeTab = id; go('fees'); }),
    body);
  add(main, wrap);
  ({ balances: feeBalances, collections: feeCollections, structure: feeStructure, items: feeItems }[tab] || feeBalances)(body);
}

async function feeBalances(box) {
  const terms = (await tryApi('listTerms')) || [];
  const st = (SCH.balTerm = SCH.balTerm || (terms.find((t) => t.is_current) || terms[0] || {}).id);
  const r = await tryApi('classBalances', { term_id: st });
  if (!r) return;
  const owing = (await tryApi('listPupils', { owing: true })) || [];
  const info = await schoolInfo();
  const T = r.totals;
  put(box,
    h('div', { class: 'row', style: 'gap:8px' }, h('span', {}, 'Term:'), h('select', { class: 'input', style: 'width:auto', onchange: (e) => { SCH.balTerm = Number(e.target.value); go('fees'); } }, terms.map((t) => h('option', { value: t.id, selected: t.id === st }, t.name)))),
    h('div', { class: 'card' }, h('table', { class: 'list' },
      h('tr', {}, h('th', {}, 'Class'), h('th', { class: 'num' }, 'Pupils'), h('th', { class: 'num' }, `Fees ${r.term.name}`), h('th', { class: 'num' }, 'Paid this term'), h('th', { class: 'num' }, '% paid'), h('th', { class: 'num' }, 'Owed (all terms)'), h('th', { class: 'num' }, 'Pupils owing')),
      r.rows.map((c) => h('tr', { style: 'cursor:pointer', onclick: () => { SCH.pupilFilter = { q: '', class_id: String(c.class_id), status: 'active', owing: true }; go('pupils'); } }, h('td', {}, h('b', {}, c.class_name)), h('td', { class: 'num' }, c.pupils), h('td', { class: 'num' }, money(c.billed)), h('td', { class: 'num' }, money(c.paid)), h('td', { class: 'num' }, c.billed ? Math.round((c.paid / c.billed) * 100) + '%' : '—'), h('td', { class: 'num' }, money(c.owed)), h('td', { class: 'num' }, c.owing))),
      h('tr', { style: 'font-weight:700' }, h('td', {}, 'Total'), h('td', { class: 'num' }, T.pupils), h('td', { class: 'num' }, money(T.billed)), h('td', { class: 'num' }, money(T.paid)), h('td', { class: 'num' }, T.billed ? Math.round((T.paid / T.billed) * 100) + '%' : '—'), h('td', { class: 'num' }, money(T.owed)), h('td', { class: 'num' }, T.owing)))),
    h('div', { class: 'row' }, h('h2', {}, `Pupils owing (${owing.length})`), h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', onclick: () => saveCsv('fee-balances.csv', owing, [['adm_no', 'Adm no'], ['name', 'Name'], ['class_name', 'Class'], ['guardian_name', 'Parent'], ['guardian_phone', 'Phone'], ['balance', 'Balance']]) }, 'Export CSV'),
      h('button', { class: 'btn sm', onclick: async () => { const text = owing.map((p) => `${p.guardian_phone || '(no phone)'}\t${feeReminderText(p, info.term && info.term.name)}`).join('\n'); if (navigator.clipboard) await navigator.clipboard.writeText(text).catch(() => {}); toast(`Copied ${owing.length} reminder(s).`); } }, 'Copy all reminders')),
    h('div', { class: 'card' }, owing.length ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Adm'), h('th', {}, 'Name'), h('th', {}, 'Class'), h('th', {}, 'Parent phone'), h('th', { class: 'num' }, 'Balance'), h('th', {})),
      owing.sort((a, b) => b.balance - a.balance).map((p) => h('tr', {}, h('td', {}, p.adm_no), h('td', {}, h('b', {}, p.name)), h('td', {}, p.class_name), h('td', {}, p.guardian_phone || '—'), h('td', { class: 'num' }, money(p.balance)),
        h('td', { style: 'text-align:right;white-space:nowrap' }, h('button', { class: 'btn sm', onclick: () => remindParent(p) }, 'WhatsApp'), ' ', h('button', { class: 'btn sm primary', onclick: () => receiveFees(p, () => go('fees')) }, 'Pay')))))
      : h('div', { class: 'empty' }, 'Nobody owes fees. 🎉')));
}

async function feeCollections(box) {
  const st = (SCH.colFilter = SCH.colFilter || { from: todayStr(), to: todayStr() });
  const r = await tryApi('feeCollections', st);
  if (!r) return;
  const d = new Date();
  const iso = (x) => x.toLocaleDateString('en-CA');
  const preset = (label, from, to) => h('button', { class: 'btn sm', onclick: () => { st.from = from; st.to = to; go('fees'); } }, label);
  const small = (title, rows) => h('div', { class: 'card' }, h('div', { class: 'card pad', style: 'border:0;box-shadow:none;padding-bottom:4px' }, h('h2', {}, title)), rows.length ? h('table', { class: 'list' }, rows.map((x) => h('tr', {}, h('td', {}, x.key), h('td', { class: 'num' }, x.count), h('td', { class: 'num' }, money(x.amount))))) : h('div', { class: 'empty' }, '—'));
  put(box,
    h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, preset('Today', todayStr(), todayStr()), preset('This week', iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))), todayStr()), preset('This month', iso(new Date(d.getFullYear(), d.getMonth(), 1)), todayStr()),
      h('input', { class: 'input', type: 'date', value: st.from, style: 'width:auto', onchange: (e) => { st.from = e.target.value; go('fees'); } }), h('span', { class: 'muted' }, 'to'),
      h('input', { class: 'input', type: 'date', value: st.to, style: 'width:auto', onchange: (e) => { st.to = e.target.value; go('fees'); } }),
      h('span', { class: 'spacer' }), h('button', { class: 'btn sm', onclick: () => saveCsv(`fee-collections_${st.from}_${st.to}.csv`, r.rows, [['paid_on', 'Date'], ['receipt_no', 'Receipt'], ['adm_no', 'Adm no'], ['pupil_name', 'Pupil'], ['class_name', 'Class'], ['method_name', 'Method'], ['reference', 'Reference'], ['amount', 'Amount'], ['received_by', 'Received by'], [(x) => (x.voided ? 'VOID: ' + x.void_reason : ''), 'Voided']]) }, 'Export CSV')),
    h('div', { class: 'stats' }, h('div', { class: 'card stat' }, h('div', { class: 'k' }, 'Collected'), h('div', { class: 'v' }, money(r.total)), h('div', { class: 'muted small' }, `${r.count} payment(s)${r.voided ? ` · ${r.voided} voided` : ''}`))),
    h('div', { class: 'grid2' }, small('By method', r.byMethod), small('Received by', r.byUser)),
    h('div', { class: 'grid2' }, small('By class', r.byClass), small('By day', r.byDay)),
    h('div', { class: 'card' }, r.rows.length ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Receipt'), h('th', {}, 'Pupil'), h('th', {}, 'Method'), h('th', { class: 'num' }, 'Amount'), h('th', {}, 'By')),
      r.rows.map((x) => h('tr', { style: x.voided ? 'opacity:.5;text-decoration:line-through' : '' }, h('td', {}, x.paid_on), h('td', {}, x.receipt_no), h('td', {}, x.pupil_name, h('span', { class: 'muted small' }, ` · ${x.adm_no} · ${x.class_name}`)), h('td', {}, x.method_name, x.reference ? h('span', { class: 'muted small' }, ' ' + x.reference) : null), h('td', { class: 'num' }, money(x.amount)), h('td', {}, x.received_by || '—'))))
      : h('div', { class: 'empty' }, 'No fee payments in this period.')));
}

async function feeStructure(box) {
  const terms = (await tryApi('listTerms')) || [];
  const cur = (SCH.structTerm = SCH.structTerm || (terms.find((t) => t.is_current) || terms[0] || {}).id);
  const d = await tryApi('getFeeStructure', { term_id: cur });
  if (!d) return;
  const edit = can('manager');
  const cells = [];
  const totalCell = (g) => h('td', { class: 'num', 'data-total': g }, money(d.items.filter((it) => !it.optional).reduce((a, it) => a + (d.amounts[g + '|' + it.id] || 0), 0)));
  const recalc = () => {
    for (const g of d.grades) {
      const tot = cells.filter((c) => c.dataset.grade === g && !d.items.find((i) => String(i.id) === c.dataset.item).optional).reduce((a, c) => a + (Number(c.value) || 0), 0);
      const el = box.querySelector(`[data-total="${g}"]`);
      if (el) el.textContent = money(tot);
    }
  };
  const others = terms.filter((t) => t.id !== cur);
  put(box,
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, h('span', {}, 'Term:'),
      h('select', { class: 'input', style: 'width:auto', onchange: (e) => { SCH.structTerm = Number(e.target.value); go('fees'); } }, terms.map((t) => h('option', { value: t.id, selected: t.id === cur }, t.name))),
      d.term.billed ? h('span', { class: 'badge green' }, 'Billed') : h('span', { class: 'badge warn' }, 'Not billed yet'),
      h('span', { class: 'spacer' }),
      edit && others.length ? h('button', { class: 'btn sm', onclick: async () => { const from = others[0]; if (await confirmBox('Copy fees?', `Copy every amount from ${from.name} into ${d.term.name}?`, 'Copy') && (await tryApi('copyFeeStructure', { from_term_id: from.id, to_term_id: cur }))) go('fees'); } }, `Copy from ${others[0].name}`) : null),
    h('div', { class: 'muted small' }, 'Amounts per pupil for the term. Optional items (marked *) are charged only to pupils who take that service (tick it on the pupil). Saving after billing updates every pupil’s charges.'),
    d.grades.length && d.items.length
      ? h('div', { class: 'card', style: 'overflow:auto' }, h('table', { class: 'list' },
          h('tr', {}, h('th', {}, 'Grade'), d.items.map((it) => h('th', { class: 'num' }, it.name + (it.optional ? ' *' : ''))), h('th', { class: 'num' }, 'Total (required)')),
          d.grades.map((g) => h('tr', {}, h('td', {}, h('b', {}, g)), d.items.map((it) => {
            const v = d.amounts[g + '|' + it.id] || 0;
            if (!edit) return h('td', { class: 'num' }, money(v));
            const i = h('input', { class: 'input num', type: 'number', min: '0', step: '50', value: v || '', placeholder: '0', style: 'width:100px', 'data-grade': g, 'data-item': it.id, oninput: recalc });
            cells.push(i);
            return h('td', { class: 'num' }, i);
          }), totalCell(g)))))
      : h('div', { class: 'empty' }, 'Add classes (School page) and fee items first.'),
    edit ? h('div', { class: 'row', style: 'gap:8px' },
      h('button', { class: 'btn primary', onclick: async () => { const rows = cells.map((c) => ({ grade: c.dataset.grade, fee_item_id: Number(c.dataset.item), amount: Number(c.value) || 0 })); if (await tryApi('saveFeeStructure', { term_id: cur, rows })) { toast(d.term.billed ? 'Saved. Every pupil’s charges were updated.' : 'Saved.'); go('fees'); } } }, 'Save fee structure'),
      !d.term.billed ? h('button', { class: 'btn', onclick: async () => {
        if (!(await confirmBox(`Bill ${d.term.name}?`, 'Every pupil in school is charged this term’s fees for their grade (save the structure first). You can run it again after changes; it never charges twice.', 'Bill the term'))) return;
        const r = await tryApi('billTerm', { term_id: cur });
        if (r) { toast(`Billed ${r.pupils} pupils: ${money(r.total, true)}.`); SCH.info = null; go('fees'); }
      } }, `Bill ${d.term.name}`) : null) : null);
}

async function feeItems(box) {
  const rows = await tryApi('listFeeItems');
  if (!rows) return;
  put(box,
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'What the school charges for. Optional items (lunch, transport…) are only charged to pupils who take them.'), h('span', { class: 'spacer' }), can('manager') ? h('button', { class: 'btn', onclick: () => editFeeItem(null) }, '+ Add fee item') : null),
    h('div', { class: 'card' }, h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Fee item'), h('th', {}, 'Charged to'), h('th', {}, ''), h('th', {})),
      rows.map((it) => h('tr', {}, h('td', {}, h('b', {}, it.name)), h('td', {}, it.optional ? 'Only pupils who take it' : 'Every pupil'), h('td', {}, it.active ? '' : h('span', { class: 'badge' }, 'Not in use')), h('td', { style: 'text-align:right' }, can('manager') ? h('button', { class: 'btn sm', onclick: () => editFeeItem(it) }, 'Edit') : null))))));
}

function editFeeItem(it) {
  it = it || { active: 1 };
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  add(body, field('Name', inp('name', it.name, { autofocus: true, placeholder: 'e.g. Tuition, Lunch, Transport, Activity' })), chk('optional', 'Optional: only pupils who take this service pay it', !!it.optional), it.id ? chk('active', 'In use', !!it.active) : null);
  modal({
    title: it.id ? 'Edit ' + it.name : 'Add fee item',
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { const d = formData(body); if (await tryApi('saveFeeItem', { ...d, id: it.id, active: it.id ? d.active : true })) { close(); SCH.feeTab = 'items'; go('fees'); } } }, 'Save')],
  });
}

// ================= Attendance =================
const ATT = { P: ['Present', 'green'], A: ['Absent', 'red'], L: ['Late', 'warn'], E: ['Excused', ''] };

async function pageAttendance(main) {
  const wrap = h('div', { class: 'page' });
  const body = h('div', { class: 'stack', style: 'gap:14px' });
  const tab = SCH.attTab;
  add(wrap,
    h('div', { class: 'page-head' }, h('h1', {}, 'Attendance')),
    tabs([['register', 'Class register'], ['scan', '📷 Scan QR'], ['absent', 'Absent today'], can('manager') ? ['report', 'Reports'] : null], tab, (id) => { SCH.attTab = id; go('attendance'); }),
    body);
  add(main, wrap);
  ({ register: attRegister, scan: attScan, absent: attAbsent, report: attReport }[tab] || attRegister)(body);
}

async function attRegister(box) {
  const [classes, info] = await Promise.all([tryApi('listClasses'), schoolInfo(true)]);
  if (!classes) return;
  const usable = classes.filter((c) => c.active);
  if (!SCH.attClass || !usable.some((c) => String(c.id) === String(SCH.attClass))) SCH.attClass = String((info.myClasses[0] || usable[0] || {}).id || '');
  if (!SCH.attDate) SCH.attDate = todayStr();
  if (!SCH.attClass) return put(box, h('div', { class: 'empty' }, 'Add classes on the School page first.'));
  const reg = await tryApi('attendanceRegister', { class_id: SCH.attClass, date: SCH.attDate });
  if (!reg) return;
  // start from what is saved; unmarked pupils start as Present so "Save" is one tap on a normal day
  const marks = new Map(reg.pupils.map((p) => [p.id, { status: p.status || 'P', note: p.note || '' }]));
  const summary = h('div', { class: 'muted small' });
  const showSummary = () => {
    const n = { P: 0, A: 0, L: 0, E: 0 };
    for (const m of marks.values()) n[m.status]++;
    summary.textContent = `${reg.pupils.length} pupils · ${n.P} present · ${n.A} absent · ${n.L} late · ${n.E} excused`;
  };
  const rows = reg.pupils.map((p) => {
    const btns = Object.entries(ATT).map(([k, [label]]) => h('button', { class: 'att-btn att-' + k, 'data-k': k, title: label, disabled: !reg.can_mark, onclick: () => { marks.get(p.id).status = k; paint(); } }, k));
    const row = h('div', { class: 'att-row' }, h('div', { class: 'att-name' }, h('b', {}, p.name), h('span', { class: 'muted small' }, ' ' + p.adm_no)), h('div', { class: 'att-btns' }, btns));
    const paint = () => {
      const st = marks.get(p.id).status;
      btns.forEach((b) => b.classList.toggle('on', b.dataset.k === st));
      row.dataset.st = st;
      showSummary();
    };
    paint();
    return row;
  });
  put(box,
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
      h('select', { class: 'input', style: 'width:auto', onchange: (e) => { SCH.attClass = e.target.value; go('attendance'); } }, usable.map((c) => h('option', { value: c.id, selected: String(c.id) === String(SCH.attClass) }, c.name + (info.myClasses.some((m) => m.id === c.id) ? ' (my class)' : '')))),
      h('input', { class: 'input', type: 'date', value: SCH.attDate, max: todayStr(), style: 'width:auto', disabled: !can('manager'), onchange: (e) => { SCH.attDate = e.target.value; go('attendance'); } }),
      reg.marked ? h('span', { class: 'badge green' }, `Marked${reg.marked_by ? ' by ' + reg.marked_by : ''} ${String(reg.marked_at || '').slice(11, 16)}`) : h('span', { class: 'badge warn' }, 'Not marked yet')),
    !reg.can_mark ? h('div', { class: 'notice' }, SCH.attDate !== todayStr() ? 'Only a manager can change a past day.' : `Only the class teacher${reg.class.teacher_id ? '' : ''} or a manager can mark ${reg.class.name}.`) : null,
    reg.pupils.length ? h('div', { class: 'card att-list' }, rows) : h('div', { class: 'empty' }, 'No pupils in this class.'),
    reg.pupils.length ? h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, summary, h('span', { class: 'spacer' }),
      reg.can_mark ? h('button', { class: 'btn', onclick: () => { for (const m of marks.values()) m.status = 'P'; rows.forEach((r) => r.querySelector('.att-P').click()); } }, 'All present') : null,
      reg.can_mark ? h('button', { class: 'btn primary', onclick: async (e) => {
        e.target.disabled = true;
        const r = await tryApi('saveAttendance', { class_id: reg.class.id, date: reg.date, marks: [...marks].map(([pupil_id, m]) => ({ pupil_id, ...m })) });
        e.target.disabled = false;
        if (!r) return;
        SCH.info = null;
        toast(`Saved: ${r.counts.P + r.counts.L} present, ${r.counts.A} absent.`);
        if (r.counts.A) { SCH.attTab = 'absent'; }
        go('attendance');
      } }, reg.marked ? 'Save changes' : 'Save register') : null) : null);
  showSummary();
}

async function attAbsent(box) {
  if (!SCH.attDate) SCH.attDate = todayStr();
  const rows = await tryApi('absentees', { date: SCH.attDate });
  if (!rows) return;
  const msg = (p) => `Dear ${p.guardian_name || 'Parent'}, ${p.name} (${p.class_name}) was marked absent at ${S.tenant.name} on ${SCH.attDate}. Kindly let the class teacher know the reason. Thank you.`;
  put(box,
    h('div', { class: 'row', style: 'gap:8px' }, h('input', { class: 'input', type: 'date', value: SCH.attDate, max: todayStr(), style: 'width:auto', onchange: (e) => { SCH.attDate = e.target.value; go('attendance'); } }), h('span', { class: 'muted small' }, `${rows.length} absent`)),
    h('div', { class: 'card' }, rows.length ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Pupil'), h('th', {}, 'Class'), h('th', { class: 'hide-phone' }, 'Parent'), h('th', {})),
      rows.map((p) => h('tr', {}, h('td', {}, h('b', {}, p.name), h('span', { class: 'muted small' }, ' ' + p.adm_no)), h('td', {}, p.class_name), h('td', { class: 'small hide-phone' }, p.guardian_name, ' ', p.guardian_phone),
        h('td', { style: 'text-align:right' }, p.guardian_phone ? h('button', { class: 'btn sm', onclick: async () => { const r = await window.pos.openWhatsApp({ phone: waPhone(p.guardian_phone), text: msg(p) }); if (!r.ok) toast(r.error, true); } }, 'WhatsApp parent') : h('span', { class: 'muted small' }, 'no phone')))))
      : h('div', { class: 'empty' }, 'Nobody marked absent on this day.')));
}

async function attReport(box) {
  const st = (SCH.attRep = SCH.attRep || { from: '', to: '' });
  const r = await tryApi('attendanceReport', st.from && st.to ? st : {});
  if (!r) return;
  st.from = r.from;
  st.to = r.to;
  const pct = (x) => h('span', { class: 'badge ' + (x >= 90 ? 'green' : x >= 80 ? 'warn' : 'red') }, x + '%');
  const d = new Date();
  const iso = (x) => x.toLocaleDateString('en-CA');
  const preset = (label, from, to) => h('button', { class: 'btn sm', onclick: () => { st.from = from; st.to = to; go('attendance'); } }, label);
  put(box,
    h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, preset('This term', '', ''), preset('This week', iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))), todayStr()), preset('This month', iso(new Date(d.getFullYear(), d.getMonth(), 1)), todayStr()),
      h('input', { class: 'input', type: 'date', value: r.from, style: 'width:auto', onchange: (e) => { st.from = e.target.value; go('attendance'); } }), h('span', { class: 'muted' }, 'to'),
      h('input', { class: 'input', type: 'date', value: r.to, style: 'width:auto', onchange: (e) => { st.to = e.target.value; go('attendance'); } }),
      h('span', { class: 'spacer' }), h('button', { class: 'btn sm', onclick: () => saveCsv(`attendance_${r.from}_${r.to}.csv`, r.pupils, [['adm_no', 'Adm no'], ['name', 'Name'], ['class_name', 'Class'], ['days', 'Days marked'], ['P', 'Present'], ['L', 'Late'], ['A', 'Absent'], ['E', 'Excused'], ['rate', 'Attendance %']]) }, 'Export CSV')),
    h('div', { class: 'stats' }, h('div', { class: 'card stat' }, h('div', { class: 'k' }, 'Whole school'), h('div', { class: 'v' }, r.total.rate + '%'), h('div', { class: 'muted small' }, `${r.total.A} absences · ${r.total.L} late`))),
    h('div', { class: 'card' }, r.classes.length ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Class'), h('th', { class: 'num' }, 'Days marked'), h('th', { class: 'num' }, 'Absences'), h('th', { class: 'num hide-phone' }, 'Late'), h('th', { class: 'num' }, 'Attendance')),
      r.classes.map((c) => h('tr', {}, h('td', {}, h('b', {}, c.class_name)), h('td', { class: 'num' }, c.school_days), h('td', { class: 'num' }, c.A), h('td', { class: 'num hide-phone' }, c.L), h('td', { class: 'num' }, pct(c.rate)))))
      : h('div', { class: 'empty' }, 'No registers marked in this period.')),
    h('h2', {}, `Often absent (below ${r.below}%)`),
    h('div', { class: 'card' }, r.often_absent.length ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Pupil'), h('th', {}, 'Class'), h('th', { class: 'num' }, 'Absent'), h('th', { class: 'num' }, 'Attendance'), h('th', {})),
      r.often_absent.map((p) => h('tr', {}, h('td', {}, h('b', {}, p.name), h('span', { class: 'muted small' }, ' ' + p.adm_no)), h('td', {}, p.class_name), h('td', { class: 'num' }, `${p.A} of ${p.days}`), h('td', { class: 'num' }, pct(p.rate)), h('td', { style: 'text-align:right' }, h('button', { class: 'btn sm', onclick: () => openPupil(p.id) }, 'Open')))))
      : h('div', { class: 'empty' }, 'No pupil is below ' + r.below + '%.')));
}

// ================= Exams & report cards =================
SCH.examTab = 'marks';
SCH.exam = {};
const LEVEL_COLOR = (code) => (/^EE/.test(code) ? 'green' : /^ME/.test(code) ? '' : /^AE/.test(code) ? 'warn' : 'red');
const levelFor = (scale, pct) => (pct === null || pct === undefined || isNaN(pct) ? null : [...scale].sort((a, b) => b.min - a.min).find((l) => pct >= l.min) || scale[scale.length - 1]);

async function pageExams(main) {
  const wrap = h('div', { class: 'page' });
  const body = h('div', { class: 'stack', style: 'gap:14px' });
  const info = await schoolInfo();
  const ct = can('manager') || (info.myClasses && info.myClasses.length);
  const tab = SCH.examTab;
  add(wrap,
    h('div', { class: 'page-head' }, h('h1', {}, 'Exams')),
    tabs([['marks', 'Enter marks'], ct ? ['results', 'Results'] : null, ct ? ['cards', 'Report cards'] : null, can('manager') ? ['exams', 'Exams'] : null, can('manager') ? ['subjects', 'Subjects & teachers'] : null, can('admin') ? ['grading', 'Grading'] : null], tab, (id) => { SCH.examTab = id; go('exams'); }),
    body);
  add(main, wrap);
  ({ marks: examMarks, results: examResultsTab, cards: examCards, exams: examList, subjects: examSubjects, grading: examGrading }[tab] || examMarks)(body);
}

// exam + class pickers shared by the tabs; keeps the choice while moving between tabs
async function examPickers(box, { classes, onChange }) {
  const exams = (await tryApi('listExams', { all: true })) || [];
  if (!exams.length) {
    put(box, h('div', { class: 'empty' }, can('manager') ? 'No exams yet. Add one under the Exams tab (e.g. Opener, Mid-term, End term).' : 'No exams yet. Ask the head teacher to add one.'));
    return null;
  }
  const st = SCH.exam;
  if (!exams.some((e) => e.id === st.exam_id)) st.exam_id = exams.find((e) => !e.locked)?.id || exams[0].id;
  if (!classes.some((c) => c.id === st.class_id)) st.class_id = (classes[0] || {}).id;
  const row = h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
    h('select', { class: 'input', style: 'width:auto', onchange: (e) => { st.exam_id = Number(e.target.value); onChange(); } }, exams.map((e) => h('option', { value: e.id, selected: e.id === st.exam_id }, e.label + (e.locked ? ' 🔒' : '')))),
    classes.length ? h('select', { class: 'input', style: 'width:auto', onchange: (e) => { st.class_id = Number(e.target.value); onChange(); } }, classes.map((c) => h('option', { value: c.id, selected: c.id === st.class_id }, c.name))) : null);
  return { row, exams, exam: exams.find((e) => e.id === st.exam_id) };
}

async function examMarks(box) {
  const classes = (await tryApi('myMarkClasses')) || [];
  if (!classes.length) return put(box, h('div', { class: 'empty' }, 'You have no classes or subjects to enter marks for. The head teacher sets subject teachers under Exams → Subjects & teachers (class teachers can enter all subjects of their class).'));
  const p = await examPickers(box, { classes, onChange: () => go('exams') });
  if (!p) return;
  const st = SCH.exam;
  const cls = classes.find((c) => c.id === st.class_id);
  if (!cls.subjects.some((x) => x.id === st.subject_id)) st.subject_id = cls.subjects[0].id;
  add(p.row, h('select', { class: 'input', style: 'width:auto', onchange: (e) => { st.subject_id = Number(e.target.value); go('exams'); } }, cls.subjects.map((x) => h('option', { value: x.id, selected: x.id === st.subject_id }, x.name))));
  const d = await tryApi('markSheet', { exam_id: st.exam_id, class_id: st.class_id, subject_id: st.subject_id });
  if (!d) return;
  const inputs = [];
  const rows = d.pupils.map((pu) => {
    const lvl = h('span', { class: 'badge' });
    const showLvl = () => {
      const v = score.value === '' ? null : (Number(score.value) / d.exam.out_of) * 100;
      const l = v === null || isNaN(v) ? null : levelFor(d.scale, v);
      lvl.textContent = l ? l.code : '—';
      lvl.className = 'badge ' + (l ? LEVEL_COLOR(l.code) : '');
      score.classList.toggle('bad', v !== null && (isNaN(v) || v < 0 || v > 100));
    };
    const score = h('input', { class: 'input num mark-in', type: 'number', inputMode: 'decimal', min: 0, max: d.exam.out_of, step: '0.5', value: pu.score ?? '', disabled: !d.can_edit, oninput: showLvl,
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); const i = inputs.indexOf(score); (inputs[i + 1] || score).focus(); } } });
    const comment = h('input', { class: 'input mark-comment', value: pu.comment || '', placeholder: 'Comment (optional)', disabled: !d.can_edit });
    inputs.push(score);
    showLvl();
    return { pu, score, comment, el: h('div', { class: 'mark-row' }, h('div', { class: 'att-name' }, h('b', {}, pu.name), h('span', { class: 'muted small' }, ' ' + pu.adm_no)), comment, score, lvl) };
  });
  const entered = d.pupils.filter((x) => x.score !== null && x.score !== undefined).length;
  put(box, p.row,
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, h('span', { class: 'muted small' }, `${d.subject.name} · ${d.class.name} · out of ${d.exam.out_of} · ${entered}/${d.pupils.length} entered`), d.locked ? h('span', { class: 'badge' }, '🔒 Locked') : null),
    !d.can_edit && !d.locked ? h('div', { class: 'notice' }, 'You can see these marks but only the subject teacher or a manager can change them.') : null,
    d.pupils.length ? h('div', { class: 'card att-list' }, rows.map((r) => r.el)) : h('div', { class: 'empty' }, 'No pupils in this class.'),
    d.can_edit && d.pupils.length ? h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Leave a box empty for a pupil who did not sit the exam.'), h('span', { class: 'spacer' }), h('button', { class: 'btn primary', onclick: async (e) => {
      e.target.disabled = true;
      const r = await tryApi('saveMarks', { exam_id: st.exam_id, class_id: st.class_id, subject_id: st.subject_id, marks: rows.map((x) => ({ pupil_id: x.pu.id, score: x.score.value, comment: x.comment.value })) });
      e.target.disabled = false;
      if (r) { toast('Marks saved.'); go('exams'); }
    } }, 'Save marks')) : null);
}

async function examResultsTab(box) {
  const info = await schoolInfo();
  const classes = can('manager') ? ((await tryApi('listClasses')) || []).filter((c) => c.active) : info.myClasses;
  const p = await examPickers(box, { classes, onChange: () => go('exams') });
  if (!p) return;
  const r = await tryApi('examResults', { exam_id: SCH.exam.exam_id, class_id: SCH.exam.class_id });
  if (!r) return;
  const subs = r.subjects;
  const cols = [['adm_no', 'Adm'], ['name', 'Name'], ...subs.map((x) => [(row) => (row.scores[x.id] ? row.scores[x.id].score : ''), x.short || x.name]), ['total', 'Total'], ['average', 'Average %'], ['level', 'Level'], ['position', 'Position']];
  put(box, p.row,
    h('div', { class: 'stats' },
      h('div', { class: 'card stat' }, h('div', { class: 'k' }, 'Class average'), h('div', { class: 'v' }, r.class_mean === null ? '—' : r.class_mean + '%'), h('div', { class: 'muted small' }, r.class_level || '')),
      h('div', { class: 'card stat' }, h('div', { class: 'k' }, 'Pupils with marks'), h('div', { class: 'v' }, `${r.rows.filter((x) => x.count).length}/${r.rows.length}`), h('div', { class: 'muted small' }, `out of ${r.out_of} per subject`))),
    h('div', { class: 'row', style: 'gap:8px' }, h('h2', {}, 'Mark sheet'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', onclick: () => saveCsv(`results-${r.class.name}-${r.exam.name}.csv`.replace(/\s+/g, '_'), [...r.rows].sort((a, b) => (a.position || 999) - (b.position || 999)), cols) }, 'Export CSV'),
      !isPhone() ? h('button', { class: 'btn sm', onclick: () => printHtml(broadsheetHtml(r)) }, 'Print') : null),
    h('div', { class: 'card' }, h('table', { class: 'list results' },
      h('tr', {}, h('th', {}, '#'), h('th', {}, 'Pupil'), subs.map((x) => h('th', { class: 'num', title: x.name }, x.short || x.name)), h('th', { class: 'num' }, 'Total'), h('th', { class: 'num' }, 'Avg'), h('th', {}, 'Level')),
      [...r.rows].sort((a, b) => (a.position || 999) - (b.position || 999) || a.name.localeCompare(b.name)).map((row) => h('tr', {}, h('td', {}, row.position || '—'), h('td', {}, h('b', {}, row.name)),
        subs.map((x) => { const sc = row.scores[x.id]; return h('td', { class: 'num' }, sc ? [String(sc.score), h('div', { class: 'muted small' }, sc.level)] : h('span', { class: 'muted' }, '—')); }),
        h('td', { class: 'num' }, row.count ? row.total : '—'), h('td', { class: 'num' }, row.average ?? '—'), h('td', {}, row.level ? h('span', { class: 'badge ' + LEVEL_COLOR(row.level) }, row.level) : ''))),
      h('tr', { style: 'font-weight:700' }, h('td', {}), h('td', {}, 'Subject average'), r.stats.map((x) => h('td', { class: 'num' }, x.mean === null ? '—' : [x.mean + '%', h('div', { class: 'muted small' }, x.level)])), h('td', {}), h('td', { class: 'num' }, r.class_mean ?? '—'), h('td', {}, r.class_level)))),
    h('div', { class: 'muted small' }, 'Missing marks: ', r.stats.filter((x) => x.entered < r.rows.length).map((x) => `${x.name} ${x.entered}/${r.rows.length}${x.teacher ? ' (' + x.teacher + ')' : ''}`).join(' · ') || 'none'));
}

function broadsheetHtml(r) {
  const t = S.tenant;
  const subs = r.subjects;
  const rows = [...r.rows].sort((a, b) => (a.position || 999) - (b.position || 999)).map((row) => `<tr><td>${row.position || ''}</td><td>${escHtml(row.adm_no)}</td><td>${escHtml(row.name)}</td>${subs.map((x) => `<td class="r">${row.scores[x.id] ? row.scores[x.id].score + ' <small>' + row.scores[x.id].level + '</small>' : ''}</td>`).join('')}<td class="r">${row.count ? row.total : ''}</td><td class="r">${row.average ?? ''}</td><td>${row.level}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page { size: A4 landscape; margin: 10mm } body { font: 11px 'Segoe UI', Arial, sans-serif } table { width: 100%; border-collapse: collapse } th, td { border: 1px solid #999; padding: 3px 4px } th { background: #eee } .r { text-align: right } small { color: #555 }</style></head><body>
    <h2 style="margin:0">${escHtml(t.name)} — ${escHtml(r.class.name)} — ${escHtml(r.exam.name)} (${escHtml(r.exam.term_name)})</h2><div>Out of ${r.out_of} per subject · Class average ${r.class_mean ?? '—'}% ${r.class_level}</div><br>
    <table><tr><th>#</th><th>Adm</th><th>Name</th>${subs.map((x) => `<th>${escHtml(x.short || x.name)}</th>`).join('')}<th>Total</th><th>Avg %</th><th>Level</th></tr>${rows}
    <tr><th></th><th></th><th>Subject average</th>${r.stats.map((x) => `<th class="r">${x.mean ?? ''}</th>`).join('')}<th></th><th class="r">${r.class_mean ?? ''}</th><th>${r.class_level}</th></tr></table></body></html>`;
}

async function examCards(box) {
  const info = await schoolInfo();
  const classes = can('manager') ? ((await tryApi('listClasses')) || []).filter((c) => c.active) : info.myClasses;
  const p = await examPickers(box, { classes, onChange: () => go('exams') });
  if (!p) return;
  const st = SCH.exam;
  const d = await tryApi('reportCards', { exam_id: st.exam_id, class_id: st.class_id });
  if (!d) return;
  const html = (cards) => reportCardsHtml({ ...d, cards });
  const out = async (cards, name) => {
    if (isPhone()) {
      const r = await window.pos.shareHtml(name, W(html(cards)));
      if (!r.ok) toast(r.error, true);
    } else printHtml(html(cards));
  };
  const resultsText = (c) => `${S.tenant.name}: ${d.exam.name} results (${d.term_name}) for ${c.pupil.name}, ${d.class.name}:\n` + c.subjects.filter((x) => x.score !== undefined).map((x) => `${x.name}: ${x.score}/${d.out_of} (${x.level})`).join('\n') + `\nAverage: ${c.pupil.average ?? '—'}% (${c.pupil.level || '—'})` + (c.position ? `\nPosition: ${c.position}` : '') + (c.remarks.class_teacher ? `\nTeacher: ${c.remarks.class_teacher}` : '');
  put(box, p.row,
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
      h('span', { class: 'muted small' }, `${d.cards.length} pupil(s) · class average ${d.class_mean ?? '—'}%`), h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: async () => { const r = await tryApi('autoRemarks', { exam_id: st.exam_id, class_id: st.class_id }); if (r) { toast(`Filled ${r.filled} empty class-teacher remark(s).`); go('exams'); } } }, 'Fill empty remarks'),
      can('manager') ? h('button', { class: 'btn', onclick: async () => { const r = await tryApi('autoRemarks', { exam_id: st.exam_id, class_id: st.class_id, head: true }); if (r) { toast(`Filled ${r.filled} empty head-teacher remark(s).`); go('exams'); } } }, 'Fill head teacher remarks') : null,
      h('button', { class: 'btn primary', onclick: () => out(d.cards, `report-cards-${d.class.name}-${d.exam.name}.html`.replace(/\s+/g, '_')) }, isPhone() ? 'Share all report cards' : 'Print all report cards')),
    !d.next_opens ? h('div', { class: 'muted small' }, 'Tip: add next term with its opening date (School → Terms) so report cards show when school reopens.') : null,
    h('div', { class: 'card' }, h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Pupil'), h('th', { class: 'num' }, 'Average'), h('th', {}, 'Level'), h('th', { class: 'hide-phone' }, 'Class teacher remark'), h('th', {})),
      d.cards.map((c) => h('tr', {}, h('td', {}, h('b', {}, c.pupil.name), h('span', { class: 'muted small' }, ' ' + c.pupil.adm_no)), h('td', { class: 'num' }, c.pupil.average ?? '—'), h('td', {}, c.pupil.level ? h('span', { class: 'badge ' + LEVEL_COLOR(c.pupil.level) }, c.pupil.level) : '—'),
        h('td', { class: 'small hide-phone' }, c.remarks.class_teacher || h('span', { class: 'muted' }, '—')),
        h('td', { style: 'text-align:right;white-space:nowrap' },
          h('button', { class: 'btn sm', onclick: () => editRemarks(d, c) }, 'Remarks'), ' ',
          h('button', { class: 'btn sm', onclick: () => out([c], `report-${c.pupil.adm_no}-${d.exam.name}.html`.replace(/\s+/g, '_')) }, isPhone() ? 'Share' : 'Print'), ' ',
          c.pupil.guardian_phone ? h('button', { class: 'btn sm', onclick: async () => { const r = await window.pos.openWhatsApp({ phone: waPhone(c.pupil.guardian_phone), text: resultsText(c) }); if (!r.ok) toast(r.error, true); } }, 'WhatsApp') : null))))));
}

function editRemarks(d, c) {
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  const ct = h('textarea', { class: 'input', rows: 3, value: c.remarks.class_teacher, placeholder: c.remarks.suggested });
  const ht = h('textarea', { class: 'input', rows: 3, value: c.remarks.head_teacher, placeholder: c.remarks.suggested, disabled: !can('manager') });
  add(body, h('div', { class: 'muted small' }, `${c.pupil.name} · average ${c.pupil.average ?? '—'}% (${c.pupil.level || '—'})`), field('Class teacher remark', ct), field('Head teacher remark' + (can('manager') ? '' : ' (head teacher only)'), ht));
  modal({
    title: 'Remarks — ' + c.pupil.name,
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { if (await tryApi('saveRemarks', { exam_id: d.exam.id, pupil_id: c.pupil.id, class_teacher: ct.value, head_teacher: ht.value })) { close(); go('exams'); } } }, 'Save')],
  });
}

function reportCardsHtml(d) {
  const t = S.tenant;
  const scale = [...d.scale].sort((a, b) => b.min - a.min);
  // level colours: best = green … lowest = red
  const tones = ['#1f9d55', '#2b6cb0', '#c98a0b', '#c0392b'];
  const toneOf = (code) => {
    const i = scale.findIndex((l) => l.code === code);
    if (i < 0) return '#888';
    return tones[Math.min(tones.length - 1, Math.round((i / Math.max(1, scale.length - 1)) * (tones.length - 1)))];
  };
  const chip = (code) => (code ? `<span class="chip" style="background:${toneOf(code)}">${escHtml(code)}</span>` : '—');
  const bar = (pct) => (pct === null || pct === undefined || pct === '' ? '' : `<span class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%"></i></span>`);
  const key = scale.map((l) => `<span class="k"><span class="chip" style="background:${toneOf(l.code)}">${escHtml(l.code)}</span> ${escHtml(l.label || '')} ${l.min}%+</span>`).join('');
  const card = (c) => {
    const trend = c.trend.filter((x) => x.average !== null);
    return `<section class="card">
    ${printHead(t, "LEARNER'S REPORT", `${d.exam.name}, ${d.term_name}`)}
    <div class="info"><div>Name<b>${escHtml(c.pupil.name)}</b></div><div>Adm no<b>${escHtml(c.pupil.adm_no)}</b></div><div>Class<b>${escHtml(d.class.name)}</b></div><div>Class teacher<b>${escHtml(d.class_teacher || '—')}</b></div></div>
    <div class="sum">
      <div><span>Average</span><b>${c.pupil.average ?? '—'}${c.pupil.average !== null && c.pupil.average !== undefined ? '%' : ''}</b></div>
      <div><span>Overall level</span><b>${chip(c.pupil.level)}</b><em>${escHtml(c.pupil.level_label || '')}</em></div>
      ${c.position ? `<div><span>Position</span><b>${escHtml(c.position)}</b></div>` : ''}
      <div><span>Attendance</span><b>${c.attendance.days ? c.attendance.rate + '%' : '—'}</b><em>${c.attendance.days ? `${c.attendance.absent} day(s) absent` : ''}</em></div>
    </div>
    <table class="marks"><tr><th>Learning area</th><th class="r">Score /${d.out_of}</th><th class="pc">%</th><th>Level</th><th>Comment</th><th>Teacher</th></tr>
    ${c.subjects.map((x) => `<tr><td><b>${escHtml(x.name)}</b></td><td class="r">${x.score ?? '—'}</td><td class="pc"><span class="pn">${x.pct ?? ''}</span>${bar(x.pct)}</td><td>${chip(x.level)}</td><td>${escHtml(x.comment || '')}</td><td class="tc">${escHtml(x.teacher || '')}</td></tr>`).join('')}
    <tr class="tot"><td>Total / average</td><td class="r">${c.pupil.count ? c.pupil.total : ''}</td><td class="pc"><span class="pn">${c.pupil.average ?? '—'}</span>${bar(c.pupil.average)}</td><td>${chip(c.pupil.level)}</td><td colspan="2">${escHtml(c.pupil.level_label || '')}</td></tr></table>
    ${trend.length ? `<div class="trend"><b>This term:</b> ${trend.map((x) => `<span>${escHtml(x.exam)} <b>${x.average}%</b></span>`).join('')}<span>${escHtml(d.exam.name)} <b>${c.pupil.average ?? '—'}%</b></span></div>` : ''}
    <div class="rems">
      <div class="rem"><h4>Class teacher's remarks</h4><p>${escHtml(c.remarks.class_teacher) || '&nbsp;'}</p><div class="sig">Signature ______________</div></div>
      <div class="rem"><h4>Head teacher's remarks</h4><p>${escHtml(c.remarks.head_teacher) || '&nbsp;'}</p><div class="sig">Signature & stamp ______________</div></div>
    </div>
    <div class="foot">
      <div><span>Fee balance</span><b>${escHtml(t.currency)} ${money(Math.abs(c.fee_balance))}${c.fee_balance < 0 ? ' credit' : ''}</b></div>
      ${d.closes ? `<div><span>Closing date</span><b>${escHtml(d.closes)}</b></div>` : ''}
      ${d.next_opens ? `<div><span>Next term opens</span><b>${escHtml(d.next_opens)}</b></div>` : ''}
      <div class="ps"><span>Parent's signature</span><b>&nbsp;</b></div>
    </div>
    <div class="key">${key}</div>
  </section>`;
  };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Report cards</title><style>
    @page { size: A4; margin: 10mm } body { font: 11.5px/1.4 'Segoe UI', Arial, sans-serif; color: #111; margin: 0 }
    ${printTheme(t)}
    .card { page-break-after: always; break-after: page; max-width: 190mm; margin: 0 auto } .card:last-child { page-break-after: auto; break-after: auto }
    .info { display: grid; grid-template-columns: 2fr 1fr 1fr 1.4fr; gap: 10px; background: var(--soft); border-radius: 8px; padding: 9px 12px; margin: 10px 0 }
    .info div, .sum > div > span, .foot > div > span { font-size: 10px; color: #666; display: block } .info b { display: block; font-size: 13px; color: #111 }
    .sum { display: flex; gap: 8px; margin-bottom: 10px } .sum > div { flex: 1; border: 1px solid #e2e2ea; border-top: 3px solid var(--acc); border-radius: 8px; padding: 7px 10px }
    .sum b { display: block; font-size: 18px; color: var(--side); margin-top: 2px } .sum em { font-style: normal; font-size: 10px; color: #666 }
    .chip { display: inline-block; min-width: 26px; text-align: center; color: #fff; font-weight: 700; font-size: 10.5px; border-radius: 99px; padding: 1px 7px }
    .sum .chip { font-size: 13px; padding: 2px 10px }
    table.marks { width: 100%; border-collapse: collapse; margin: 0 }
    .marks th { background: var(--side); color: #fff; text-align: left; font-size: 10.5px; padding: 6px 7px } .marks th:first-child { border-radius: 6px 0 0 0 } .marks th:last-child { border-radius: 0 6px 0 0 }
    .marks td { border-bottom: 1px solid #e6e6ee; padding: 5px 7px; vertical-align: middle } .marks tr:nth-child(even) td { background: #fafafd }
    .marks .tot td { background: var(--soft) !important; font-weight: 700; border-bottom: 0 } .r { text-align: right } .tc { font-size: 10.5px; color: #555 }
    .pc { width: 92px; white-space: nowrap } .pn { display: inline-block; width: 26px; text-align: right; margin-right: 5px }
    .bar { display: inline-block; width: 56px; height: 6px; background: #e8e8f0; border-radius: 99px; vertical-align: middle; overflow: hidden } .bar i { display: block; height: 100%; background: var(--grad) }
    .trend { margin: 8px 0 0; font-size: 11px; display: flex; flex-wrap: wrap; gap: 4px 14px }
    .rems { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px }
    .rem { border: 1px solid #e2e2ea; border-left: 4px solid var(--acc); border-radius: 8px; padding: 7px 10px; min-height: 74px; display: flex; flex-direction: column }
    .rem h4 { margin: 0 0 3px; font-size: 11px; color: var(--side) } .rem p { margin: 0; flex: 1 } .sig { text-align: right; font-size: 10.5px; color: #555; margin-top: 8px }
    .foot { display: flex; gap: 8px; margin-top: 10px } .foot > div { flex: 1; background: #f6f6fa; border-radius: 8px; padding: 6px 10px } .foot b { font-size: 13px } .foot .ps { flex: 1.3; background: #fff; border: 1px dashed #bbb }
    .key { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 10px; color: #444 }
  </style></head><body>${d.cards.map(card).join('')}</body></html>`;
}

async function examList(box) {
  const terms = (await tryApi('listTerms')) || [];
  const exams = (await tryApi('listExams', { all: true })) || [];
  put(box,
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Exams belong to a term. Lock an exam when marks are final so they can’t be changed.'), h('span', { class: 'spacer' }), h('button', { class: 'btn', onclick: () => editExam(null, terms) }, '+ Add exam')),
    h('div', { class: 'card' }, exams.length ? h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Exam'), h('th', {}, 'Term'), h('th', { class: 'num' }, 'Out of'), h('th', { class: 'num' }, 'Marks entered'), h('th', {}), h('th', {})),
      exams.map((e) => h('tr', {}, h('td', {}, h('b', {}, e.name)), h('td', {}, e.term_name), h('td', { class: 'num' }, e.out_of), h('td', { class: 'num' }, e.marks), h('td', {}, e.locked ? h('span', { class: 'badge' }, '🔒 Locked') : h('span', { class: 'badge green' }, 'Open')),
        h('td', { style: 'text-align:right;white-space:nowrap' },
          h('button', { class: 'btn sm', onclick: async () => { if (await tryApi('saveExam', { id: e.id, name: e.name, out_of: e.out_of, locked: !e.locked })) go('exams'); } }, e.locked ? 'Unlock' : 'Lock'), ' ',
          h('button', { class: 'btn sm', onclick: () => editExam(e, terms) }, 'Edit'), ' ',
          can('admin') && !e.marks ? h('button', { class: 'btn sm danger', onclick: async () => { if (await tryApi('deleteExam', { id: e.id })) go('exams'); } }, 'Delete') : null))))
      : h('div', { class: 'empty' }, 'No exams yet.')));
}

function editExam(e, terms) {
  e = e || { out_of: 100 };
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  add(body,
    h('div', { class: 'grid2' }, field('Exam name', inp('name', e.name || '', { autofocus: true, placeholder: 'e.g. Opener, Mid-term, End term' })), field('Marked out of', inp('out_of', e.out_of, { type: 'number', min: 1 }))),
    !e.id ? field('Term', sel('term_id', terms.map((t) => [t.id, t.name]), (terms.find((t) => t.is_current) || terms[0] || {}).id)) : null);
  modal({
    title: e.id ? 'Edit ' + e.name : 'Add exam',
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { if (await tryApi('saveExam', { ...formData(body), id: e.id, locked: !!e.locked })) { close(); go('exams'); } } }, 'Save')],
  });
}

async function examSubjects(box) {
  const [d, classes, users] = await Promise.all([tryApi('listSubjects'), tryApi('listClasses'), tryApi('listStaff')]);
  if (!d || !classes) return;
  const bandNames = d.bands;
  const addBtn = h('button', { class: 'btn primary', onclick: () => editSubject(null, bandNames) }, '+ Add subject');
  put(box,
    h('div', { class: 'row' }, h('h2', {}, 'Subjects (learning areas)'), h('span', { class: 'spacer' }), addBtn),
    h('div', { class: 'muted small' }, 'Add, rename or stop using a subject here. Tick which grades take it.'),
    h('div', { class: 'card' }, h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Subject'), h('th', {}, 'Short'), h('th', {}, 'Taken by'), h('th', {})),
      d.subjects.map((x) => h('tr', { style: x.active ? '' : 'opacity:.55' }, h('td', {}, h('b', {}, x.name), x.active ? null : h('span', { class: 'badge', style: 'margin-left:6px' }, 'Not in use')), h('td', {}, x.short), h('td', { class: 'small' }, String(x.bands).split(',').map((b) => bandNames[b]).filter(Boolean).join(', ')), h('td', { style: 'text-align:right' }, h('button', { class: 'btn sm', onclick: () => editSubject(x, bandNames) }, 'Edit')))))),
    h('div', { class: 'row', style: 'margin-top:8px' }, h('h2', {}, 'Subject teachers'), h('span', { class: 'spacer' })),
    h('div', { class: 'muted small' }, 'Choose who teaches each subject in a class. Only that teacher (and managers) can enter its marks. If no teacher is chosen, the class teacher can enter it.'),
    h('div', { class: 'card' }, h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Class'), h('th', {}, 'Class teacher'), h('th', {})),
      classes.filter((c) => c.active).map((c) => h('tr', {}, h('td', {}, h('b', {}, c.name)), h('td', {}, c.teacher || '—'), h('td', { style: 'text-align:right' }, h('button', { class: 'btn sm', onclick: () => editSubjectTeachers(c, users || []) }, 'Subject teachers')))))));
}

function editSubject(x, bandNames) {
  x = x || { bands: '', active: 1 };
  const have = String(x.bands).split(',');
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  add(body,
    h('div', { class: 'grid2' }, field('Subject / learning area', inp('name', x.name || '', { autofocus: true })), field('Short name (for mark sheets)', inp('short', x.short || '', { placeholder: 'e.g. ENG' }))),
    h('div', { class: 'section-title' }, 'Taken by'),
    h('div', { class: 'row', style: 'gap:14px;flex-wrap:wrap' }, Object.entries(bandNames).map(([k, v]) => h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-band': k, checked: have.includes(k) }), v))),
    x.id ? chk('active', 'In use', !!x.active) : null);
  modal({
    title: x.id ? 'Edit ' + x.name : 'Add subject',
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { const f = formData(body); const bands = [...body.querySelectorAll('[data-band]')].filter((b) => b.checked).map((b) => b.dataset.band); if (await tryApi('saveSubject', { ...f, bands, id: x.id, active: x.id ? f.active : true })) { close(); go('exams'); } } }, 'Save')],
  });
}

async function editSubjectTeachers(c, users) {
  const subs = await tryApi('classSubjects', { class_id: c.id });
  if (!subs) return;
  const staff = users.filter((u) => u.active);
  const sels = subs.map((x) => ({ x, el: h('select', { class: 'input' }, h('option', { value: '' }, `— class teacher${c.teacher ? ' (' + c.teacher + ')' : ''} —`), staff.map((u) => h('option', { value: u.id, selected: u.id === x.teacher_id }, u.name))) }));
  modal({
    title: 'Subject teachers — ' + c.name,
    body: h('div', { class: 'stack', style: 'gap:8px' }, sels.map(({ x, el }) => h('div', { class: 'grid2', style: 'align-items:center' }, h('b', {}, x.name), el))),
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { if (await tryApi('saveSubjectTeachers', { class_id: c.id, rows: sels.map(({ x, el }) => ({ subject_id: x.id, user_id: el.value })) })) { toast('Saved.'); close(); } } }, 'Save')],
  });
}

async function examGrading(box) {
  const g = await tryApi('getGrading');
  if (!g) return;
  const scaleEditor = (title, scale) => {
    const rows = scale.map((l) => ({ code: h('input', { class: 'input', value: l.code, style: 'width:70px' }), min: h('input', { class: 'input num', type: 'number', value: l.min, style: 'width:80px' }), label: h('input', { class: 'input', value: l.label }), points: h('input', { class: 'input num', type: 'number', value: l.points, style: 'width:70px' }) }));
    const el = h('div', { class: 'card pad stack' }, h('h2', {}, title), h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Level'), h('th', {}, 'From %'), h('th', {}, 'Meaning'), h('th', {}, 'Points')), rows.map((r) => h('tr', {}, h('td', {}, r.code), h('td', {}, r.min), h('td', {}, r.label), h('td', {}, r.points)))));
    return { el, read: () => rows.map((r) => ({ code: r.code.value, min: Number(r.min.value), label: r.label.value, points: Number(r.points.value) })) };
  };
  const pri = scaleEditor(g.college ? 'Grading (all courses)' : 'Pre-primary and Grades 1–6', g.primary);
  const jun = g.college ? { el: null, read: () => pri.read() } : scaleEditor('Junior school (Grades 7–9)', g.junior);
  const pos = h('input', { type: 'checkbox', checked: !!g.show_position });
  const rem = Object.fromEntries(Object.entries(g.remarks).map(([k, v]) => [k, h('input', { class: 'input', value: v })]));
  put(box,
    h('div', { class: 'muted small' }, g.college ? 'Levels are worked out from each score as a % of the exam’s “out of”. Check these ranges against your college’s / examining body’s (KNEC, TVET CDACC, NITA) guidance and change them if needed.' : 'Levels are worked out from each score as a % of the exam’s “out of”. Check these ranges against your school’s / KNEC’s current guidance and change them if needed.'),
    h('div', { class: 'grid2', style: 'align-items:start' }, pri.el, jun.el),
    h('div', { class: 'card pad stack' }, h('h2', {}, 'Report cards'), h('label', { class: 'check' }, pos, 'Show the class position on report cards'),
      h('div', { class: 'section-title' }, 'Suggested remarks (used by “Fill empty remarks”)'), Object.entries(rem).map(([k, el]) => field(k, el))),
    h('div', {}, h('button', { class: 'btn primary', onclick: async () => { if (await tryApi('saveGrading', { primary: pri.read(), junior: jun.read(), show_position: pos.checked, remarks: Object.fromEntries(Object.entries(rem).map(([k, el]) => [k, el.value])) })) toast('Grading saved.'); } }, 'Save grading')));
}

// ================= Staff =================
async function myLessonsToday(wrap, before) {
  const d = await window.pos.call('myDay');
  if (!d.ok || !d.data.lessons.length) return;
  const now = new Date().toTimeString().slice(0, 5);
  wrap.insertBefore(h('div', { class: 'card pad stack', style: 'gap:6px' }, h('b', {}, `Your lessons today (${d.data.day})`),
    h('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap' }, d.data.lessons.map((l) => h('span', { class: 'badge ' + (l.period.starts <= now && now < l.period.ends ? 'green' : '') }, `${l.period.starts} ${l.short || l.subject} · ${l.class_name}`)))), before.previousSibling);
}

async function schoolStaff(box) {
  const rows = await tryApi('staffList');
  if (!rows) return;
  const roleName = ROLE_NAMES.school;
  put(box,
    h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Staff sign in with their PIN. Class teachers are set on each class, subject teachers under Exams → Subjects & teachers. Managers can set fees, timetables and exams.'), h('span', { class: 'spacer' }), can('admin') ? h('button', { class: 'btn', onclick: () => editStaff(null) }, '+ Add staff') : null),
    h('div', { class: 'card' }, h('table', { class: 'list' }, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Job'), h('th', { class: 'hide-phone' }, 'Class teacher'), h('th', { class: 'hide-phone' }, 'Teaches'), h('th', { class: 'num' }, 'Lessons/wk'), h('th', { class: 'hide-phone' }, 'Phone'), h('th', {})),
      rows.map((u) => h('tr', { style: u.active ? '' : 'opacity:.5' }, h('td', {}, h('b', {}, u.name), u.tsc_no ? h('div', { class: 'muted small' }, (/^TSC/i.test(u.tsc_no) ? '' : 'TSC ') + u.tsc_no) : null), h('td', {}, u.title || roleName[u.role] || u.role, h('div', { class: 'muted small' }, (roleName[u.role] || u.role) + (u.role === 'cashier' && u.money ? ' · handles money' : ''))),
        h('td', { class: 'hide-phone' }, u.class_teacher_of.join(', ') || '—'), h('td', { class: 'small hide-phone' }, u.subjects.slice(0, 4).join(', ') + (u.subjects.length > 4 ? ` +${u.subjects.length - 4}` : '') || '—'),
        h('td', { class: 'num' }, u.lessons || '—'), h('td', { class: 'hide-phone' }, u.phone || '—'),
        h('td', { style: 'text-align:right;white-space:nowrap' }, u.lessons ? h('button', { class: 'btn sm', onclick: () => { SCH.ttTab = 'teacher'; SCH.ttTeacher = u.id; go('timetable'); } }, 'Timetable') : null, ' ', can('admin') && u.role !== 'owner' ? h('button', { class: 'btn sm', onclick: () => editStaff(u) }, 'Edit') : null))))));
}

function editStaff(u) {
  const isNew = !u;
  u = u || { role: 'cashier', active: 1, has_pin: 0 };
  const body = h('div', { class: 'stack', style: 'gap:12px' });
  add(body,
    h('div', { class: 'grid2' }, field('Full name', inp('name', u.name, { autofocus: true })), field('Job title', h('input', { class: 'input', name: 'title', value: u.title || '', list: 'job-titles', placeholder: 'e.g. Teacher, Bursar' }))),
    h('datalist', { id: 'job-titles' }, ['Teacher', 'Head teacher', 'Deputy head teacher', 'Bursar', 'Secretary', 'Cook', 'Driver', 'Security', 'Cleaner'].map((t) => h('option', { value: t }))),
    h('div', { class: 'grid3' }, field('Phone', inp('phone', u.phone, { type: 'tel' })), field('TSC number', inp('tsc_no', u.tsc_no)), field('Access', sel('role', [['cashier', 'Teacher / staff'], ['manager', 'Deputy / manager (fees, exams, timetable)'], ['admin', 'Head teacher / admin (everything)']].filter(([r]) => RANK[r] <= RANK[S.user.role]), u.role))),
    h('div', { class: 'grid2' }, field(u.has_pin ? 'New 4-digit PIN (blank = keep)' : '4-digit PIN (to sign in)', inp('pin', '', { type: 'password', inputMode: 'numeric', maxLength: 4 })), !isNew ? chk('active', 'Still working here', !!u.active) : h('div')),
    chk('money', 'Handles money: receives fees and sells in the school shop (e.g. bursar). Leave off for teachers.', isNew ? false : u.money !== 0));
  modal({
    title: isNew ? 'Add staff' : 'Edit ' + u.name,
    body,
    foot: (close) => [h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: async () => { const d = formData(body); if (await tryApi('saveUser', { ...d, id: u.id, username: u.username, active: isNew ? true : d.active })) { toast('Saved.'); close(); S.schoolTab = 'staff'; go('school'); } } }, 'Save')],
  });
}

// ================= Timetable =================
SCH.ttTab = 'class';
const shareOrPrint = async (html, name) => {
  if (isPhone()) {
    const r = await window.pos.shareHtml(name, W(html));
    if (!r.ok) toast(r.error, true);
  } else printHtml(html);
};

async function pageTimetable(main) {
  const wrap = h('div', { class: 'page' });
  const body = h('div', { class: 'stack', style: 'gap:14px' });
  const tab = SCH.ttTab;
  add(wrap,
    h('div', { class: 'page-head' }, h('h1', {}, 'Timetable')),
    tabs([['class', 'Class timetable'], ['teacher', can('manager') ? 'Teacher timetable' : 'My timetable'], can('manager') ? ['day', 'School day'] : null], tab, (id) => { SCH.ttTab = id; go('timetable'); }),
    body);
  add(main, wrap);
  ({ class: ttClass, teacher: ttTeacher, day: ttDay }[tab] || ttClass)(body);
}

function ttGridHtml(title, sub, d, cell) {
  const lessons = d.periods;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>@page { size: A4 landscape; margin: 10mm } body { font: 11px 'Segoe UI', Arial, sans-serif } table { width: 100%; border-collapse: collapse; table-layout: fixed } th, td { border: 1px solid #888; padding: 4px; text-align: center; vertical-align: middle } th { background: #eee } .brk { background: #f3f3f3; color: #555; font-style: italic } small { color: #444 }</style></head><body>
    <h2 style="margin:0">${escHtml(S.tenant.name)} — ${escHtml(title)}</h2><div>${escHtml(sub)}</div><br>
    <table><tr><th style="width:90px">Day</th>${lessons.map((p) => `<th>${escHtml(p.label)}<br><small>${p.starts}–${p.ends}</small></th>`).join('')}</tr>
    ${d.days.map((day, i) => `<tr><th>${day}</th>${lessons.map((p) => (p.is_break ? `<td class="brk">${escHtml(p.label)}</td>` : `<td>${cell(i + 1, p) || ''}</td>`)).join('')}</tr>`).join('')}</table></body></html>`;
}

async function ttClass(box) {
  const classes = ((await tryApi('listClasses')) || []).filter((c) => c.active);
  if (!classes.length) return put(box, h('div', { class: 'empty' }, 'Add classes first.'));
  if (!classes.some((c) => c.id === SCH.ttClass)) SCH.ttClass = classes[0].id;
  const d = await tryApi('classTimetable', { class_id: SCH.ttClass });
  if (!d) return;
  const slot = (day, pid) => d.slots.find((x) => x.day === day && x.period_id === pid);
  const sels = [];
  const grid = h('table', { class: 'list tt' },
    h('tr', {}, h('th', {}, ''), d.days.map((day) => h('th', {}, isPhone() ? day.slice(0, 3) : day))),
    d.periods.map((p) => h('tr', { class: p.is_break ? 'tt-break' : '' }, h('th', { class: 'tt-time' }, p.label, h('div', { class: 'muted small' }, `${p.starts}–${p.ends}`)),
      p.is_break ? h('td', { colspan: 5, class: 'muted small', style: 'text-align:center' }, p.label) :
      d.days.map((_, i) => {
        const sl = slot(i + 1, p.id);
        if (!d.can_edit) return h('td', {}, sl ? [h('b', {}, sl.short || sl.subject), h('div', { class: 'muted small' }, sl.teacher || '')] : '');
        const el = h('select', { class: 'input tt-sel', 'data-day': i + 1, 'data-period': p.id }, h('option', { value: '' }, '—'), d.subjects.map((x) => h('option', { value: x.id, selected: sl && sl.subject_id === x.id }, x.short || x.name)));
        sels.push(el);
        return h('td', {}, el, sl && sl.teacher ? h('div', { class: 'muted small' }, sl.teacher) : null);
      }))));
  const save = async (force) => {
    const r = await window.pos.call('saveClassTimetable', { class_id: d.class.id, force, cells: sels.map((el) => ({ day: Number(el.dataset.day), period_id: Number(el.dataset.period), subject_id: el.value ? Number(el.value) : null })) });
    if (r.ok) { toast('Timetable saved.'); return go('timetable'); }
    if (/^Clash/.test(r.error) && (await confirmBox('Teacher clash', r.error + ' Save anyway (e.g. combined classes)?', 'Save anyway'))) return save(true);
    if (!/^Clash/.test(r.error)) toast(r.error, true);
  };
  put(box,
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
      h('select', { class: 'input', style: 'width:auto', onchange: (e) => { SCH.ttClass = Number(e.target.value); go('timetable'); } }, classes.map((c) => h('option', { value: c.id, selected: c.id === SCH.ttClass }, c.name))),
      h('span', { class: 'muted small' }, `Class teacher: ${d.class.teacher || '—'} · ${d.free} free lesson(s) a week`), h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', onclick: () => shareOrPrint(ttGridHtml(d.class.name + ' timetable', 'Class teacher: ' + (d.class.teacher || ''), d, (day, p) => { const sl = slot(day, p.id); return sl ? `<b>${escHtml(sl.short || sl.subject)}</b><br><small>${escHtml(sl.teacher || '')}</small>` : ''; }), `timetable-${d.class.name}.html`.replace(/\s+/g, '_')) }, isPhone() ? 'Share' : 'Print'),
      d.can_edit ? h('button', { class: 'btn primary', onclick: () => save(false) }, 'Save timetable') : null),
    h('div', { class: 'card', style: 'overflow:auto' }, grid),
    h('div', { class: 'muted small' }, 'Lessons a week: ', d.subjects.map((x) => `${x.short || x.name} ${x.lessons}${x.teacher ? '' : ' (no teacher)'}`).join(' · ')),
    d.can_edit ? h('div', { class: 'row' }, h('span', { class: 'muted small' }, 'Teachers come from Exams → Subjects & teachers (or the class teacher). Changed them?'), h('button', { class: 'btn sm', onclick: async () => { const r = await tryApi('refreshTimetableTeachers'); if (r) { toast(`Updated ${r.updated} lesson(s).`); go('timetable'); } } }, 'Update teachers')) : null);
}

async function ttTeacher(box) {
  let staff = [];
  if (can('manager')) {
    staff = ((await tryApi('staffList')) || []).filter((u) => u.active && (u.lessons || u.class_teacher_of.length));
    if (!staff.length) return put(box, h('div', { class: 'empty' }, 'No teacher has lessons yet. Fill in the class timetables first.'));
    if (!staff.some((u) => u.id === SCH.ttTeacher)) SCH.ttTeacher = staff[0].id;
  }
  const d = await tryApi('teacherTimetable', { user_id: can('manager') ? SCH.ttTeacher : undefined });
  if (!d) return;
  const slot = (day, pid) => d.slots.find((x) => x.day === day && x.period_id === pid);
  put(box,
    h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
      can('manager') ? h('select', { class: 'input', style: 'width:auto', onchange: (e) => { SCH.ttTeacher = Number(e.target.value); go('timetable'); } }, staff.map((u) => h('option', { value: u.id, selected: u.id === d.teacher.id }, `${u.name} (${u.lessons})`))) : h('b', {}, d.teacher.name),
      h('span', { class: 'muted small' }, `${d.slots.length} lesson(s) a week`), h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm', onclick: () => shareOrPrint(ttGridHtml(d.teacher.name + ' — teaching timetable', d.teacher.title || '', d, (day, p) => { const sl = slot(day, p.id); return sl ? `<b>${escHtml(sl.class_name)}</b><br><small>${escHtml(sl.short || sl.subject)}</small>` : ''; }), `timetable-${d.teacher.name}.html`.replace(/\s+/g, '_')) }, isPhone() ? 'Share' : 'Print')),
    h('div', { class: 'card', style: 'overflow:auto' }, h('table', { class: 'list tt' },
      h('tr', {}, h('th', {}, ''), d.days.map((day) => h('th', {}, isPhone() ? day.slice(0, 3) : day))),
      d.periods.map((p) => h('tr', { class: p.is_break ? 'tt-break' : '' }, h('th', { class: 'tt-time' }, p.label, h('div', { class: 'muted small' }, `${p.starts}–${p.ends}`)),
        p.is_break ? h('td', { colspan: 5, class: 'muted small', style: 'text-align:center' }, p.label) : d.days.map((_, i) => { const sl = slot(i + 1, p.id); return h('td', {}, sl ? [h('b', {}, sl.class_name), h('div', { class: 'muted small' }, sl.short || sl.subject)] : ''); }))))));
}

async function ttDay(box) {
  const rows = await tryApi('getPeriods');
  if (!rows) return;
  const list = h('div', { class: 'stack', style: 'gap:6px' });
  const line = (p) => {
    const el = h('div', { class: 'row tt-period', style: 'gap:6px;flex-wrap:nowrap' },
      h('input', { class: 'input', value: p.label, 'data-f': 'label', style: 'flex:1;min-width:0' }),
      h('input', { class: 'input', type: 'time', value: p.starts, 'data-f': 'starts', style: 'width:auto' }),
      h('input', { class: 'input', type: 'time', value: p.ends, 'data-f': 'ends', style: 'width:auto' }),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', 'data-f': 'is_break', checked: !!p.is_break }), 'Break'),
      h('button', { class: 'btn sm danger', onclick: () => el.remove() }, '✕'));
    el.dataset.id = p.id || '';
    return el;
  };
  put(list, rows.map(line));
  put(box,
    h('div', { class: 'muted small' }, 'The same lessons and breaks every weekday. Removing a lesson also clears it from every class timetable.'),
    h('div', { class: 'card pad' }, list),
    h('div', { class: 'row', style: 'gap:8px' },
      h('button', { class: 'btn', onclick: () => { const last = [...list.children].pop(); const end = last ? last.querySelector('[data-f=ends]').value : '08:00'; const [hh, mm] = end.split(':').map(Number); const t = new Date(0, 0, 0, hh, mm + 35).toTimeString().slice(0, 5); add(list, line({ label: 'Lesson ' + (list.querySelectorAll('.tt-period').length + 1), starts: end, ends: t })); } }, '+ Add period'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', onclick: async () => {
        const out = [...list.children].map((el) => ({ id: Number(el.dataset.id) || null, label: el.querySelector('[data-f=label]').value, starts: el.querySelector('[data-f=starts]').value, ends: el.querySelector('[data-f=ends]').value, is_break: el.querySelector('[data-f=is_break]').checked }));
        if (await tryApi('savePeriods', { rows: out })) { toast('School day saved.'); go('timetable'); }
      } }, 'Save school day')));
}

// ================= QR attendance & ID cards =================
const qrSvg = (text) => {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
};

async function printIdCards(rows, cls) {
  if (!rows.length) return toast('No pupils in this list.', true);
  const t = S.tenant;
  const info = await schoolInfo().catch(() => null);
  const year = (info && info.term && info.term.year) || new Date().getFullYear();
  const card = (p) => `<div class="idc">
    <div class="top">${t.logo ? `<span class="lg"><img src="${t.logo}" alt=""></span>` : `<span class="lg ini">${escHtml(initialsOf(t.name))}</span>`}<div><b>${escHtml(t.name)}</b><span>PUPIL ID CARD ${year}</span></div></div>
    <div class="mid"><div class="ph">Photo</div><div class="who"><div class="nm">${escHtml(p.name)}</div><div>Adm no <b>${escHtml(p.adm_no)}</b></div><div>Class <b>${escHtml(p.class_name || '')}</b></div>${p.guardian_phone ? `<div class="sm">Parent ${escHtml(p.guardian_phone)}</div>` : ''}</div><div class="qr">${qrSvg('DTP:' + p.adm_no)}</div></div>
    <div class="bot">${escHtml(t.motto || '')}${t.motto && t.phone ? ' &nbsp;|&nbsp; ' : ''}${escHtml(t.phone ? 'Tel ' + t.phone : t.motto ? '' : t.address || '')}</div></div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ID cards</title><style>
    @page { size: A4; margin: 10mm } body { margin: 0; font: 10.5px 'Segoe UI', Arial, sans-serif; color: #111 }
    ${printTheme(t)}
    .grid { display: grid; grid-template-columns: repeat(2, 86mm); gap: 6mm 8mm; justify-content: center }
    .idc { width: 86mm; height: 54mm; border: 1px solid #bbb; border-radius: 3mm; overflow: hidden; display: flex; flex-direction: column; page-break-inside: avoid; break-inside: avoid; background: #fff }
    .top { background: var(--side); color: #fff; display: flex; align-items: center; gap: 2.5mm; padding: 2mm 3mm; border-bottom: 1.2mm solid var(--acc) }
    .top b { display: block; font-size: 11.5px; line-height: 1.15 } .top span { font-size: 7.5px; letter-spacing: .06em; opacity: .85 }
    .lg { width: 10mm; height: 10mm; border-radius: 2mm; background: #fff; display: flex; align-items: center; justify-content: center; padding: .6mm; flex: none } .lg img { max-width: 100%; max-height: 100%; object-fit: contain }
    .lg.ini { background: var(--grad); color: #fff; font-weight: 800; font-size: 10px }
    .mid { flex: 1; display: flex; gap: 2.5mm; align-items: center; padding: 2mm 3mm }
    .ph { width: 19mm; height: 23mm; border: 1px dashed #aaa; border-radius: 1.5mm; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 8px; flex: none }
    .who { flex: 1; display: flex; flex-direction: column; gap: .8mm; min-width: 0 } .nm { font-size: 13px; font-weight: 800; line-height: 1.15; color: var(--side) } .sm { font-size: 8.5px; color: #444 }
    .qr { width: 21mm; height: 21mm; flex: none } .qr svg { width: 100%; height: 100% }
    .bot { font-size: 7.5px; color: #fff; text-align: center; background: var(--side); padding: 1mm 2mm; font-style: italic; min-height: 4mm }
  </style></head><body><div class="grid">${rows.map(card).join('')}</div></body></html>`;
  const name = `id-cards-${cls ? cls.name : 'pupils'}.html`.replace(/\s+/g, '_');
  if (isPhone()) {
    const r = await window.pos.shareHtml(name, W(html));
    if (!r.ok) toast(r.error, true);
  } else printHtml(html);
}

// Spoken greeting at the gate: "Welcome to Sunrise Academy, Amina." Kenyan English voice when the device has one.
// Phone: Android's own text-to-speech (SpeechPlugin). PC: the Windows voices through the browser's speech.
const VOICE_ORDER = ['en-KE', 'en-NG', 'en-ZA', 'en-GB', 'en-IN', 'en-US'];
function pickVoice() {
  const vs = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
  const norm = (l) => String(l || '').replace('_', '-').toLowerCase();
  for (const tag of VOICE_ORDER) {
    const v = vs.find((x) => norm(x.lang) === tag.toLowerCase());
    if (v) return v;
  }
  return vs.find((x) => norm(x.lang).startsWith('en')) || null;
}
if (window.speechSynthesis) window.speechSynthesis.onvoiceschanged = () => pickVoice();
async function speak(text) {
  if (isPhone() && window.pos.speak) {
    const r = await window.pos.speak({ text, lang: 'en-KE' });
    if (!r.ok) toast(r.error, true);
    return;
  }
  if (!window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = v ? v.lang : 'en-KE';
  u.rate = 0.95;
  window.speechSynthesis.cancel(); // the next pupil interrupts, so greetings never pile up
  window.speechSynthesis.speak(u);
}
const welcomeOn = () => prefs.get('scanWelcome', true);
const welcomeText = (name) => `Welcome to ${S.tenant.name}, ${String(name || '').trim().split(/\s+/)[0]}.`;

// short beeps so the person at the gate needn't look at the screen
function beep(kind) {
  try {
    const ctx = (beep.ctx = beep.ctx || new (window.AudioContext || window.webkitAudioContext)());
    const tones = kind === 'ok' ? [[880, 0.12]] : kind === 'again' ? [[660, 0.08], [660, 0.08]] : [[220, 0.35]];
    let t = ctx.currentTime;
    for (const [f, d] of tones) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.value = 0.15;
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + d);
      t += d + 0.06;
    }
  } catch (_) {}
}

async function attScan(box) {
  const st = await tryApi('scanToday');
  if (!st) return;
  const result = h('div', { class: 'scan-result' }, h('div', { class: 'muted' }, 'Ready. Scan a pupil’s QR card.'));
  const recent = h('div', { class: 'card' });
  const counts = h('div', { class: 'muted small' });
  const showToday = (d) => {
    counts.textContent = `${d.scanned} scanned today · ${d.not_marked} of ${d.pupils} pupils not marked yet${d.late_after ? ` · late after ${d.late_after}` : ''}`;
    put(recent, d.recent.length ? h('table', { class: 'list' }, d.recent.map((r) => h('tr', {}, h('td', {}, r.time), h('td', {}, h('b', {}, r.name), h('span', { class: 'muted small' }, ` ${r.adm_no}`)), h('td', {}, r.class_name), h('td', {}, h('span', { class: 'badge ' + (r.status === 'L' ? 'warn' : 'green') }, r.status === 'L' ? 'Late' : 'Present'))))) : h('div', { class: 'empty' }, 'No scans yet today.'));
  };
  showToday(st);
  let last = { code: '', t: 0 };
  let busy = false;
  const handle = async (code) => {
    code = String(code || '').trim();
    if (!code || busy) return;
    if (code === last.code && Date.now() - last.t < 10000) return; // same card still in front of the camera
    last = { code, t: Date.now() };
    busy = true;
    const r = await window.pos.call('scanAttendance', { code });
    busy = false;
    if (!r.ok) {
      beep('err');
      put(result, h('div', { class: 'scan-card bad' }, h('div', { class: 'scan-big' }, '✕'), h('div', {}, h('b', {}, r.error))));
      return;
    }
    const x = r.data;
    if (!x.already && welcomeOn()) speak(welcomeText(x.pupil.name));
    else beep(x.already ? 'again' : 'ok');
    put(result, h('div', { class: 'scan-card ' + (x.already ? 'again' : x.status === 'L' ? 'late' : 'ok') },
      h('div', { class: 'scan-big' }, x.already ? '↺' : '✓'),
      h('div', {}, h('div', { class: 'scan-name' }, x.pupil.name), h('div', {}, `${x.pupil.adm_no} · ${x.pupil.class_name}`),
        h('div', { class: 'small' }, x.already ? `Already marked ${x.status === 'L' ? 'late' : 'present'}${x.at ? ' at ' + x.at : ''}` : `${x.status === 'L' ? 'LATE' : 'Present'} · ${x.time}${x.was === 'A' ? ' (was absent)' : ''}`))));
    const d = await window.pos.call('scanToday');
    if (d.ok) showToday(d.data);
  };

  // USB / Bluetooth scanner guns type the code and press Enter; staff can also type an admission number.
  const typed = h('input', { class: 'input scan-input', placeholder: 'Scanner gun or type admission no., then Enter', autocomplete: 'off', onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); const v = typed.value; typed.value = ''; last.code = ''; handle(v); } } });

  // camera
  const video = h('video', { class: 'scan-video', playsInline: true, muted: true, hidden: true });
  const camBtn = h('button', { class: 'btn primary', onclick: () => (window.__stopCamera ? stopCam() : startCam()) }, '📷 Start camera');
  let stream = null;
  let timer = null;
  let detector = null;
  const canvas = document.createElement('canvas');
  const cx = canvas.getContext('2d', { willReadFrequently: true });
  const stopCam = () => {
    clearTimeout(timer);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.hidden = true;
    camBtn.textContent = '📷 Start camera';
    window.__stopCamera = null;
  };
  const tick = async () => {
    if (!stream) return;
    try {
      if (video.readyState >= 2) {
        let code = null;
        if (detector) {
          const found = await detector.detect(video);
          if (found && found[0]) code = found[0].rawValue;
        } else {
          const w = Math.min(640, video.videoWidth);
          const hgt = Math.round((video.videoHeight / video.videoWidth) * w);
          canvas.width = w;
          canvas.height = hgt;
          cx.drawImage(video, 0, 0, w, hgt);
          const img = cx.getImageData(0, 0, w, hgt);
          const q = jsQR(img.data, w, hgt, { inversionAttempts: 'dontInvert' });
          if (q) code = q.data;
        }
        if (code) await handle(code);
      }
    } catch (_) {}
    timer = setTimeout(tick, detector ? 120 : 200);
  };
  const startCam = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      return toast('Could not open the camera: ' + (e.message || e.name) + '. Allow camera access, or use a scanner gun.', true);
    }
    video.srcObject = stream;
    video.hidden = false;
    await video.play().catch(() => {});
    detector = null;
    if ('BarcodeDetector' in window) {
      try {
        const f = await window.BarcodeDetector.getSupportedFormats();
        if (f.includes('qr_code')) detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      } catch (_) {}
    }
    camBtn.textContent = '■ Stop camera';
    window.__stopCamera = stopCam;
    tick();
  };

  const late = h('input', { class: 'input', type: 'time', value: st.late_after || '', style: 'width:auto' });
  // which voice will speak (phones without a Kenyan English voice use the closest English one)
  const voiceNote = h('span', { class: 'muted small' });
  if (isPhone() && window.pos.speechInfo) {
    window.pos.speechInfo().then((r) => { if (r.ok) voiceNote.textContent = r.data.ready ? (r.data.kenyan ? 'Voice: English (Kenya)' : `Voice: ${r.data.language || 'phone default'} (add “English (Kenya)” in the phone’s text-to-speech settings for a Kenyan accent)`) : 'Text-to-speech not ready on this phone.'; });
  } else {
    const showV = () => { const v = pickVoice(); voiceNote.textContent = v ? `Voice: ${v.name}${/en-KE/i.test(v.lang) ? '' : ' (no Kenyan English voice on this PC; using the closest)'}` : 'No voice found on this computer.'; };
    showV();
    if (window.speechSynthesis) window.speechSynthesis.addEventListener('voiceschanged', showV);
  }
  put(box,
    h('div', { class: 'scan-wrap' },
      h('div', { class: 'stack', style: 'gap:10px' },
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, camBtn, h('span', { class: 'muted small' }, 'Point the camera at the card. A USB / Bluetooth scanner gun also works.')),
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: welcomeOn(), onchange: (e) => prefs.set('scanWelcome', e.target.checked) }), `🔊 Say “Welcome to ${S.tenant.name}, …”`),
          h('button', { class: 'btn sm', onclick: () => speak(welcomeText('Amina')) }, 'Test voice'),
          voiceNote),
        video, typed, result, counts),
      h('div', { class: 'stack', style: 'gap:10px' }, h('h2', {}, 'Latest scans'), recent)),
    can('manager') ? h('div', { class: 'card pad stack', style: 'gap:10px' },
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, h('span', {}, 'Mark as late if scanned after'), late, h('button', { class: 'btn sm', onclick: async () => { const r = await tryApi('saveScanSettings', { late_after: late.value }); if (r) { toast(late.value ? 'Late time saved.' : 'Late marking off.'); showToday(r); } } }, 'Save'), h('span', { class: 'muted small' }, 'Leave empty to never mark late.')),
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, h('button', { class: 'btn', onclick: async () => {
        if (!(await confirmBox('Finish scanning for today?', 'Every pupil in school who has not been scanned or marked today will be marked Absent. Class teachers can still correct their register.', 'Mark the rest absent', true))) return;
        const r = await tryApi('finishScanning');
        if (r) { toast(`${r.marked_absent} pupil(s) marked absent. Today: ${r.P + r.L} present, ${r.A} absent.`); SCH.attTab = 'absent'; go('attendance'); }
      } }, 'Finish: mark the rest absent'), h('span', { class: 'muted small' }, 'Pupils’ QR cards: Pupils → 🪪 ID cards.'))) : h('div', { class: 'muted small' }, 'Pupils’ QR cards are printed from Pupils → 🪪 ID cards.'));
  if (!isPhone()) typed.focus();
}

// ================= School website =================
// Photos are shrunk on this device before saving, so a whole site stays small (limit 3 MB).
function pickPhoto(maxSide = 1400, quality = 0.78) {
  return new Promise((resolve) => {
    pickFileBase64('image/*').then((f) => {
      if (!f) return resolve(null);
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, maxSide / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k);
        c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      im.onerror = () => { toast('That file is not a photo this device can read.', true); resolve(null); };
      im.src = 'data:image;base64,' + f.base64;
    });
  });
}

// For a school / college that already has its own website (e.g. made on Wix or WordPress):
// their "Register online" button can open our form, and a block can show courses and fees.
function linksForOtherSite(link, d) {
  const apply = link + '/apply';
  const embed = `<iframe src="${link}/courses" style="width:100%;height:760px;border:0" title="Courses and fees"></iframe>`;
  const copy = (txt, what) => () => { navigator.clipboard && navigator.clipboard.writeText(txt); toast(what + ' copied.'); };
  return h('details', { class: 'small' }, h('summary', { style: 'cursor:pointer;font-weight:600' }, 'Already have another website? Connect it'),
    h('div', { class: 'stack', style: 'gap:8px;margin-top:8px' },
      h('div', { class: 'muted' }, 'Give these to whoever manages your other website.'),
      d.admissions && d.admissions.online
        ? h('div', {}, h('b', {}, '1. Online application form. '), 'Point your “Register online” / “Apply” button to:', h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-top:4px' }, h('code', { style: 'user-select:all;word-break:break-all' }, apply), h('button', { class: 'btn sm', onclick: copy(apply, 'Link') }, 'Copy')))
        : h('div', { class: 'muted' }, '1. Tick “Take applications online” below and publish, to get the application form link.'),
      h('div', {}, h('b', {}, '2. Courses and fees on your other website. '), 'Paste this code where they should appear (an “HTML / embed” block):',
        h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap;margin-top:4px' }, h('code', { style: 'user-select:all;word-break:break-all;font-size:11px' }, embed), h('button', { class: 'btn sm', onclick: copy(embed, 'Code') }, 'Copy'))),
      h('div', { class: 'muted' }, 'Both update by themselves whenever you publish here (new fees, new courses, admissions open or closed).')));
}

async function schoolWebsite(box) {
  const [d0, cfg] = await Promise.all([tryApi('siteGet'), window.pos.cloudConfig()]);
  if (!d0) return;
  const siteUrl = (cfg.ok && cfg.data.siteUrl) || '';
  const d = JSON.parse(JSON.stringify(d0));
  const bind = (obj, key, el) => { el.addEventListener('input', () => (obj[key] = el.type === 'checkbox' ? el.checked : el.value)); el.addEventListener('change', () => (obj[key] = el.type === 'checkbox' ? el.checked : el.value)); return el; };
  const text = (obj, key, ph, rows) => bind(obj, key, rows ? h('textarea', { class: 'input', rows, value: obj[key] || '', placeholder: ph || '' }) : h('input', { class: 'input', value: obj[key] || '', placeholder: ph || '' }));
  const tick = (obj, key, label) => h('label', { class: 'check' }, bind(obj, key, h('input', { type: 'checkbox', checked: !!obj[key] })), label);
  const photo = (obj, key, label, maxSide) => {
    const holder = h('div', { class: 'site-photo' });
    const draw = () => put(holder, obj[key] ? h('img', { src: obj[key] }) : h('span', { class: 'muted small' }, 'No photo'),
      h('div', { class: 'row', style: 'gap:6px' }, h('button', { class: 'btn sm', onclick: async () => { const p = await pickPhoto(maxSide); if (p) { obj[key] = p; draw(); } } }, obj[key] ? 'Change' : 'Choose photo'), obj[key] ? h('button', { class: 'btn sm', onclick: () => { obj[key] = ''; draw(); } }, 'Remove') : null));
    draw();
    return field(label, holder);
  };
  const card = (title, ...kids) => h('div', { class: 'card pad stack', style: 'gap:12px' }, h('h2', {}, title), ...kids);
  const colors = Object.keys(window.SITE_THEMES || {});
  const colorRow = h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' });
  const drawColors = () => put(colorRow, colors.map((c) => h('button', { class: 'site-swatch' + (d.color === c ? ' on' : ''), title: c, style: `background:${window.SITE_THEMES[c][0]}`, onclick: () => { d.color = c; drawColors(); } })));
  drawColors();

  const newsBox = h('div', { class: 'stack', style: 'gap:10px' });
  const drawNews = () => put(newsBox, d.news.map((n, i) => h('div', { class: 'card pad stack', style: 'gap:8px' },
    h('div', { class: 'grid2' }, field('Title', text(n, 'title', 'e.g. Sports day')), field('Date', bind(n, 'date', h('input', { class: 'input', type: 'date', value: n.date || '' })))),
    field('Story', text(n, 'text', '', 3)), photo(n, 'photo', 'Photo (optional)', 1000),
    h('div', {}, h('button', { class: 'btn sm danger', onclick: () => { d.news.splice(i, 1); drawNews(); } }, 'Remove this news')))),
    d.news.length < 20 ? h('button', { class: 'btn', onclick: () => { d.news.unshift({ title: '', date: todayStr(), text: '', photo: '' }); drawNews(); } }, '+ Add news / event') : null);
  drawNews();

  const galBox = h('div', { class: 'site-gallery' });
  const drawGal = () => put(galBox, d.gallery.map((g, i) => h('div', { class: 'site-photo' }, h('img', { src: g }), h('button', { class: 'btn sm', onclick: () => { d.gallery.splice(i, 1); drawGal(); } }, 'Remove'))),
    d.gallery.length < 12 ? h('button', { class: 'btn', onclick: async () => { const p = await pickPhoto(1200); if (p) { d.gallery.push(p); drawGal(); } } }, '+ Add photo') : null);
  drawGal();

  const save = async (quiet) => {
    const r = await tryApi('siteSave', { site: d });
    if (r && !quiet) toast('Saved on this device. Press Publish to put it online.');
    if (r) { d.slug = r.slug; slugIn.value = r.slug; }
    return r;
  };
  const preview = async () => {
    if (!(await save(true))) return;
    const p = await tryApi('sitePayload');
    if (!p) return;
    modal({ title: 'Preview — ' + p.name, wide: true, body: h('iframe', { class: 'site-preview', sandbox: '', srcdoc: window.renderSchoolSite(p) }) });
  };
  const publish = async (on) => {
    if (!(await save(true))) return;
    if (!can('admin')) return toast('Only the head teacher / admin can publish. Your changes are saved.', true);
    const r = await window.pos.sitePublish({ published: on });
    if (!r.ok) return toast(r.error, true);
    toast(on ? 'Website published.' : 'Website taken offline.');
    S.schoolTab = 'website';
    go('school');
  };
  const link = siteUrl ? `${siteUrl.replace(/\/$/, '')}/s/${d.slug}` : '';
  const slugIn = text(d, 'slug', 'e.g. sunrise-academy');
  put(box,
    h('div', { class: 'card pad stack', style: 'gap:10px' },
      h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' },
        d.published ? h('span', { class: 'badge green' }, 'Online') : h('span', { class: 'badge' }, 'Not published'),
        d.published_at ? h('span', { class: 'muted small' }, 'Last published ' + fmtDate(d.published_at.replace('T', ' '))) : null,
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => save() }, 'Save'),
        h('button', { class: 'btn', onclick: preview }, 'Preview'),
        can('admin') ? h('button', { class: 'btn primary', onclick: () => publish(true) }, d.published ? 'Publish changes' : 'Publish') : null,
        can('admin') && d.published ? h('button', { class: 'btn danger', onclick: () => publish(false) }, 'Take offline') : null),
      link && d.published ? h('div', { class: 'row', style: 'gap:8px;flex-wrap:wrap' }, h('b', {}, link), h('button', { class: 'btn sm', onclick: () => { navigator.clipboard && navigator.clipboard.writeText(link); toast('Link copied.'); } }, 'Copy link'), navigator.share ? h('button', { class: 'btn sm', onclick: () => navigator.share({ url: link, title: d.name }).catch(() => {}) }, 'Share') : null) : null,
      !siteUrl ? h('div', { class: 'muted small' }, 'The public address appears here once Daalpha Systems has set up the website host. You can prepare and publish now.') : null,
      link && d.published ? linksForOtherSite(link, d) : null,
      h('div', { class: 'muted small' }, 'Publishing needs internet and this school linked to the online dashboard (Settings → Online dashboard). Edit any time; visitors see changes after you publish again.')),
    card('Basics',
      h('div', { class: 'grid2' }, field('School name', text(d, 'name')), field('Web address', slugIn)),
      field('Motto', text(d, 'motto', 'e.g. Education for life')),
      field('Welcome message (on the front page)', text(d, 'welcome', 'A few sentences welcoming parents and visitors.', 3)),
      field('Colour', colorRow),
      h('div', { class: 'grid2' }, photo(d, 'logo', 'Logo / badge', 400), photo(d, 'hero', 'Front-page photo (school building, pupils…)', 1600)),
      tick(d, 'show_stats', 'Show the number of pupils, classes and staff')),
    card('About the school', field('About us', text(d, 'about', 'History, vision, what makes the school special, curriculum (CBC), facilities, clubs…', 6)),
      h('div', { class: 'grid2' }, field('Head teacher’s name', text(d.head, 'name')), field('Title', text(d.head, 'title', 'Head teacher'))),
      field('Message from the head teacher', text(d.head, 'message', '', 4)), photo(d.head, 'photo', 'Head teacher’s photo', 500)),
    card('Admissions', tick(d.admissions, 'open', 'Admissions are open'),
      tick(d.admissions, 'online', 'Take applications online (an “Apply now” form on the website; applications arrive under Applications)'),
      field('How to join', text(d.admissions, 'text', 'Classes with space, requirements (birth certificate, report form…), interview days, how to apply.', 4)),
      tick(d, 'show_fees', 'Show this term’s fees (taken from Fees → Fee structure)'), h('div', { class: 'muted small' }, 'Term dates are shown automatically from School → Terms (add opening and closing dates there).')),
    card('News & events', newsBox),
    card('Gallery (up to 12 photos)', galBox),
    card('Contacts',
      h('div', { class: 'grid2' }, field('Phone', text(d.contacts, 'phone', '07…')), field('WhatsApp number', text(d.contacts, 'whatsapp', '07…'))),
      h('div', { class: 'grid2' }, field('Email', text(d.contacts, 'email')), field('Facebook page', text(d.contacts, 'facebook', 'link or page name'))),
      h('div', { class: 'grid2' }, field('Location', text(d.contacts, 'address', 'e.g. Off Kenyatta Road, Juja')), field('Google Maps link (optional)', text(d.contacts, 'map', 'paste the map link or place name')))),
    h('div', { class: 'row', style: 'gap:8px;justify-content:flex-end' }, h('button', { class: 'btn', onclick: () => save() }, 'Save'), h('button', { class: 'btn', onclick: preview }, 'Preview'), can('admin') ? h('button', { class: 'btn primary', onclick: () => publish(true) }, 'Publish') : null));
}
