#!/usr/bin/env python3
# Public progress page for "ספר ההדרכות". Python 3.9+, stdlib only.
# Usage: python3 build_site.py CHAPTERS MILESTONES FILES DOWNLOADS PDF_DIR OUTDIR
#   CHAPTERS, MILESTONES, FILES, DOWNLOADS = the dashboard's JSON data files
#   PDF_DIR = folder holding each PDF of DOWNLOADS saved as <blob id>.pdf (may be empty)
# Writes OUTDIR/index.html (one self-contained page, no scripts), OUTDIR/.nojekyll and OUTDIR/files/*.pdf
import json, sys, os, html, re, shutil


def rows(p):
    if not p or not os.path.exists(p):
        return []
    d = json.load(open(p, encoding='utf-8'))
    return (d.get('rows') or d.get('data') or []) if isinstance(d, dict) else d


def span(a, b):
    if not a:
        return ''
    if a == b:
        return a
    da, *ma = a.split(' ')
    db, *mb = b.split(' ')
    return f'{da}–{db} {" ".join(mb)}' if ma == mb else f'{a} – {b}'


def status(c, today):
    def stage(k):
        if c.get(k + '_done'):
            return 'done'
        if not c.get(k + '_from'):
            return 'none'
        return 'late' if today > c[k + '_to'] else 'now' if today >= c[k + '_from'] else 'future'
    b, f = stage('basic'), stage('final')
    if f == 'done':
        return ('fix', 'עבר מיון סופי · בתיקונים אחרונים') if c.get('check') else ('ok', 'עבר מיון סופי')
    if b == 'done' and f == 'late':
        return 'late', 'מיון סופי באיחור'
    if b == 'done' and f == 'now':
        return 'now', 'במיון סופי'
    if b == 'done':
        return 'wait', 'ממתין למיון סופי'
    if b == 'late':
        return 'late', 'מיון בסיסי באיחור'
    if b == 'now':
        return 'now', 'במיון בסיסי'
    return 'future', 'טרם התחיל'


