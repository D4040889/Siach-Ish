/**
 * ספר ההדרכות – הגיליון שמנהל את הדף הציבורי.
 *
 * איך זה עובד:
 *   - לשונית "פרקים": התכנית (תאריכים, שמות, הערות). עריכה כאן מעדכנת את הדף הציבורי תוך כדקה.
 *   - העמודות "התקבל" מתמלאות לבד מסריקת התיקייה "הדרכות מיון" (data/scan.json ב-GitHub).
 *     אם רוצים לקבוע ידנית, כותבים תאריך בעמודות "ידני", והוא גובר.
 *   - קובצי PDF שמניחים בתיקיית ה-Drive (ראו "הגדרות") מופיעים בדף תחת "הקבצים הסופיים".
 *   - הסקריפט בונה את index.html ודוחף אותו למאגר ב-GitHub (GitHub Pages).
 *
 * התקנה חד-פעמית: להריץ setup, ואז להכניס GITHUB_TOKEN ב-Project Settings → Script properties.
 */

var TZ = 'Asia/Jerusalem';
var SH_CH = 'פרקים', SH_SET = 'הגדרות', SH_MS = 'אבני דרך', SH_STATUS = 'מצב';

// עמודות לשונית "פרקים": [מפתח, כותרת, סוג]  סוג: '' טקסט, 'n' מספר, 'd' תאריך, 'auto' ממולא אוטומטית
var CH_COLS = [
  ['ord', 'סדר', 'n'], ['ch', 'פרק', ''], ['name', 'שם הפרק', ''], ['line', 'קו', ''],
  ['basic_by', 'ממיין בסיסי', ''], ['final_by', 'ממיין סופי', ''],
  ['pages', 'עמודי חומר', 'n'], ['final_pages', 'עמודים בספר', 'n'],
  ['basic_from', 'מיון בסיסי – מתאריך', 'd'], ['basic_to', 'מיון בסיסי – עד', 'd'],
  ['final_from', 'מיון סופי – מתאריך', 'd'], ['final_to', 'מיון סופי – עד', 'd'],
  ['check', 'הערת בדיקה (מוצגת בדף)', ''], ['check_date', 'תאריך הבדיקה', 'd'],
  ['note', 'הערה פנימית', ''],
  ['basic_done_manual', 'מיון בסיסי התקבל (ידני)', 'd'], ['final_done_manual', 'מיון סופי התקבל (ידני)', 'd'],
  ['basic_done', 'מיון בסיסי התקבל (מהסריקה)', 'auto'], ['basic_file', 'קובץ המיון הבסיסי', 'auto'],
  ['final_done', 'מיון סופי התקבל (מהסריקה)', 'auto'], ['final_file', 'קובץ המיון הסופי', 'auto'],
  ['status', 'מצב בדף', 'auto']
];
var SET_KEYS = { title: 'כותרת הדף', finish: 'יעד סיום (עברי)', repo: 'מאגר GitHub', branch: 'ענף', site: 'כתובת האתר',
  folder: 'תיקיית Drive לקבצים', email: 'אימייל להתראות', staleDays: 'התראה אם הסריקה לא רצה (ימים)', footer: 'הודעת הסוף בדף' };

// ---------- עזרים ----------
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) { var s = ss_().getSheetByName(name); if (!s) throw new Error('חסרה לשונית "' + name + '". יש להריץ setup.'); return s; }
function iso_(v) { // תא תאריך/טקסט -> YYYY-MM-DD או ''
  if (v && typeof v.getTime === 'function') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return s;
}
function now_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm"); }
function todayIso_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function prop_(k, v) { var p = PropertiesService.getScriptProperties(); if (v === undefined) return p.getProperty(k) || ''; if (v === null) p.deleteProperty(k); else p.setProperty(k, String(v)); }

