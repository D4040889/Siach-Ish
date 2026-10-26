#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# סריקת התיקייה "הדרכות מיון" עבור הדף הציבורי של ספר ההדרכות. Python 3.9+, stdlib only.
#
#   python3 scan.py scan LISTING PREV_SCAN CHAPTERS OUT_SCAN
#       LISTING   = ה-JSON שהחזיר device_list_dir על התיקייה (recursive)
#       PREV_SCAN = data/scan.json הנוכחי מהמאגר (יכול לא להתקיים)
#       CHAPTERS  = data/chapters.json מהמאגר (התכנית מהגיליון; יכול לא להתקיים)
#       OUT_SCAN  = לאן לכתוב את scan.json החדש
#       מדפיס JSON: {"new_events": [...], "todo": [{path, win_path, pdf}]}  – ה-todo הם קבצי מיון סופי שצריך להמיר ל-PDF
#   python3 scan.py done OUT_SCAN DONE_JSON
#       DONE_JSON = {"<path>": "files/<name>.pdf", ...} של ההמרות שהצליחו בריצה הזו; מעדכן את OUT_SCAN במקום
import json, sys, os, datetime, hashlib, re
from zoneinfo import ZoneInfo

TZ = ZoneInfo('Asia/Jerusalem')
ROOT = r'C:\Users\d4154\OneDrive\גיבוי מחשב\פרויקטים שיח איש\משנת רמה\משנת רמה עריכה\הדרכות מיון'
MONTHS = [('2026-06-16', 'תמוז'), ('2026-07-15', 'אב'), ('2026-08-14', 'אלול'), ('2026-09-12', 'תשרי'), ('2026-10-12', 'חשון'), ('2026-11-11', 'כסלו'), ('2026-12-11', 'טבת'),
          ('2027-01-09', 'שבט'), ('2027-02-08', 'אדר א׳'), ('2027-03-10', 'אדר ב׳'), ('2027-04-08', 'ניסן'),
          ('2027-05-08', 'אייר'), ('2027-06-06', 'סיון'), ('2027-07-06', 'תמוז'), ('2027-08-04', 'אב'),
          ('2027-09-03', 'אלול'), ('2027-10-02', '')]