def main(chapters_p, milestones_p, files_p, downloads_p, pdf_dir, outdir):
    C = sorted(rows(chapters_p), key=lambda c: c.get('ord', 99))
    M = {m['id']: m for m in rows(milestones_p)}
    F = rows(files_p)
    today = str(C[0].get('asof', ''))[:10]
    e = html.escape
    n = lambda x: f'{x:,}'

    total = plan = actual = 0
    for c in C:
        w = float(c.get('pages') or 0)
        total += 2 * w
        for k in ('basic', 'final'):
            due = not c.get(k + '_from') or c.get(k + '_to', '') < today
            done = (0.5 if (k == 'final' and c.get('check')) else 1) if c.get(k + '_done') else 0
            plan += w * due
            actual += w * done
    pct = lambda x: round(100 * x / total) if total else 0
    actual_pct, plan_pct = pct(actual), pct(plan)

    final = [c for c in C if c.get('final_done')]
    done_ch = {c['ch'] for c in final}
    names = {c['ch']: c['name'] for c in C}
    parts = []
    for f in F:
        if f.get('kind') == 'final' and f.get('part') and f.get('ch') not in done_ch and (f['ch'], f['part']) not in parts:
            parts.append((f['ch'], f['part']))
    final_pages = sum(int(c.get('final_pages') or 0) for c in final)
    final_pages_total = sum(int(c.get('final_pages') or 0) for c in C)
    basic_ch = sum(1 for c in C if c.get('basic_done'))
    basic_now = sum(1 for c in C if not c.get('basic_done') and c.get('basic_from') and c['basic_from'] <= today <= c['basic_to'])
    basic_done = sum(int(c.get('pages') or 0) for c in C if c.get('basic_done'))
    basic_total = sum(int(c.get('pages') or 0) for c in C)
    finish = (M.get('finish') or {}).get('he', '')
    parts_text = (' · ועוד ' + ', '.join('חלק ה' + p for _, p in parts)) if parts else ''

    chips = ''.join(
        f'<li class="{"fix" if c.get("check") else "ok"}"><b>{e(c["ch"])}</b> {e(c["name"])}'
        f'<span>{"בתיקונים אחרונים" if c.get("check") else "מוכן"}</span></li>' for c in final)
    chips += ''.join(f'<li class="ok"><b>{e(ch)}</b> {e(names.get(ch, ""))} — חלק ה{e(p)}<span>מוכן</span></li>' for ch, p in parts)
    chips = chips or '<li class="none">עוד אין</li>'

    # final files: copy each listed PDF into OUTDIR/files and link it
    files_dir = os.path.join(outdir, 'files')
    os.makedirs(files_dir, exist_ok=True)
    links = ''
    for d in sorted(rows(downloads_p), key=lambda d: (d.get('ord', 99), d.get('path', ''))):
        m = re.fullmatch(r'/_blob/([0-9a-f]{32})', str(d.get('url', '')))
        if not m:
            continue
        src = os.path.join(pdf_dir, m.group(1) + '.pdf')
        if not os.path.exists(src):
            continue
        shutil.copyfile(src, os.path.join(files_dir, m.group(1) + '.pdf'))
        links += (f'<li><b>{e(str(d.get("ch", "")))}</b><span class="t">{e(str(d.get("title", "")))}</span>'
                  f'<span class="dt">{e(str(d.get("date_he", "")))}</span>'
                  f'<a href="files/{m.group(1)}.pdf" target="_blank" rel="noopener">פתיחה</a></li>')

    # detailed schedule, one table per line
    tables = ''
    for line, note in (('קו 1', 'ממיין בסיסי 1 ← ממיין סופי 1'), ('קו 2', 'ממיין בסיסי 2 ← ממיין סופי 2'),
                       ('בסוף', 'אחרי שכל שאר הפרקים גמורים · שני הממיינים הסופיים יחד')):
        lst = [c for c in C if c.get('line') == line]
        if not lst:
            continue
        trs = ''
        for c in lst:
            cls, label = status(c, today)
            got_b = '✓' if c.get('basic_src') == 'לפני התכנית' else ('✓ ' + c.get('basic_done_he', '')) if c.get('basic_done') else ''
            got_f = ('✓ ' + c.get('final_done_he', '')) if c.get('final_done') else ''
            plan_b = span(c.get('basic_from_he'), c.get('basic_to_he')) if c.get('basic_from') else 'לפני התכנית'
            trs += (f'<tr><td class="k">{e(c["ch"])}</td><td>{e(c["name"])}</td><td><span class="st {cls}">{e(label)}</span></td>'
                    f'<td class="d">{e(plan_b)}</td><td class="d">{e(got_b)}</td>'
                    f'<td class="d">{e(span(c.get("final_from_he"), c.get("final_to_he")))}</td><td class="d">{e(got_f)}</td>'
                    f'<td class="d">{n(int(c.get("pages") or 0))}</td></tr>')
        tables += (f'<div class="card"><h2>{e(line)}</h2><p class="note">{e(note)}</p><div class="scroll"><table>'
                   '<thead><tr><th>פרק</th><th>שם</th><th>מצב</th><th>מיון בסיסי (תכנית)</th><th>התקבל</th>'
                   '<th>מיון סופי (תכנית)</th><th>התקבל</th><th>עמודי חומר</th></tr></thead>'
                   f'<tbody>{trs}</tbody></table></div></div>')

    page = f'''<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ספר ההדרכות – התקדמות</title>
<style>
:root {{ --bg:#f7f6f2; --panel:#fff; --fg:#1f1e1b; --muted:#6b675f; --line:#e4e1d8; --accent:#2f6f5e; --plan:#b9b4a8; --ok:#2f6f5e; --okbg:#e3efe9; --warn:#8a5a12; --warnbg:#f6ecd9; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg:#1a1a18; --panel:#242421; --fg:#ecebe6; --muted:#a3a097; --line:#3a3934; --accent:#6fc2a8; --plan:#5c5a53; --ok:#8fd3bd; --okbg:#21362f; --warn:#e7bd73; --warnbg:#3a2f1c; }} }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--fg); font-family:"Segoe UI",Arial,"Noto Sans Hebrew",sans-serif; line-height:1.5; }}
main {{ max-width:1080px; margin:0 auto; padding:32px 16px 48px; display:flex; flex-direction:column; gap:20px; }}
h1 {{ font-family:"Frank Ruhl Libre","David",Georgia,serif; font-weight:500; font-size:2rem; margin:0; }}
h2 {{ font-size:1.1rem; font-weight:600; margin:0 0 4px; }}
h3 {{ font-size:.95rem; font-weight:600; margin:18px 0 0; }}
.asof, .note {{ color:var(--muted); font-size:.85rem; margin:0; }}
.kpis {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr)); gap:14px; }}
.card {{ background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:20px; min-width:0; }}
.lbl {{ color:var(--muted); font-size:.85rem; }}
.num {{ font-family:"Frank Ruhl Libre","David",Georgia,serif; font-size:2.6rem; line-height:1.1; margin-top:6px; font-variant-numeric:tabular-nums; }}
.sub {{ color:var(--muted); font-size:.85rem; }}
.two {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr)); gap:14px; }}
ul.chips {{ list-style:none; padding:0; margin:14px 0 0; display:flex; flex-direction:column; gap:8px; }}
ul.chips li {{ display:flex; gap:8px; align-items:baseline; padding:8px 12px; border-radius:8px; background:var(--okbg); color:var(--ok); }}
ul.chips li.fix {{ background:var(--warnbg); color:var(--warn); }}
ul.chips li span {{ margin-inline-start:auto; font-size:.8rem; white-space:nowrap; }}
ul.chips li.none {{ background:none; color:var(--muted); }}
ul.files {{ list-style:none; padding:0; margin:8px 0 0; }}
ul.files li {{ display:flex; gap:8px; align-items:baseline; padding:8px 0; border-top:1px solid var(--line); font-size:.9rem; }}
ul.files .t {{ flex:1; min-width:0; }}
ul.files .dt {{ color:var(--muted); font-size:.8rem; white-space:nowrap; }}
ul.files a {{ color:var(--accent); font-weight:600; text-decoration:none; white-space:nowrap; }}
ul.files a:hover {{ text-decoration:underline; }}
.row {{ margin-top:18px; }}
.top {{ display:flex; justify-content:space-between; align-items:baseline; }}
.big {{ font-family:"Frank Ruhl Libre","David",Georgia,serif; font-size:1.8rem; font-variant-numeric:tabular-nums; }}
.bar {{ height:22px; border-radius:6px; background:var(--line); overflow:hidden; margin-top:6px; }}
.bar i {{ display:block; height:100%; border-radius:6px; background:var(--accent); }}
.small .bar {{ height:10px; }} .small .bar i {{ background:var(--plan); }}
.small .lbl2, .small .big {{ color:var(--muted); font-size:1rem; }}
.scale {{ display:flex; justify-content:space-between; color:var(--muted); font-size:.75rem; margin-top:4px; }}
details.more > summary {{ cursor:pointer; list-style:none; display:inline-block; padding:9px 18px; border:1px solid var(--line); border-radius:999px; background:var(--panel); }}
details.more > summary::-webkit-details-marker {{ display:none; }}
details.more > summary::after {{ content:" ▾"; color:var(--muted); }}
details.more[open] > summary::after {{ content:" ▴"; }}
.more-body {{ display:flex; flex-direction:column; gap:14px; margin-top:16px; }}
.scroll {{ overflow-x:auto; margin-top:10px; }}
table {{ width:100%; border-collapse:collapse; font-size:.85rem; }}
th {{ text-align:start; font-weight:600; color:var(--muted); padding:6px 8px; border-bottom:1px solid var(--line); white-space:nowrap; }}
td {{ padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; }}
tbody tr:last-child td {{ border-bottom:0; }}
td.k {{ font-weight:600; white-space:nowrap; }}
td.d {{ white-space:nowrap; font-variant-numeric:tabular-nums; }}
.st {{ display:inline-block; padding:1px 9px; border-radius:999px; font-size:.78rem; white-space:nowrap; border:1px solid transparent; }}
.st.ok {{ background:var(--okbg); color:var(--ok); }}
.st.fix, .st.late {{ background:var(--warnbg); color:var(--warn); }}
.st.now {{ border-color:var(--accent); color:var(--accent); }}
.st.wait, .st.future {{ border-color:var(--line); color:var(--muted); }}
footer {{ color:var(--muted); font-size:.8rem; text-align:center; }}
</style>
</head>
<body>
<main>
  <header>
    <h1>ספר ההדרכות</h1>
    <p class="asof">עודכן: {e(str(C[0].get("asof_he", "")))}</p>
  </header>
  <section class="kpis">
    <div class="card"><div class="lbl">פרקים שעברו מיון סופי</div><div class="num">{len(final)}</div><div class="sub">מתוך {len(C)} פרקים{e(parts_text)}</div></div>
    <div class="card"><div class="lbl">פרקים שעברו מיון בסיסי</div><div class="num">{basic_ch}</div><div class="sub">מתוך {len(C)} פרקים · {basic_now} במיון עכשיו</div></div>
    <div class="card"><div class="lbl">עמודים גמורים (הערכה)</div><div class="num">{n(final_pages)}</div><div class="sub">מתוך {n(final_pages_total)} בספר כולו</div></div>
    <div class="card"><div class="lbl">עמודי חומר שעברו מיון בסיסי</div><div class="num">{n(basic_done)}</div><div class="sub">מתוך {n(basic_total)} עמודי חומר</div></div>
    <div class="card"><div class="lbl">מהעבודה כולה כבר נעשה</div><div class="num">{actual_pct}%</div><div class="sub">מיון בסיסי וסופי של כל הפרקים</div></div>
  </section>
  <section class="two">
    <div class="card">
      <h2>הפרקים שעברו מיון סופי</h2>
      <ul class="chips">{chips}</ul>
      {('<h3>הקבצים הסופיים</h3><ul class="files">' + links + '</ul>') if links else ''}
    </div>
    <div class="card">
      <h2>ההתקדמות עד הסוף</h2>
      <p class="note">100% = כל הפרקים עברו מיון בסיסי וסופי{(" (עד " + e(finish) + ")") if finish else ""}</p>
      <div class="row"><div class="top"><span>כמה התקדמנו</span><span class="big">{actual_pct}%</span></div><div class="bar"><i style="width:{actual_pct}%"></i></div></div>
      <div class="row small"><div class="top"><span class="lbl2">לפי לוח העבודה</span><span class="big">{plan_pct}%</span></div><div class="bar"><i style="width:{plan_pct}%"></i></div>
      <div class="scale"><span>0%</span><span>100%</span></div></div>
    </div>
  </section>
  <details class="more">
    <summary>פירוט מלא: לוח הזמנים של כל הפרקים</summary>
    <div class="more-body">{tables}</div>
  </details>
  <footer>מתעדכן אוטומטית בימים א׳–ה׳ בערב</footer>
</main>
</body>
</html>
'''
    open(os.path.join(outdir, 'index.html'), 'w', encoding='utf-8').write(page)
    open(os.path.join(outdir, '.nojekyll'), 'w').write('')
    print(json.dumps({'actual_pct': actual_pct, 'plan_pct': plan_pct, 'final': len(final), 'parts': len(parts),
                      'final_pages': final_pages, 'pdf_links': links.count('<li>')}, ensure_ascii=False))


if __name__ == '__main__':
    main(*sys.argv[1:7])