function settings_() {
  var vals = sheet_(SH_SET).getDataRange().getValues(), out = {};
  Object.keys(SET_KEYS).forEach(function (k) {
    for (var i = 0; i < vals.length; i++) if (String(vals[i][0]).trim() === SET_KEYS[k]) { out[k] = vals[i][1]; break; }
    if (out[k] == null) out[k] = '';
  });
  out.staleDays = +out.staleDays || 2;
  out.branch = String(out.branch || 'main').trim();
  out.repo = String(out.repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  return out;
}

function readChapters_() {
  var sh = sheet_(SH_CH), vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  var hdr = vals[0].map(String), idx = {};
  CH_COLS.forEach(function (c) { idx[c[0]] = hdr.indexOf(c[1]); });
  var rows = [];
  for (var r = 1; r < vals.length; r++) {
    var v = vals[r]; if (!String(v[idx.ch] || '').trim()) continue;
    var o = { _row: r + 1 };
    CH_COLS.forEach(function (c) {
      var i = idx[c[0]], x = i < 0 ? '' : v[i];
      o[c[0]] = c[2] === 'd' ? iso_(x) : c[2] === 'n' ? (+x || 0) : String(x == null ? '' : x).trim();
    });
    rows.push(o);
  }
  return rows;
}

// ---------- GitHub ----------
function gh_(method, path, body) {
  var token = prop_('GITHUB_TOKEN');
  if (!token) throw new Error('חסר GITHUB_TOKEN ב-Script properties (Project Settings).');
  var res = UrlFetchApp.fetch('https://api.github.com' + path, {
    method: method, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    payload: body ? JSON.stringify(body) : undefined
  });
  var code = res.getResponseCode(), text = res.getContentText();
  if (code === 404) return null;
  if (code >= 300) throw new Error('GitHub ' + code + ' ' + method + ' ' + path + ': ' + text.slice(0, 300));
  return text ? JSON.parse(text) : {};
}
function ghGet_(repo, branch, path) { // {sha, text} או null
  var j = gh_('get', '/repos/' + repo + '/contents/' + encodeURI(path) + '?ref=' + encodeURIComponent(branch));
  if (!j) return null;
  var text = j.content ? Utilities.newBlob(Utilities.base64Decode(j.content.replace(/\n/g, ''))).getDataAsString('UTF-8') : '';
  return { sha: j.sha, text: text };
}
function ghPut_(repo, branch, path, text, message, sha) {
  var body = { message: message, content: Utilities.base64Encode(Utilities.newBlob(text, 'text/plain').getBytes()), branch: branch };
  if (sha) body.sha = sha;
  return gh_('put', '/repos/' + repo + '/contents/' + encodeURI(path), body);
}

// ---------- הסריקה (data/scan.json) ----------
function readScan_(st) {
  var f = ghGet_(st.repo, st.branch, 'data/scan.json');
  if (!f || !f.text) return { asof: '', asof_he: '', files: [], chapters: {}, downloads: [], events: [], _sha: '' };
  var s = JSON.parse(f.text); s._sha = f.sha; return s;
}

// ---------- תיקיית Drive ----------
function folderId_(st) {
  var s = String(st.folder || '').trim(); if (!s) return '';
  var m = s.match(/[-\w]{25,}/); return m ? m[0] : '';
}
function driveDownloads_(st) {
  var id = folderId_(st); if (!id) return [];
  var out = [];
  try {
    var it = DriveApp.getFolderById(id).getFiles();
    while (it.hasNext()) {
      var f = it.next();
      if (f.getMimeType() !== 'application/pdf') continue;
      try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
      var d = Utilities.formatDate(f.getLastUpdated(), TZ, 'yyyy-MM-dd');
      out.push({ ch: '', title: f.getName().replace(/\.pdf$/i, ''), date_he: hebDate(d), href: 'https://drive.google.com/file/d/' + f.getId() + '/view', _t: f.getLastUpdated().getTime() });
    }
  } catch (e) { throw new Error('תיקיית ה-Drive לא נגישה: ' + e.message); }
  out.sort(function (a, b) { return a._t - b._t; });
  return out;
}

// ---------- בניית המודל ----------
function buildModel_(st, scan, chapters) {
  var byCh = {}; chapters.forEach(function (c) { byCh[c.ch] = c; });
  var rows = chapters.map(function (c) {
    var a = scan.chapters[c.ch] || {};
    var basicDone = c.basic_done_manual || a.basic_done || '', finalDone = c.final_done_manual || a.final_done || '';
    return { ord: c.ord, ch: c.ch, name: c.name, line: c.line, pages: c.pages, final_pages: c.final_pages,
      basic_from: c.basic_from, basic_to: c.basic_to || c.basic_from, final_from: c.final_from, final_to: c.final_to || c.final_from,
      basic_done: basicDone, basic_src: c.basic_from ? (a.basic_src === 'לפני התכנית' ? 'תיקייה' : (a.basic_src || '')) : 'לפני התכנית',
      basic_file: a.basic_file || '', final_done: finalDone, final_file: a.final_file || '', check: c.check, check_date: c.check_date };
  });
  var dl = (scan.downloads || []).map(function (d) {
    var c = byCh[d.ch] || {};
    return { ord: c.ord || 99, path: d.path, ch: d.ch, title: (c.name || d.file) + (d.part ? ' — חלק ' + d.part : ''), date_he: d.date_he, href: d.pdf };
  }).sort(function (a, b) { return (a.ord - b.ord) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0); });
  dl = dl.concat(driveDownloads_(st));
  var asof = scan.asof ? scan.asof.slice(0, 10) : todayIso_();
  return { title: st.title || 'ספר ההדרכות', asof: asof, asof_he: scan.asof_he || (hebDate(asof)), finish: st.finish, chapters: rows, files: scan.files || [],
    downloads: dl, footer: st.footer || 'מתעדכן אוטומטית בימים א׳–ה׳ בערב' };
}

