"""Check the built public pages, referenced assets and release boundaries."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json
import base64
import re

root = Path(__file__).resolve().parents[1] / 'dist'
failures = []

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.path, self.links, self.ids = path, [], set()
        self.title, self.description, self.favicon = False, False, False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a: self.ids.add(a['id'])
        if tag == 'title': self.title = True
        if tag == 'meta' and a.get('name') == 'description': self.description = bool(a.get('content'))
        if tag == 'link' and a.get('rel') == 'icon': self.favicon = True
        if tag == 'img' and 'alt' not in a: failures.append(f'{self.path.name}: image missing alt')
        for key in ('href', 'src', 'poster'):
            if a.get(key): self.links.append(a[key])

pages = {}
for name in ('index.html', 'app.html', 'privacy.html', 'terms.html', '404.html'):
    path = root / name
    if not path.exists(): failures.append(f'Missing {name}'); continue
    page = Page(path)
    page.feed(path.read_text())
    pages[path] = page
    for field in ('title', 'description', 'favicon'):
        if not getattr(page, field): failures.append(f'{name}: missing {field}')

for path, page in pages.items():
    for link in page.links:
        url = urlsplit(link)
        if url.scheme or url.netloc or url.path.startswith('/_vercel/') or url.path.startswith('/api/'):
            continue
        target = (root / url.path.lstrip('/')) if url.path.startswith('/') else path.parent / url.path
        if not url.path: target = path
        elif url.path == '/': target = root / 'index.html'
        elif not target.suffix: target = target.with_suffix('.html')
        if not target.exists(): failures.append(f'{path.name}: broken local reference {link}')
        elif url.fragment and target in pages and unquote(url.fragment) not in pages[target].ids:
            failures.append(f'{path.name}: missing fragment {link}')

for path in root.rglob('*'):
    if path.is_file() and (path.name.startswith('.env') or path.suffix in ('.md', '.py') or '.git' in path.parts):
        failures.append(f'Non-public file in build: {path.relative_to(root)}')
    if path.is_file() and path.suffix in ('.html', '.js', '.css', '.json', '.webmanifest', '.xml', '.txt'):
        source = path.read_text()
        patterns = (
            r'sk_(?:live|test)_[A-Za-z0-9]{16,}',
            r'sk-(?:proj-)?[A-Za-z0-9_-]{24,}',
            r'sb_secret_[A-Za-z0-9_-]{16,}',
            r'AIzaSy[A-Za-z0-9_-]{30,}',
            r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
        )
        if any(re.search(pattern, source) for pattern in patterns):
            failures.append(f'Possible private credential in build: {path.relative_to(root)}')
        for match in re.finditer(r'eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+', source):
            try:
                payload = match.group(1)
                claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
                if claims.get('role') == 'service_role':
                    failures.append(f'Service-role token in build: {path.relative_to(root)}')
            except (ValueError, UnicodeError):
                pass
for name in ('robots.txt', 'sitemap.xml', 'assets/social-preview.jpg'):
    if not (root / name).exists(): failures.append(f'Missing {name}')
manifest = json.loads((root / 'manifest.webmanifest').read_text())
for icon in manifest['icons']:
    if not (root / icon['src']).exists(): failures.append(f'Missing manifest icon {icon["src"]}')
print(json.dumps({'pages': len(pages), 'local_references': sum(len(p.links) for p in pages.values()),
                  'build_bytes': sum(p.stat().st_size for p in root.rglob('*') if p.is_file()), 'failures': failures}, indent=2))
raise SystemExit(bool(failures))
