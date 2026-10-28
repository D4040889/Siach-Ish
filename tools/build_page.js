// בניית הדף הציבורי של ספר ההדרכות מתוך הנתונים שבמאגר – אותו מנוע (Builder.gs) ואותו מודל כמו הסקריפט שבגיליון.
// node build_page.js BUILDER_GS REPO
//   BUILDER_GS = הקובץ Builder.gs
//   REPO       = תיקיית המאגר; קורא data/chapters.json, data/scan.json, data/site.json (לא חובה) וכותב index.html
// מדפיס JSON קצר: האם הדף השתנה, כמה פרקים וקבצים להורדה.
'use strict';
const fs = require('fs'), path = require('path');
const [builderPath, repo] = process.argv.slice(2);
if (!builderPath || !repo) { console.error('usage: node build_page.js BUILDER_GS REPO'); process.exit(2); }
const B = require(path.resolve(builderPath));
const read = (p, dflt) => {
  const f = path.join(repo, p);
  if (!fs.existsSync(f)) { if (dflt !== undefined) return dflt; throw new Error('missing ' + p); }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
};
const chapters = read('data/chapters.json'), scan = read('data/scan.json'), site = read('data/site.json', {});
if (!Array.isArray(chapters) || !chapters.length) throw new Error('data/chapters.json is empty');

// כמו buildModel_ ב-Code.gs
const byCh = {}; chapters.forEach(c => { byCh[c.ch] = c; });
const auto = scan.chapters || {};
const rows = chapters.map(c => {
  const a = auto[c.ch] || {};
  return { ord: c.ord, ch: c.ch, name: c.name, line: c.line, pages: c.pages, final_pages: c.final_pages,
    basic_from: c.basic_from, basic_to: c.basic_to || c.basic_from, final_from: c.final_from, final_to: c.final_to || c.final_from,
    basic_done: c.basic_done_manual || a.basic_done || '',
    basic_src: c.basic_from ? (a.basic_src === 'לפני התכנית' ? 'תיקייה' : (a.basic_src || '')) : 'לפני התכנית',
    basic_file: a.basic_file || '', final_done: c.final_done_manual || a.final_done || '', final_file: a.final_file || '',
    check: c.check, check_date: c.check_date };
});
let downloads = (scan.downloads || []).map(d => {
  const c = byCh[d.ch] || {};
  return { ord: c.ord || 99, path: d.path, ch: d.ch, title: (c.name || d.file) + (d.part ? ' — חלק ' + d.part : ''), date_he: d.date_he, href: d.pdf };
}).sort((a, b) => (a.ord - b.ord) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
downloads = downloads.concat(site.drive_downloads || []);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date());
const asof = scan.asof ? scan.asof.slice(0, 10) : today;
const model = { title: site.title || 'ספר ההדרכות', asof: asof, asof_he: scan.asof_he || B.hebDate(asof), finish: site.finish === undefined ? 'א׳ כסלו' : site.finish,
  chapters: rows, files: scan.files || [], downloads: downloads, footer: site.footer || 'מתעדכן אוטומטית בימים א׳–ה׳ בערב' };

const html = B.renderPage(model);
const out = path.join(repo, 'index.html');
const old = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
if (html.length < 2000 || html.indexOf('</html>') < 0) throw new Error('page looks broken - not written');
fs.writeFileSync(out, html);
console.log(JSON.stringify({ changed: old !== html, asof: model.asof_he, chapters: rows.length, downloads: downloads.length }));