// ---------- הפעולה המרכזית ----------
function build() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return 'תפוס';
  try {
    var st = settings_();
    if (!st.repo) throw new Error('חסר "מאגר GitHub" בלשונית הגדרות');
    var scan = readScan_(st), chapters = readChapters_();
    if (!chapters.length) throw new Error('לשונית "פרקים" ריקה');
    var model = buildModel_(st, scan, chapters);
    var html = renderPage(model);
    var changed = [];
    var cur = ghGet_(st.repo, st.branch, 'index.html');
    if (!cur || cur.text !== html) { ghPut_(st.repo, st.branch, 'index.html', html, 'עדכון הדף מהגיליון', cur && cur.sha); changed.push('index.html'); }
    // התכנית ב-GitHub, כדי שהסריקה הלילית תדע את שמות הפרקים
    var plan = JSON.stringify(chapters.map(function (c) { return { ord: c.ord, ch: c.ch, name: c.name, line: c.line, pages: c.pages, final_pages: c.final_pages, basic_from: c.basic_from, basic_to: c.basic_to, final_from: c.final_from, final_to: c.final_to, check: c.check, check_date: c.check_date }; }), null, 1);
    var curPlan = ghGet_(st.repo, st.branch, 'data/chapters.json');
    if (!curPlan || curPlan.text !== plan) { ghPut_(st.repo, st.branch, 'data/chapters.json', plan, 'עדכון התכנית מהגיליון', curPlan && curPlan.sha); changed.push('data/chapters.json'); }
    writeAutoColumns_(model);
    prop_('LAST_SCAN_SHA', scan._sha || '');
    prop_('LAST_BUILD', now_());
    prop_('LAST_ERROR', null);
    writeStatus_(st, scan, model, changed);
    return changed.length ? 'עודכן: ' + changed.join(', ') : 'אין שינוי';
  } catch (e) {
    prop_('LAST_ERROR', now_() + ' ' + e.message);
    try { writeStatus_(settings_(), null, null, []); } catch (e2) {}
    throw e;
  } finally { lock.releaseLock(); }
}

