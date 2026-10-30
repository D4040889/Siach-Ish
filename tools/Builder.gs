/**
 * ספר ההדרכות – בונה הדף הציבורי.
 * העתקה נאמנה של build_site.py ל-JavaScript, בלי תלות ב-Apps Script, כדי שאפשר לבדוק אותה גם ב-Node.
 *
 * renderPage(model) מקבל:
 *   chapters: [{ord, ch, name, line, pages, final_pages, basic_from, basic_to, final_from, final_to,
 *               basic_done, basic_src, basic_file, final_done, final_file, check, check_date}]  (תאריכים כ-YYYY-MM-DD)
 *   files:     רשימת הקבצים מהסריקה (לזיהוי "חלק המוסר" וכדומה)
 *   downloads: [{ch, title, date_he, href}]  (ממוינים כאן לפי סדר הא׳–ב׳ של הפרקים)
 *   finish:    יעד הסיום בעברית ('' אם אין)
 *   asof:      YYYY-MM-DD של הסריקה האחרונה (או היום)
 *   asof_he:   הטקסט ליד "עודכן:"
 *   title, footer
 * ומחזיר את ה-HTML המלא.
 */

var HEB_MONTHS = [['2026-06-16', 'תמוז'], ['2026-07-15', 'אב'], ['2026-08-14', 'אלול'], ['2026-09-12', 'תשרי'], ['2026-10-12', 'חשון'],
  ['2026-11-11', 'כסלו'], ['2026-12-11', 'טבת'], ['2027-01-09', 'שבט'], ['2027-02-08', 'אדר א׳'], ['2027-03-10', 'אדר ב׳'],
  ['2027-04-08', 'ניסן'], ['2027-05-08', 'אייר'], ['2027-06-06', 'סיון'], ['2027-07-06', 'תמוז'], ['2027-08-04', 'אב'],
  ['2027-09-03', 'אלול'], ['2027-10-02', '']];

function gematria(n) {
  var s = { 15: 'טו', 16: 'טז' }[n];
  if (!s) s = (n >= 10 ? 'יכל'[Math.floor(n / 10) - 1] : '') + (n % 10 ? 'אבגדהוזחט'[n % 10 - 1] : '');
  return s.length === 1 ? s + '׳' : s.slice(0, -1) + '״' + s.slice(-1);
}

function dayNum(iso) { // ימים מאז 1970, לפי התאריך בלבד
  var p = iso.split('-');
  return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5);
}

