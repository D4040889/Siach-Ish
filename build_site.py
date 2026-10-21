#!/usr/bin/env python3
# Public progress page for "ספר ההדרכות". Python 3.9+, stdlib only.
# Usage: python3 site.py CHAPTERS_JSON MILESTONES_JSON OUTDIR
# Writes OUTDIR/index.html — one self-contained page, no scripts, no outside files.
import json, sys, os, html


def rows(p):
    d = json.load(open(p, encoding='utf-8'))
    return d.get('rows') or d.get('data') or [] if isinstance(d, dict) else d


def main(chapters_p, milestones_p, outdir):
    C = sorted(rows(chapters_p), key=lambda c: (c.get('line', ''), c.get('ord', 99)))
    M = {m['id']: m for m in rows(milestones_p)}
    today = str(C[0].get('asof', ''))[:10]
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
    final = [c for c in sorted(C, key=lambda c: c.get('ord', 99)) if c.get('final_done')]
    final_pages = sum(int(c.get('final_pages') or 0) for c in final)
    final_pages_total = sum(int(c.get('final_pages') or 0) for c in C)
    basic_done = sum(int(c.get('pages') or 0) for c in C if c.get('basic_done'))
    basic_total = sum(int(c.get('pages') or 0) for c in C)
    finish = (M.get('finish') or {}).get('he', '')
    e = html.escape
    n = lambda x: f'{x:,}'

    chips = ''.join(
        f'<li class="{"fix" if c.get("check") else "ok"}"><b>{e(c["ch"])}</b> {e(c["name"])}'
        f'<span>{"בתיקונים אחרונים" if c.get("check") else "מוכן"}</span></li>' for c in final) or '<li class="none">עוד אין</li>'

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
.asof, .note {{ color:var(--muted); font-size:.85rem; margin:0; }}
.kpis {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr)); gap:14px; }}
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
.row {{ margin-top:18px; }}
.top {{ display:flex; justify-content:space-between; align-items:baseline; }}
.big {{ font-family:"Frank Ruhl Libre","David",Georgia,serif; font-size:1.8rem; font-variant-numeric:tabular-nums; }}
.bar {{ height:22px; border-radius:6px; background:var(--line); overflow:hidden; margin-top:6px; }}
.bar i {{ display:block; height:100%; border-radius:6px; background:var(--accent); }}
.small .bar {{ height:10px; }} .small .bar i {{ background:var(--plan); }}
.small .lbl2, .small .big {{ color:var(--muted); font-size:1rem; }}
.scale {{ display:flex; justify-content:space-between; color:var(--muted); font-size:.75rem; margin-top:4px; }}
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
    <div class="card"><div class="lbl">פרקים שעברו מיון סופי</div><div class="num">{len(final)}</div><div class="sub">מתוך {len(C)} פרקים</div></div>
    <div class="card"><div class="lbl">עמודים גמורים (הערכה)</div><div class="num">{n(final_pages)}</div><div class="sub">מתוך {n(final_pages_total)} בספר כולו</div></div>
    <div class="card"><div class="lbl">עמודי חומר שעברו מיון בסיסי</div><div class="num">{n(basic_done)}</div><div class="sub">מתוך {n(basic_total)} עמודי חומר</div></div>
    <div class="card"><div class="lbl">מהעבודה כולה כבר נעשה</div><div class="num">{actual_pct}%</div><div class="sub">מיון בסיסי וסופי של כל הפרקים</div></div>
  </section>
  <section class="two">
    <div class="card">
      <h2>הפרקים שעברו מיון סופי</h2>
      <ul class="chips">{chips}</ul>
    </div>
    <div class="card">
      <h2>ההתקדמות עד הסוף</h2>
      <p class="note">100% = כל הפרקים עברו מיון בסיסי וסופי{(" (עד " + e(finish) + ")") if finish else ""}</p>
      <div class="row"><div class="top"><span>כמה התקדמנו</span><span class="big">{actual_pct}%</span></div><div class="bar"><i style="width:{actual_pct}%"></i></div></div>
      <div class="row small"><div class="top"><span class="lbl2">לפי לוח העבודה</span><span class="big">{plan_pct}%</span></div><div class="bar"><i style="width:{plan_pct}%"></i></div>
      <div class="scale"><span>0%</span><span>100%</span></div></div>
    </div>
  </section>
  <footer>מתעדכן אוטומטית בימים א׳–ה׳ בערב</footer>
</main>
</body>
</html>
'''
    os.makedirs(outdir, exist_ok=True)
    open(os.path.join(outdir, 'index.html'), 'w', encoding='utf-8').write(page)
    open(os.path.join(outdir, '.nojekyll'), 'w').write('')
    print(json.dumps({'actual_pct': actual_pct, 'plan_pct': plan_pct, 'final': len(final), 'final_pages': final_pages}, ensure_ascii=False))


if __name__ == '__main__':
    main(*sys.argv[1:4])