function writeAutoColumns_(model) {
  var sh = sheet_(SH_CH), hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  var col = function (key) { var t = CH_COLS.filter(function (c) { return c[0] === key; })[0][1]; return hdr.indexOf(t) + 1; };
  var rows = readChapters_(); var byCh = {}; model.chapters.forEach(function (c) { byCh[c.ch] = c; });
  var keys = ['basic_done', 'basic_file', 'final_done', 'final_file', 'status'];
  var cols = keys.map(col); if (cols.some(function (c) { return c < 1; })) return;
  var first = Math.min.apply(null, cols), last = Math.max.apply(null, cols);
  rows.forEach(function (r) {
    var c = byCh[r.ch]; if (!c) return;
    var line = sh.getRange(r._row, first, 1, last - first + 1).getValues()[0];
    var put = function (k, v) { line[col(k) - first] = v; };
    put('basic_done', c.basic_done ? c.basic_done + ' (' + hebDate(c.basic_done) + ')' : '');
    put('basic_file', c.basic_file);
    put('final_done', c.final_done ? c.final_done + ' (' + hebDate(c.final_done) + ')' : '');
    put('final_file', c.final_file);
    put('status', chapterStatus(c, model.asof)[1]);
    sh.getRange(r._row, first, 1, last - first + 1).setValues([line]);
  });
}

function writeStatus_(st, scan, model, changed) {
  var sh = ss_().getSheetByName(SH_STATUS); if (!sh) sh = ss_().insertSheet(SH_STATUS);
  sh.clear();
  var scanAge = scan && scan.asof ? Math.floor((Date.now() - new Date(scan.asof).getTime()) / 864e5) : null;
  var rows = [
    ['הדף הציבורי', st.site || ''],
    ['בנייה אחרונה', prop_('LAST_BUILD')],
    ['מה עודכן בבנייה האחרונה', changed && changed.length ? changed.join(', ') : 'לא היה שינוי'],
    ['הסריקה האחרונה של התיקייה', scan ? (scan.asof_he || scan.asof || 'עדיין לא הייתה סריקה') : ''],
    ['ימים מאז הסריקה', scanAge == null ? '' : scanAge],
    ['שגיאה אחרונה', prop_('LAST_ERROR') || 'אין'],
    ['', ''],
    ['קבצים להורדה בדף', model ? model.downloads.length : ''],
  ];
  if (model) model.downloads.forEach(function (d) { rows.push([(d.ch ? d.ch + ' ' : '') + d.title, d.href]); });
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  sh.getRange(1, 1, 1, 2).setFontWeight('bold');
  sh.setColumnWidth(1, 260).setColumnWidth(2, 520); sh.setRightToLeft(true);
}

// ---------- טריגרים ----------
function onEditInstalled(e) {
  try {
    var name = e && e.range && e.range.getSheet().getName();
    if (name !== SH_CH && name !== SH_SET && name !== SH_MS) return;
    if (prop_('PENDING_BUILD')) return;
    ScriptApp.newTrigger('delayedBuild').timeBased().after(90 * 1000).create();
    prop_('PENDING_BUILD', '1');
  } catch (err) { prop_('LAST_ERROR', now_() + ' onEdit: ' + err.message); }
}
function delayedBuild() {
  prop_('PENDING_BUILD', null);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'delayedBuild') ScriptApp.deleteTrigger(t); });
  try { build(); } catch (e) { notify_('הדף הציבורי לא התעדכן', e.message); }
}
function hourlyTick() { // בונה רק אם הסריקה ב-GitHub השתנתה
  try {
    var st = settings_(); var f = ghGet_(st.repo, st.branch, 'data/scan.json');
    if (f && f.sha !== prop_('LAST_SCAN_SHA')) build();
  } catch (e) { prop_('LAST_ERROR', now_() + ' ' + e.message); }
}
function dailyCheck() { // בבוקר: בנייה מלאה + התראה אם הסריקה לא רצה
  try {
    build();
    var st = settings_(), scan = readScan_(st);
    if (!scan.asof) return;
    var age = (Date.now() - new Date(scan.asof).getTime()) / 864e5;
    if (age >= st.staleDays && !isWeekendGap_(age)) notify_('הסריקה של ספר ההדרכות לא רצה', 'הסריקה האחרונה של התיקייה הייתה ב-' + (scan.asof_he || scan.asof) + ' (לפני ' + Math.floor(age) + ' ימים). כדאי לבדוק שהמחשב דלוק ומחובר, ושהמשימה הלילית פעילה.');
  } catch (e) { notify_('בעיה בבניית הדף הציבורי', e.message); }
}
function isWeekendGap_(age) { // אין סריקה בליל שבת; ביום ראשון בבוקר פער של יומיים הוא תקין
  var day = +Utilities.formatDate(new Date(), TZ, 'u'); // 7 = ראשון
  return day === 7 && age < 3;
}
function notify_(subject, body) {
  try {
    var to = String(settings_().email || '').trim() || Session.getEffectiveUser().getEmail();
    if (to) MailApp.sendEmail(to, 'ספר ההדרכות: ' + subject, body + '\n\nהגיליון: ' + ss_().getUrl());
  } catch (e) { prop_('LAST_ERROR', now_() + ' mail: ' + e.message); }
}