/** תאריך עברי מקורב ל-YYYY-MM-DD, לפי אותה טבלה שבה משתמשת הסריקה. */
function hebDate(iso) {
  if (!iso) return '';
  var d = dayNum(iso);
  for (var i = 0; i + 1 < HEB_MONTHS.length; i++) {
    var a = dayNum(HEB_MONTHS[i][0]), b = dayNum(HEB_MONTHS[i + 1][0]);
    if (a <= d && d < b) return gematria(d - a + 1) + ' ' + HEB_MONTHS[i][1];
  }
  var p = iso.split('-');
  return p[2] + '.' + p[1] + '.' + p[0];
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
function num(x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

function span(a, b) {
  if (!a) return '';
  if (a === b) return a;
  var pa = a.split(' '), pb = b.split(' ');
  var da = pa.shift(), db = pb.shift();
  return pa.join(' ') === pb.join(' ') ? da + '–' + db + ' ' + pa.join(' ') : a + ' – ' + b;
}

/** מספר הפרק מתוך האותיות (א׳=1 … יח׳=18), למיון לפי סדר הא׳–ב׳ של הפרקים. */
function chNum(ch) {
  var v = { 'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9, 'י': 10, 'כ': 20, 'ל': 30 }, n = 0;
  String(ch || '').split('').forEach(function (x) { n += v[x] || 0; });
  return n || 99;
}

function chapterStatus(c, today) {
  function stage(k) {
    if (c[k + '_done']) return 'done';
    if (!c[k + '_from']) return 'none';
    return today > c[k + '_to'] ? 'late' : today >= c[k + '_from'] ? 'now' : 'future';
  }
  var b = stage('basic'), f = stage('final');
  if (f === 'done') return c.check ? ['fix', 'עבר מיון סופי · בתיקונים אחרונים'] : ['ok', 'עבר מיון סופי'];
  if (b === 'done' && f === 'late') return ['late', 'מיון סופי באיחור'];
  if (b === 'done' && f === 'now') return ['now', 'במיון סופי'];
  if (b === 'done') return ['wait', 'ממתין למיון סופי'];
  if (b === 'late') return ['late', 'מיון בסיסי באיחור'];
  if (b === 'now') return ['now', 'במיון בסיסי'];
  return ['future', 'טרם התחיל'];
}

var PAGE_CSS = ':root { --bg:#f7f6f2; --panel:#fff; --fg:#1f1e1b; --muted:#6b675f; --line:#e4e1d8; --accent:#2f6f5e; --plan:#b9b4a8; --ok:#2f6f5e; --okbg:#e3efe9; --warn:#8a5a12; --warnbg:#f6ecd9; }\n' +
  '@media (prefers-color-scheme: dark) { :root { --bg:#1a1a18; --panel:#242421; --fg:#ecebe6; --muted:#a3a097; --line:#3a3934; --accent:#6fc2a8; --plan:#5c5a53; --ok:#8fd3bd; --okbg:#21362f; --warn:#e7bd73; --warnbg:#3a2f1c; } }\n' +
  '* { box-sizing:border-box; }\n' +
  'body { margin:0; background:var(--bg); color:var(--fg); font-family:"Segoe UI",Arial,"Noto Sans Hebrew",sans-serif; line-height:1.5; }\n' +
  'main { max-width:1080px; margin:0 auto; padding:32px 16px 48px; display:flex; flex-direction:column; gap:20px; }\n' +
  'h1 { font-family:"Frank Ruhl Libre","David",Georgia,serif; font-weight:500; font-size:2rem; margin:0; }\n' +
  'h2 { font-size:1.1rem; font-weight:600; margin:0 0 4px; }\n' +
  'h3 { font-size:.95rem; font-weight:600; margin:18px 0 0; }\n' +
  '.asof, .note { color:var(--muted); font-size:.85rem; margin:0; }\n' +
  '.kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); gap:14px; }\n' +
  '.card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:20px; min-width:0; }\n' +
  '.lbl { color:var(--muted); font-size:.85rem; }\n' +
  '.num { font-family:"Frank Ruhl Libre","David",Georgia,serif; font-size:2.6rem; line-height:1.1; margin-top:6px; font-variant-numeric:tabular-nums; }\n' +
  '.sub { color:var(--muted); font-size:.85rem; }\n' +
  '.two { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:14px; }\n' +
  'ul.chips { list-style:none; padding:0; margin:14px 0 0; display:flex; flex-direction:column; gap:8px; }\n' +
  'ul.chips li { display:flex; gap:8px; align-items:baseline; padding:8px 12px; border-radius:8px; background:var(--okbg); color:var(--ok); }\n' +
  'ul.chips li.fix { background:var(--warnbg); color:var(--warn); }\n' +
  'ul.chips li span { margin-inline-start:auto; font-size:.8rem; white-space:nowrap; }\n' +
  'ul.chips li.none { background:none; color:var(--muted); }\n' +
  'ul.chips li.b { background:var(--bg); color:var(--fg); }\n' +
  'ul.chips li.b span { color:var(--muted); }\n' +
  'ul.files { list-style:none; padding:0; margin:8px 0 0; }\n' +
  'ul.files li { display:flex; gap:8px; align-items:baseline; padding:8px 0; border-top:1px solid var(--line); font-size:.9rem; }\n' +
  'ul.files .t { flex:1; min-width:0; }\n' +
  'ul.files .dt { color:var(--muted); font-size:.8rem; white-space:nowrap; }\n' +
  'ul.files a { color:var(--accent); font-weight:600; text-decoration:none; white-space:nowrap; }\n' +
  'ul.files a:hover { text-decoration:underline; }\n' +
  '.row { margin-top:18px; }\n' +
  '.top { display:flex; justify-content:space-between; align-items:baseline; }\n' +
  '.big { font-family:"Frank Ruhl Libre","David",Georgia,serif; font-size:1.8rem; font-variant-numeric:tabular-nums; }\n' +
  '.bar { height:22px; border-radius:6px; background:var(--line); overflow:hidden; margin-top:6px; }\n' +
  '.bar i { display:block; height:100%; border-radius:6px; background:var(--accent); }\n' +
  '.small .bar { height:10px; } .small .bar i { background:var(--plan); }\n' +
  '.small .lbl2, .small .big { color:var(--muted); font-size:1rem; }\n' +
  '.scale { display:flex; justify-content:space-between; color:var(--muted); font-size:.75rem; margin-top:4px; }\n' +
  'details.more > summary { cursor:pointer; list-style:none; display:inline-block; padding:9px 18px; border:1px solid var(--line); border-radius:999px; background:var(--panel); }\n' +
  'details.more > summary::-webkit-details-marker { display:none; }\n' +
  'details.more > summary::after { content:" ▾"; color:var(--muted); }\n' +
  'details.more[open] > summary::after { content:" ▴"; }\n' +
  '.more-body { display:flex; flex-direction:column; gap:14px; margin-top:16px; }\n' +
  '.scroll { overflow-x:auto; margin-top:10px; }\n' +
  'table { width:100%; border-collapse:collapse; font-size:.85rem; }\n' +
  'th { text-align:start; font-weight:600; color:var(--muted); padding:6px 8px; border-bottom:1px solid var(--line); white-space:nowrap; }\n' +
  'td { padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; }\n' +
  'tbody tr:last-child td { border-bottom:0; }\n' +
  'td.k { font-weight:600; white-space:nowrap; }\n' +
  'td.d { white-space:nowrap; font-variant-numeric:tabular-nums; }\n' +
  '.st { display:inline-block; padding:1px 9px; border-radius:999px; font-size:.78rem; white-space:nowrap; border:1px solid transparent; }\n' +
  '.st.ok { background:var(--okbg); color:var(--ok); }\n' +
  '.st.fix, .st.late { background:var(--warnbg); color:var(--warn); }\n' +
  '.st.now { border-color:var(--accent); color:var(--accent); }\n' +
  '.st.wait, .st.future { border-color:var(--line); color:var(--muted); }\n' +
  'footer { color:var(--muted); font-size:.8rem; text-align:center; }';

function renderPage(m) {
  var C = m.chapters.slice().sort(function (a, b) { return (a.ord || 99) - (b.ord || 99); });
  var F = m.files || [];
  var today = m.asof || '';

  var total = 0, plan = 0, actual = 0;
  C.forEach(function (c) {
    var w = +c.pages || 0;
    total += 2 * w;
    ['basic', 'final'].forEach(function (k) {
      var due = !c[k + '_from'] || (c[k + '_to'] || '') < today;
      var done = c[k + '_done'] ? ((k === 'final' && c.check) ? 0.5 : 1) : 0;
      plan += w * (due ? 1 : 0);
      actual += w * done;
    });
  });
  var pct = function (x) { return total ? Math.round(100 * x / total) : 0; };
  var actualPct = pct(actual), planPct = pct(plan);

  var fin = C.filter(function (c) { return c.final_done; });
  var doneCh = {}; fin.forEach(function (c) { doneCh[c.ch] = 1; });
  var names = {}; C.forEach(function (c) { names[c.ch] = c.name; });
  var parts = [], seen = {};
  F.forEach(function (f) {
    if (f.kind === 'final' && f.part && !doneCh[f.ch] && !seen[f.ch + '|' + f.part]) { seen[f.ch + '|' + f.part] = 1; parts.push([f.ch, f.part]); }
  });
  var sum = function (arr, fn) { return arr.reduce(function (s, c) { return s + fn(c); }, 0); };
  var finalPages = sum(fin, function (c) { return +c.final_pages || 0; });
  var finalPagesTotal = sum(C, function (c) { return +c.final_pages || 0; });
  var basicCh = C.filter(function (c) { return c.basic_done; }).length;
  var basicNow = C.filter(function (c) { return !c.basic_done && c.basic_from && c.basic_from <= today && today <= c.basic_to; }).length;
  var basicDone = sum(C.filter(function (c) { return c.basic_done; }), function (c) { return +c.pages || 0; });
  var basicTotal = sum(C, function (c) { return +c.pages || 0; });
  var partsText = parts.length ? ' · ועוד ' + parts.map(function (p) { return 'חלק ה' + p[1]; }).join(', ') : '';

  // הפרקים המוכנים, לפי סדר הא׳–ב׳ של מספרי הפרקים
  var chipItems = fin.map(function (c) {
    return { ch: c.ch, h: '<li class="' + (c.check ? 'fix' : 'ok') + '"><b>' + esc(c.ch) + '</b> ' + esc(c.name) + '<span>' + (c.check ? 'בתיקונים אחרונים' : 'מוכן') + '</span></li>' };
  }).concat(parts.map(function (p) { return { ch: p[0], h: '<li class="ok"><b>' + esc(p[0]) + '</b> ' + esc(names[p[0]] || '') + ' — חלק ה' + esc(p[1]) + '<span>מוכן</span></li>' }; }));
  chipItems.sort(function (a, b) { return chNum(a.ch) - chNum(b.ch); });
  var chips = chipItems.map(function (x) { return x.h; }).join('') || '<li class="none">עוד אין</li>';

  // הפרקים שעברו מיון בסיסי (כולל אלה שעברו כבר גם מיון סופי), לפי סדר הא׳–ב׳
  var basicChips = C.filter(function (c) { return c.basic_done; }).sort(function (a, b) { return chNum(a.ch) - chNum(b.ch); }).map(function (c) {
    var st = chapterStatus(c, today);
    var cls = c.final_done ? 'ok' : st[0] === 'late' ? 'fix' : 'b';
    return '<li class="' + cls + '"><b>' + esc(c.ch) + '</b> ' + esc(c.name) + '<span>' + (c.final_done ? 'עבר גם מיון סופי' : esc(st[1])) + '</span></li>';
  }).join('') || '<li class="none">עוד אין</li>';

  var links = (m.downloads || []).slice().sort(function (a, b) { return chNum(a.ch) - chNum(b.ch); }).map(function (d) {
    return '<li><b>' + esc(d.ch) + '</b><span class="t">' + esc(d.title) + '</span><span class="dt">' + esc(d.date_he) + '</span>' +
      '<a href="' + esc(d.href) + '" target="_blank" rel="noopener">פתיחה</a></li>';
  }).join('');

  var tables = '';
  [['קו 1', 'ממיין בסיסי 1 ← ממיין סופי 1'], ['קו 2', 'ממיין בסיסי 2 ← ממיין סופי 2'], ['בסוף', 'אחרי שכל שאר הפרקים גמורים · שני הממיינים הסופיים יחד']].forEach(function (ln) {
    var lst = C.filter(function (c) { return c.line === ln[0]; });
    if (!lst.length) return;
    var trs = lst.map(function (c) {
      var st = chapterStatus(c, today);
      var gotB = !c.basic_done ? '' : c.basic_src === 'לפני התכנית' ? '✓' : '✓ ' + hebDate(c.basic_done);
      var gotF = c.final_done ? '✓ ' + hebDate(c.final_done) : '';
      var planB = c.basic_from ? span(hebDate(c.basic_from), hebDate(c.basic_to)) : 'לפני התכנית';
      return '<tr><td class="k">' + esc(c.ch) + '</td><td>' + esc(c.name) + '</td><td><span class="st ' + st[0] + '">' + esc(st[1]) + '</span></td>' +
        '<td class="d">' + esc(planB) + '</td><td class="d">' + esc(gotB) + '</td>' +
        '<td class="d">' + esc(span(hebDate(c.final_from), hebDate(c.final_to))) + '</td><td class="d">' + esc(gotF) + '</td>' +
        '<td class="d">' + num(+c.pages || 0) + '</td></tr>';
    }).join('');
    tables += '<div class="card"><h2>' + esc(ln[0]) + '</h2><p class="note">' + esc(ln[1]) + '</p><div class="scroll"><table>' +
      '<thead><tr><th>פרק</th><th>שם</th><th>מצב</th><th>מיון בסיסי (תכנית)</th><th>התקבל</th>' +
      '<th>מיון סופי (תכנית)</th><th>התקבל</th><th>עמודי חומר</th></tr></thead>' +
      '<tbody>' + trs + '</tbody></table></div></div>';
  });

  var title = m.title || 'ספר ההדרכות';
  return '<!doctype html>\n<html lang="he" dir="rtl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<title>' + esc(title) + ' – התקדמות</title>\n<style>\n' + PAGE_CSS + '\n</style>\n</head>\n<body>\n<main>\n' +
    '  <header>\n    <h1>' + esc(title) + '</h1>\n    <p class="asof">עודכן: ' + esc(m.asof_he || '') + '</p>\n  </header>\n' +
    '  <section class="kpis">\n' +
    '    <div class="card"><div class="lbl">פרקים שעברו מיון סופי</div><div class="num">' + fin.length + '</div><div class="sub">מתוך ' + C.length + ' פרקים' + esc(partsText) + '</div></div>\n' +
    '    <div class="card"><div class="lbl">פרקים שעברו מיון בסיסי</div><div class="num">' + basicCh + '</div><div class="sub">מתוך ' + C.length + ' פרקים · ' + basicNow + ' במיון עכשיו</div></div>\n' +
    '    <div class="card"><div class="lbl">עמודים גמורים (הערכה)</div><div class="num">' + num(finalPages) + '</div><div class="sub">מתוך ' + num(finalPagesTotal) + ' בספר כולו</div></div>\n' +
    '    <div class="card"><div class="lbl">עמודי חומר שעברו מיון בסיסי</div><div class="num">' + num(basicDone) + '</div><div class="sub">מתוך ' + num(basicTotal) + ' עמודי חומר</div></div>\n' +
    '    <div class="card"><div class="lbl">מהעבודה כולה כבר נעשה</div><div class="num">' + actualPct + '%</div><div class="sub">מיון בסיסי וסופי של כל הפרקים</div></div>\n' +
    '  </section>\n  <section class="two">\n    <div class="card">\n      <h2>הפרקים שעברו מיון סופי</h2>\n      <ul class="chips">' + chips + '</ul>\n      ' +
    (links ? '<h3>הקבצים הסופיים</h3><ul class="files">' + links + '</ul>' : '') + '\n    </div>\n' +
    '    <div class="card">\n      <h2>הפרקים שעברו מיון בסיסי</h2>\n      <ul class="chips">' + basicChips + '</ul>\n    </div>\n' +
    '    <div class="card">\n      <h2>ההתקדמות עד הסוף</h2>\n' +
    '      <p class="note">100% = כל הפרקים עברו מיון בסיסי וסופי' + (m.finish ? ' (עד ' + esc(m.finish) + ')' : '') + '</p>\n' +
    '      <div class="row"><div class="top"><span>כמה התקדמנו</span><span class="big">' + actualPct + '%</span></div><div class="bar"><i style="width:' + actualPct + '%"></i></div></div>\n' +
    '      <div class="row small"><div class="top"><span class="lbl2">לפי לוח העבודה</span><span class="big">' + planPct + '%</span></div><div class="bar"><i style="width:' + planPct + '%"></i></div>\n' +
    '      <div class="scale"><span>0%</span><span>100%</span></div></div>\n    </div>\n  </section>\n' +
    '  <details class="more">\n    <summary>פירוט מלא: לוח הזמנים של כל הפרקים</summary>\n    <div class="more-body">' + tables + '</div>\n  </details>\n' +
    '  <footer>' + esc(m.footer || 'מתעדכן אוטומטית בימים א׳–ה׳ בערב') + '</footer>\n</main>\n</body>\n</html>\n';
}

// לבדיקה ב-Node בלבד; ב-Apps Script השורה הזו לא עושה כלום
if (typeof module !== 'undefined') module.exports = { renderPage: renderPage, hebDate: hebDate, gematria: gematria };
