# -*- coding: utf-8 -*-
"""Book split-view pipeline:
1. Parse pdftotext -bbox output -> clause-heading positions per PDF page.
2. PATCH sans_clauses with doc_page/doc_y0/doc_y1 (fractions of page height).
3. Upload the 349 rendered page PNGs to the private 'sans-pages' bucket.

Heading heuristic: a word matching a clause-ref pattern that starts its line
(nothing to its left) within the left content margin.
"""
import io, json, os, re, sys, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
BBOX = os.path.join(HERE, 'book-bbox.html')
BOOK = os.path.join(HERE, 'book')
ENV_PATH = r'C:\Users\User\OneDrive - Haberl\BMG\haberl-web\.env.local'
PAGE_OFFSET = 4  # file page = printed page + 4

REF_RE = re.compile(r'^(?:\d+(?:\.\d+)+|[A-Z](?:\.\d+)+)$')
WORD_RE = re.compile(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)</word>')
PAGE_RE = re.compile(r'<page width="([\d.]+)" height="([\d.]+)">')


def env():
    vals = {}
    with io.open(ENV_PATH, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals


def parse_pages():
    """-> list of pages; each: {'h': height, 'words': [(xmin,ymin,xmax,ymax,text)]}"""
    pages = []
    cur = None
    with io.open(BBOX, encoding='utf-8', errors='replace') as f:
        for line in f:
            pm = PAGE_RE.search(line)
            if pm:
                cur = {'w': float(pm.group(1)), 'h': float(pm.group(2)), 'words': []}
                pages.append(cur)
                continue
            if cur is None:
                continue
            for wm in WORD_RE.finditer(line):
                cur['words'].append((float(wm.group(1)), float(wm.group(2)),
                                     float(wm.group(3)), float(wm.group(4)), wm.group(5)))
    return pages


def heading_candidates(page):
    """Words that look like clause-ref headings starting a line."""
    out = []
    words = page['words']
    for (x0, y0, x1, y1, text) in words:
        t = text.strip().rstrip('.')
        if not REF_RE.match(t):
            continue
        if x0 > 0.45 * page['w']:  # headings live in the left part of the page
            continue
        # line start: no word ends to our left on (roughly) the same baseline
        line_left = [w for w in words if w[2] <= x0 + 0.5 and abs(w[1] - y0) < 3.0 and w != (x0, y0, x1, y1, text)]
        if line_left:
            continue
        out.append((t, y0))
    out.sort(key=lambda c: c[1])
    return out


def main():
    e = env()
    url = e['NEXT_PUBLIC_SUPABASE_URL'].rstrip('/')
    anon = e['NEXT_PUBLIC_SUPABASE_ANON_KEY']

    login = urllib.request.Request(
        url + '/auth/v1/token?grant_type=password',
        data=json.dumps({'email': e['DEV_PORTAL_EMAIL_ADMIN'], 'password': e['DEV_PORTAL_PASSWORD']}).encode(),
        method='POST')
    login.add_header('apikey', anon)
    login.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(login) as resp:
        token = json.loads(resp.read())['access_token']
    print('logged in')

    def req(method, path, payload=None, headers=None, raw=None):
        req_ = urllib.request.Request(url + path, method=method,
                                      data=raw if raw is not None else (json.dumps(payload).encode() if payload is not None else None))
        req_.add_header('apikey', anon)
        req_.add_header('Authorization', 'Bearer ' + token)
        for k, v in (headers or {}).items():
            req_.add_header(k, v)
        with urllib.request.urlopen(req_) as resp:
            return resp.status, resp.read()

    # 1. fetch all clauses (ref + printed page)
    clauses, off = [], 0
    while True:
        _, body = req('GET', '/rest/v1/sans_clauses?select=clause_ref,page_number&offset=%d&limit=1000' % off,
                      headers={'Content-Type': 'application/json'})
        batch = json.loads(body)
        clauses.extend(batch)
        if len(batch) < 1000:
            break
        off += 1000
    print('clauses:', len(clauses))

    # 2. positions
    pages = parse_pages()
    cands = [heading_candidates(p) if p['words'] else [] for p in pages]
    matched = unmatched = 0
    updates = []
    for c in clauses:
        ref, printed = c['clause_ref'], c['page_number']
        if not printed:
            continue
        fpage = printed + PAGE_OFFSET
        found = None
        for fp in (fpage, fpage + 1, fpage - 1):
            if not (1 <= fp <= len(pages)):
                continue
            page_c = cands[fp - 1]
            hit = next(((t, y) for (t, y) in page_c if t == ref), None)
            if hit:
                h = pages[fp - 1]['h']
                y0 = max(0.0, hit[1] / h - 0.004)
                later = [y for (t, y) in page_c if y > hit[1] + 1]
                y1 = min(0.965, (later[0] / h - 0.004)) if later else 0.965
                if y1 <= y0:
                    y1 = min(0.965, y0 + 0.03)
                found = (fp, round(y0, 4), round(y1, 4))
                break
        if found:
            matched += 1
            updates.append((ref, found[0], found[1], found[2]))
        else:
            unmatched += 1
            updates.append((ref, fpage if 1 <= fpage <= len(pages) else None, None, None))
    print('positions matched: %d, page-only: %d' % (matched, unmatched))

    # 3. PATCH rows
    ok = fail = 0
    for (ref, dp, y0, y1) in updates:
        if dp is None:
            continue
        payload = {'doc_page': dp, 'doc_y0': y0, 'doc_y1': y1}
        try:
            status, _ = req('PATCH', '/rest/v1/sans_clauses?clause_ref=eq.' + urllib.parse.quote(ref),
                            payload=payload, headers={'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
            ok += 1
        except urllib.error.HTTPError as err:
            fail += 1
            if fail < 5:
                print('PATCH fail', ref, err.code)
    print('patched: %d ok, %d failed' % (ok, fail))

    # 4. upload PNGs (skip if present: x-upsert true makes re-runs safe)
    files = sorted(os.listdir(BOOK))
    up = 0
    for name in files:
        with open(os.path.join(BOOK, name), 'rb') as f:
            data = f.read()
        try:
            req('POST', '/storage/v1/object/sans-pages/' + name, raw=data,
                headers={'Content-Type': 'image/png', 'x-upsert': 'true'})
            up += 1
        except urllib.error.HTTPError as err:
            print('upload fail', name, err.code, err.read()[:200])
            if up == 0:
                sys.exit(1)
        if up % 50 == 0:
            print('uploaded', up)
    print('uploaded %d pages' % up)


if __name__ == '__main__':
    main()