// ---------- התקנה ----------
function setup() {
  var ss = ss_();
  try { ss.setSpreadsheetTimeZone(TZ); } catch (e) {}
  // פרקים
  var sh = ss.getSheetByName(SH_CH) || ss.insertSheet(SH_CH, 0);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, CH_COLS.length).setValues([CH_COLS.map(function (c) { return c[1]; })]);
    var rows = SEED.chapters.map(function (c) { return CH_COLS.map(function (col) { var v = c[col[0]]; return v == null ? '' : v; }); });
    sh.getRange(2, 1, rows.length, CH_COLS.length).setValues(rows);
    sh.setFrozenRows(1); sh.setFrozenColumns(3); sh.setRightToLeft(true);
    CH_COLS.forEach(function (c, i) {
      var rng = sh.getRange(2, i + 1, Math.max(sh.getMaxRows() - 1, 1), 1);
      if (c[2] === 'd') rng.setNumberFormat('yyyy-mm-dd');
      if (c[2] === 'auto') { rng.setBackground('#F1EFE8'); rng.setFontColor('#6B6459'); }
      sh.setColumnWidth(i + 1, c[0] === 'name' || c[0] === 'check' || c[0] === 'note' ? 260 : c[2] === 'auto' ? 200 : 120);
    });
    sh.getRange(1, 1, 1, CH_COLS.length).setFontWeight('bold').setBackground('#EFEBE3').setWrap(true);
    var autoStart = CH_COLS.map(function (c) { return c[2]; }).indexOf('auto') + 1;
    sh.getRange(1, autoStart, 1, CH_COLS.length - autoStart + 1).setBackground('#DCD5C6');
  }
  // הגדרות
  var set = ss.getSheetByName(SH_SET) || ss.insertSheet(SH_SET);
  if (set.getLastRow() === 0) {
    set.getRange(1, 1, 1, 2).setValues([['הגדרה', 'ערך']]).setFontWeight('bold').setBackground('#EFEBE3');
    set.getRange(2, 1, SEED.settings.length, 2).setValues(SEED.settings);
    set.setColumnWidth(1, 260).setColumnWidth(2, 460); set.setRightToLeft(true);
  }
  // אבני דרך
  var ms = ss.getSheetByName(SH_MS) || ss.insertSheet(SH_MS);
  if (ms.getLastRow() === 0) {
    ms.getRange(1, 1, 1, 4).setValues([['מזהה', 'תאריך', 'עברי', 'תווית']]).setFontWeight('bold').setBackground('#EFEBE3');
    ms.getRange(2, 1, SEED.milestones.length, 4).setValues(SEED.milestones.map(function (m) { return [m.id, m.date, m.he, m.label]; }));
    ms.setRightToLeft(true);
  }
  if (!ss.getSheetByName(SH_STATUS)) ss.insertSheet(SH_STATUS);
  // תיקיית Drive
  var st = settings_();
  if (!folderId_(st)) {
    var folder = DriveApp.createFolder('ספר ההדרכות – קבצים להורדה');
    setSetting_('folder', folder.getUrl());
  }
  if (!String(st.email || '').trim()) setSetting_('email', Session.getEffectiveUser().getEmail());
  // מחיקת הגיליון הריק שנוצר עם הקובץ
  ss.getSheets().forEach(function (s) { var n = s.getName(); if ((n === 'Sheet1' || n === 'גיליון1') && s.getLastRow() === 0) { try { ss.deleteSheet(s); } catch (e) {} } });
  // טריגרים
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('onEditInstalled').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('hourlyTick').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('dailyCheck').timeBased().atHour(9).nearMinute(20).everyDays(1).inTimezone(TZ).create();
  ss.setActiveSheet(sheet_(SH_CH));
  var msg = 'ההתקנה הושלמה. ' + (prop_('GITHUB_TOKEN') ? 'אפשר להריץ build.' : 'עכשיו צריך להוסיף GITHUB_TOKEN ב-Project Settings → Script properties, ואז להריץ build.');
  Logger.log(msg); return msg;
}
function setSetting_(key, value) {
  var sh = sheet_(SH_SET), vals = sh.getDataRange().getValues();
  for (var i = 0; i < vals.length; i++) if (String(vals[i][0]).trim() === SET_KEYS[key]) { sh.getRange(i + 1, 2).setValue(value); return; }
  sh.appendRow([SET_KEYS[key], value]);
}