def gem(n):
    s = {15: 'טו', 16: 'טז'}.get(n) or (('יכל'[n // 10 - 1] if n >= 10 else '') + ('אבגדהוזחט'[n % 10 - 1] if n % 10 else ''))
    return s + '׳' if len(s) == 1 else s[:-1] + '״' + s[-1]


def heb(d):
    for (a, name), (b, _) in zip(MONTHS, MONTHS[1:]):
        a, b = datetime.date.fromisoformat(a), datetime.date.fromisoformat(b)
        if a <= d < b:
            return f'{gem((d - a).days + 1)} {name}'
    return d.strftime('%d.%m.%Y')


# לאיזה פרק שייך שם של תיקייה או קובץ. הסדר קובע (ההתאמה הראשונה מנצחת).
CHAPTERS = [
    ('י׳', ['יראת שמים']), ('י׳-מוסר', ['מוסר']),
    ('יב׳', ['טהרת הקודש', 'טהרה']), ('ט׳', ['תפילה']),
    ('א׳', ['יסודות', 'חינוך הבנים', 'חינוך הילדים']),
    ('יז׳', ['נושאים ציבוריים', 'ציבוריים']),
    ('ה׳', ['דרך הלימוד', 'דרכי הלימוד']),
    ('ג׳', ['ושננתם', 'מחנך']),
    ('יא׳', ['מידות', 'בין אדם לחברו']),
    ('יד׳', ['אמונה', 'ביטחון', 'בטחון', 'ייסורים', 'יסורים']),
    ('ב׳', ['התמודדויות', 'מתמודד']),
    ('טז׳', ['בין הזמנים', 'פגרא']),
    ('טו׳', ['פרנסה', 'השתדלות']),
    ('יג׳', ['מיעוט תענוג', 'הסתפקות', 'תענוג']),
    ('ד׳', ['אהבת התורה', 'טעמה']),
    ('ו׳', ['עמלה של תורה', 'עמל', 'גדלות']),
    ('ז׳', ['חיי הישיבה']),
    ('ח׳', ['המעבר לישיבה', 'ישיבה גדולה']),
    ('יח׳', ['גיוס']),
]
BASIC = 'מיון סופי/עבר מיון בסיסי/'
FINAL = 'מיון סופי/ממויין סופי/'
KIND_HE = {'basic': 'עבר מיון בסיסי', 'final': 'מיון סופי', 'report': 'בדיקה', 'sample': 'דוגמה',
           'draft': 'טיוטה', 'orphans': 'שייך לפרקים אחרים', 'other': 'אחר'}


def match(text):
    for ch, words in CHAPTERS:
        if any(w in text for w in words):
            return ch
    return ''


def classify(path):
    name = path.split('/')[-1]
    if 'שייך לפרקים אחרים' in path or 'קטעים השייכים' in path:
        return 'orphans', ''
    if path.startswith(BASIC):
        stage, rest = 'basic', path[len(BASIC):]
    elif path.startswith(FINAL):
        stage, rest = 'final', path[len(FINAL):]
    else:
        return 'other', match(name)
    parts = rest.split('/')
    sub = parts[0] if len(parts) > 1 else ''
    if name.startswith('בדיקת'):
        kind = 'report'
    elif 'דוגמא' in name or 'דוגמה' in name:
        kind = 'sample'
    elif 'טיוטא' in name or 'טיוטה' in name:
        kind = 'draft'
    elif 'סופי' in name:
        kind = 'final'  # קובץ מיון סופי שנשמר בתיקיית הבסיסי של הפרק
    else:
        kind = stage
    return kind, (match(sub) or match(name))


def load(path, default):
    if not path or not os.path.exists(path):
        return default
    text = open(path, encoding='utf-8').read().strip()
    return json.loads(text) if text else default


def rows(d):
    if isinstance(d, dict):
        d = d.get('rows') or d.get('data') or d.get('results') or d.get('entries') or []
    return d


def pdf_name(path):
    return 'files/' + hashlib.md5(path.encode('utf-8')).hexdigest() + '.pdf'


def scan(listing_p, prev_p, chapters_p, out_p):
    now = datetime.datetime.now(TZ)
    entries = rows(load(listing_p, []))
    prev = load(prev_p, {})
    plan = rows(load(chapters_p, []))
    if not entries:
        sys.exit('ERROR: empty listing - nothing written')
    names = {c['ch']: c['name'] for c in plan if c.get('ch')}
    prev_files = {f['path']: f for f in prev.get('files', [])}
    auto = {ch: dict(v) for ch, v in (prev.get('chapters') or {}).items()}
    events = list(prev.get('events') or [])
    stamp = now.isoformat(timespec='minutes')

    cur = []
    for e in entries:
        if e.get('type') != 'file':
            continue
        path = e['name'].replace('\\', '/')
        name = path.split('/')[-1]
        if name.startswith('~$') or name.lower() == 'desktop.ini':
            continue
        kind, ch = classify(path)
        dt = datetime.datetime.fromtimestamp(e['mtimeMs'] / 1000, TZ)
        cur.append({'path': path, 'name': name, 'folder': '/'.join(path.split('/')[:-1]) or 'הדרכות מיון',
                    'kind': kind, 'kind_he': KIND_HE[kind], 'ch': ch.replace('-מוסר', ''),
                    'part': 'מוסר' if ch == 'י׳-מוסר' else '', 'mtime': dt.isoformat(timespec='minutes'),
                    'date_he': heb(dt.date()), 'size': e.get('size', 0),
                    'seen': (prev_files.get(path) or {}).get('seen') or stamp})
    cur.sort(key=lambda r: r['mtime'], reverse=True)
    curmap = {r['path']: r for r in cur}

    new_events = []  # (iso, he, ch, kind, text)

    def ev(r, kind, text):
        new_events.append((r['mtime'], r['date_he'], r['ch'], kind, text))

    for r in sorted(cur, key=lambda r: r['mtime']):
        p = prev_files.get(r['path'])
        if p and p.get('mtime') == r['mtime'] and p.get('kind') == r['kind']:
            continue
        new = p is None
        verb = 'נוסף' if new else 'עודכן'
        c = auto.setdefault(r['ch'], {}) if r['ch'] else None
        title = f"פרק {r['ch']} {names.get(r['ch'], '')}".strip() if r['ch'] else ''
        day, dhe, k, nm = r['mtime'][:10], r['date_he'], r['kind'], f"\"{r['name']}\""
        if k in ('basic', 'final') and not r['ch']:
            ev(r, k, f"{verb} קובץ בתיקיית \"{KIND_HE[k]}\" ולא זוהה לאיזה פרק הוא שייך: {nm}")
        elif k in ('basic', 'final') and r['part']:
            ev(r, k, f"{title}: {verb} קובץ {KIND_HE[k]} של חלק המוסר ({nm})")
        elif k == 'basic':
            if not c.get('basic_done'):
                c.update(basic_done=day, basic_done_he=dhe, basic_src='תיקייה', basic_file=r['name'])
                ev(r, k, f"{title}: המיון הבסיסי התקבל ({nm})")
            else:
                if c.get('basic_src') == 'לוח העבודה':
                    c['basic_src'] = 'תיקייה'
                c['basic_file'] = r['name']
                ev(r, k, f"{title}: {verb} קובץ המיון הבסיסי ({nm})")
        elif k == 'final':
            if c.get('basic_file') == r['name']:
                others = [x for x in cur if x['ch'] == r['ch'] and x['kind'] == 'basic' and not x['part']]
                c['basic_file'] = others[0]['name'] if others else ''
            if not c.get('final_done'):
                c.update(final_done=day, final_done_he=dhe, final_file=r['name'])
                ev(r, k, f"{title}: המיון הסופי התקבל ({nm})")
            else:
                c['final_file'] = r['name']
                ev(r, k, f"{title}: {verb} קובץ המיון הסופי ({nm})")
        elif k == 'report':
            ev(r, k, f"{title or 'בדיקה'}: נוספה בדיקה ({nm})")
        elif k in ('sample', 'draft'):
            ev(r, k, f"{title or KIND_HE[k]}: {verb} {KIND_HE[k]} ({nm})")
        elif k == 'orphans':
            ev(r, k, f"{verb} קובץ \"שייך לפרקים אחרים\" ({nm})")
        elif new:
            ev(r, k, f"קובץ חדש בתיקייה \"{r['folder']}\": {nm}")
    for path, p in prev_files.items():
        if path not in curmap:
            new_events.append((stamp, heb(now.date()), p.get('ch', ''), 'removed',
                               f"הקובץ \"{p['name']}\" כבר לא נמצא ב\"{p.get('folder', '')}\" (הוסר או הועבר)"))

    next_id = max([int(u.get('id', 0)) for u in events] + [0]) + 1
    for at, dhe, ch, kind, text in sorted(new_events):
        events.append({'id': next_id, 'at': at, 'date_he': dhe, 'ch': ch, 'kind': kind, 'text': text})
        next_id += 1
    events = sorted(events, key=lambda u: (u['at'], u['id']), reverse=True)[:400]

    # הורדות: קבצי המיון הסופי. שומרים את ה-PDF הקיים אם הקובץ לא השתנה.
    prev_dl = {d['path']: d for d in prev.get('downloads', [])}
    downloads, todo = [], []
    finals = [f for f in cur if f['kind'] == 'final' and f['ch'] and f['name'].lower().endswith(('.docx', '.doc', '.pdf'))]
    for f in finals:
        old = prev_dl.get(f['path'])
        if old and old.get('pdf') and old.get('mtime') == f['mtime']:
            downloads.append(old)
        else:
            todo.append({'path': f['path'], 'win_path': ROOT + '\\' + f['path'].replace('/', '\\'), 'pdf': pdf_name(f['path'])})
            if old and old.get('pdf'):  # ישן נשאר עד שההמרה החדשה תצליח
                downloads.append(old)
    downloads.sort(key=lambda d: d['path'])

    out = {'asof': stamp, 'asof_he': f"{heb(now.date())}, {now:%H:%M}", 'files': cur, 'chapters': auto,
           'downloads': downloads, 'events': events, 'pending': todo}
    os.makedirs(os.path.dirname(os.path.abspath(out_p)), exist_ok=True)
    json.dump(out, open(out_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({'asof': out['asof_he'], 'files': len(cur), 'new_events': [e[4] for e in sorted(new_events)], 'todo': todo}, ensure_ascii=False, indent=1))


def done(out_p, done_p):
    out = load(out_p, {})
    done_map = load(done_p, {}) if done_p != '-' else {}
    files = {f['path']: f for f in out.get('files', [])}
    dl = {d['path']: d for d in out.get('downloads', [])}
    for path, pdf in done_map.items():
        f = files.get(path)
        if not f:
            continue
        dl[path] = {'path': path, 'ch': f['ch'], 'part': f['part'], 'file': f['name'], 'mtime': f['mtime'], 'date_he': f['date_he'], 'pdf': pdf}
    out['downloads'] = sorted(dl.values(), key=lambda d: d['path'])
    out['pending'] = [t for t in out.get('pending', []) if t['path'] not in done_map]
    json.dump(out, open(out_p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({'downloads': len(out['downloads']), 'new_copies': len(done_map), 'still_pending': [t['path'] for t in out['pending']]}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    if sys.argv[1] == 'scan':
        scan(*sys.argv[2:6])
    elif sys.argv[1] == 'done':
        done(*sys.argv[2:4])
    else:
        sys.exit('usage: scan.py scan LISTING PREV_SCAN CHAPTERS OUT | scan.py done OUT DONE_JSON')