// בדיקה מהירה שהטוקן עובד (בלי לכתוב כלום)
function testGithub() {
  var st = settings_(); var f = ghGet_(st.repo, st.branch, 'index.html');
  var msg = f ? 'החיבור ל-GitHub תקין. index.html קיים (' + f.text.length + ' תווים).' : 'החיבור תקין אבל index.html לא נמצא במאגר ' + st.repo;
  Logger.log(msg); return msg;
}

// ---------- נתוני ההתחלה (מהדשבורד הקודם) ----------
var SEED = {"chapters": [{"ord": 1, "ch": "ט׳", "name": "עבודת התפילה", "line": "קו 1", "basic_by": "—", "final_by": "סופי 1", "pages": 99, "final_pages": 15, "basic_from": "", "basic_to": "", "final_from": "2026-10-14", "final_to": "2026-10-14", "check": "", "check_date": "", "note": "נבדק בז׳ חשון (\"בדיקת פרק התפילה\"). גרסה מעודכנת נשמרה בח׳ חשון.", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 2, "ch": "יב׳", "name": "על טהרת הקודש", "line": "קו 1", "basic_by": "—", "final_by": "סופי 1", "pages": 61, "final_pages": 19, "basic_from": "", "basic_to": "", "final_from": "2026-10-14", "final_to": "2026-10-18", "check": "", "check_date": "", "note": "הדוגמה נבדקה בז׳ חשון (\"בדיקת הדוגמא\"). הגרסה הסופית נשמרה בח׳ חשון.", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 3, "ch": "א׳", "name": "יסודות חינוך הבנים", "line": "קו 1", "basic_by": "בסיסי 1", "final_by": "סופי 1", "pages": 118, "final_pages": 42, "basic_from": "2026-10-14", "basic_to": "2026-10-15", "final_from": "2026-10-18", "final_to": "2026-10-20", "check": "לתיקונים: להוסיף כ־5,400 מילים שחסרו כבר במיון הבסיסי, לתקן מקום אחד ולהחליט על שתי כפילויות", "check_date": "2026-10-21", "note": "פירוט בקבצים \"בדיקת יסודות חינוך הבנים\" ו\"בדיקת העבודה של גולדברג\".", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 4, "ch": "יז׳", "name": "נושאים ציבוריים", "line": "קו 1", "basic_by": "בסיסי 1", "final_by": "סופי 1", "pages": 89, "final_pages": 20, "basic_from": "2026-10-15", "basic_to": "2026-10-18", "final_from": "2026-10-22", "final_to": "2026-10-25", "check": "", "check_date": "", "note": "", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 5, "ch": "ה׳", "name": "דרך הלימוד", "line": "קו 1", "basic_by": "בסיסי 1", "final_by": "סופי 1", "pages": 178, "final_pages": 52, "basic_from": "2026-10-22", "basic_to": "2026-10-25", "final_from": "2026-10-26", "final_to": "2026-10-29", "check": "", "check_date": "", "note": "", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 6, "ch": "ג׳", "name": "ושננתם לבניך — הדרכת המחנך", "line": "קו 1", "basic_by": "בסיסי 1", "final_by": "סופי 1", "pages": 135, "final_pages": 57, "basic_from": "2026-10-25", "basic_to": "2026-10-27", "final_from": "2026-10-29", "final_to": "2026-11-03", "check": "", "check_date": "", "note": "", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 7, "ch": "יא׳", "name": "עבודת המידות ובין אדם לחברו", "line": "קו 1", "basic_by": "בסיסי 1", "final_by": "סופי 1", "pages": 363, "final_pages": 46, "basic_from": "2026-11-01", "basic_to": "2026-11-05", "final_from": "2026-11-04", "final_to": "2026-11-09", "check": "", "check_date": "", "note": "בשני חלקים; כל חצי עובר לממיין סופי 1 מיד כשהוא גמור.", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 8, "ch": "יד׳", "name": "אמונה וביטחון וקבלת ייסורים", "line": "קו 1", "basic_by": "בסיסי 1 + בסיסי שישי", "final_by": "דניאל + סופי 1", "pages": 269, "final_pages": 46, "basic_from": "2026-10-30", "basic_to": "2026-11-08", "final_from": "2026-11-08", "final_to": "2026-11-10", "check": "", "check_date": "", "note": "החצי הראשון: ממיין בסיסי 1 ← ממיין סופי 1. החצי השני: ממיין שישי ← דניאל.", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 9, "ch": "ב׳", "name": "התמודדויות בחינוך ונוער מתמודד", "line": "קו 1", "basic_by": "בסיסי 2", "final_by": "סופי שישי–מוצ״ש", "pages": 65, "final_pages": 27, "basic_from": "2026-10-22", "basic_to": "2026-10-23", "final_from": "2026-10-23", "final_to": "2026-10-30", "check": "", "check_date": "", "note": "ממיין בסיסי 2 מוסר עד י״ב חשון בבוקר; הממיין הסופי של שישי–מוצ״ש.", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 10, "ch": "טז׳", "name": "בין הזמנים ויומא דפגרא", "line": "קו 2", "basic_by": "בסיסי 2", "final_by": "סופי 2", "pages": 84, "final_pages": 14, "basic_from": "2026-10-14", "basic_to": "2026-10-19", "final_from": "2026-10-22", "final_to": "2026-10-22", "check": "", "check_date": "", "note": "המיון הבסיסי התקבל בי׳ חשון. נבדק: ראו \"בדיקת המיון הבסיסי - בין הזמנים\".", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 11, "ch": "טו׳", "name": "פרנסה והשתדלות", "line": "קו 2", "basic_by": "בסיסי 2", "final_by": "סופי 2", "pages": 66, "final_pages": 12, "basic_from": "2026-10-22", "basic_to": "2026-10-23", "final_from": "2026-10-26", "final_to": "2026-10-27", "check": "", "check_date": "", "note": "", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 12, "ch": "יג׳", "name": "במיעוט תענוג והסתפקות", "line": "קו 2", "basic_by": "בסיסי 2", "final_by": "סופי 2", "pages": 50, "final_pages": 5, "basic_from": "2026-10-23", "basic_to": "2026-10-25", "final_from": "2026-10-27", "final_to": "2026-10-27", "check": "", "check_date": "", "note": "", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 13, "ch": "ד׳", "name": "אהבת התורה וטעמה", "line": "קו 2", "basic_by": "בסיסי 1", "final_by": "סופי 2", "pages": 375, "final_pages": 60, "basic_from": "2026-10-27", "basic_to": "2026-11-01", "final_from": "2026-10-29", "final_to": "2026-11-04", "check": "", "check_date": "", "note": "המיון הבסיסי אצל ממיין בסיסי 1, בשני חלקים; כל חצי עובר לממיין סופי 2 מיד כשהוא גמור.", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 14, "ch": "ו׳", "name": "עמלה של תורה וגדלות האדם", "line": "קו 2", "basic_by": "דניאל", "final_by": "סופי 2", "pages": 311, "final_pages": 50, "basic_from": "2026-10-22", "basic_to": "2026-11-03", "final_from": "2026-10-28", "final_to": "2026-11-05", "check": "", "check_date": "", "note": "המיון הבסיסי אצל דניאל, בשני חלקים; כל חצי עובר לממיין סופי 2 מיד כשהוא גמור.", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 15, "ch": "ח׳", "name": "המעבר לישיבה גדולה", "line": "קו 2", "basic_by": "בסיסי שישי", "final_by": "סופי 2", "pages": 78, "final_pages": 31, "basic_from": "2026-10-23", "basic_to": "2026-10-23", "final_from": "2026-10-25", "final_to": "2026-10-26", "check": "", "check_date": "", "note": "ממיין שישי (י״ב חשון) ← ממיין סופי 2.", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 16, "ch": "ז׳", "name": "חיי הישיבה", "line": "קו 2", "basic_by": "בסיסי 2", "final_by": "סופי 2", "pages": 139, "final_pages": 45, "basic_from": "2026-10-25", "basic_to": "2026-10-30", "final_from": "2026-11-05", "final_to": "2026-11-10", "check": "", "check_date": "", "note": "", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 17, "ch": "יח׳", "name": "גזרת הגיוס", "line": "קו 2", "basic_by": "בסיסי שישי", "final_by": "סופי שישי–מוצ״ש", "pages": 85, "final_pages": 23, "basic_from": "2026-10-23", "basic_to": "2026-10-30", "final_from": "2026-10-30", "final_to": "2026-11-06", "check": "", "check_date": "", "note": "ממיין שישי ← הממיין הסופי של שישי–מוצ״ש.", "basic_done_manual": "", "final_done_manual": ""}, {"ord": 18, "ch": "י׳", "name": "יראת שמים ולימוד המוסר", "line": "בסוף", "basic_by": "—", "final_by": "סופי 1 ו־2", "pages": 185, "final_pages": 24, "basic_from": "", "basic_to": "", "final_from": "2026-11-10", "final_to": "2026-11-11", "check": "", "check_date": "", "note": "חלק המוסר כבר עבר מיון סופי (\"מוסר ערוך\", כ״ו תשרי). את יראת שמים עושים בסוף, כדי להשוות אותה לשאר הפרקים.", "basic_done_manual": "", "final_done_manual": ""}], "milestones": [{"id": "start", "date": "2026-10-14", "he": "ג׳ חשון", "label": "התחלה", "basic_pages": 0, "final_pages": 0, "final_chapters": 0}, {"id": "check", "date": "2026-10-28", "he": "י״ז חשון", "label": "נקודת הבדיקה", "basic_pages": 2200, "final_pages": 270, "final_chapters": 9}, {"id": "finish", "date": "2026-11-11", "he": "א׳ כסלו", "label": "סיום המיון", "basic_pages": 0, "final_pages": 0, "final_chapters": 0}, {"id": "deadline", "date": "2026-11-13", "he": "ג׳ כסלו", "label": "מועד אחרון", "basic_pages": 0, "final_pages": 0, "final_chapters": 0}], "settings": [["כותרת הדף", "ספר ההדרכות"], ["יעד סיום (עברי)", "א׳ כסלו"], ["מאגר GitHub", "d4040889/Siach-Ish"], ["ענף", "main"], ["כתובת האתר", "https://d4040889.github.io/Siach-Ish/"], ["תיקיית Drive לקבצים", ""], ["אימייל להתראות", ""], ["התראה אם הסריקה לא רצה (ימים)", 2], ["הודעת הסוף בדף", "מתעדכן אוטומטית בימים א׳–ה׳ בערב"]]};
