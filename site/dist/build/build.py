#!/usr/bin/env python3
"""
لوحة عربي — static site builder.

Generates a real multi-route static site (clean URLs via folder/index.html)
from shared Python template functions, so the design system and nav/footer
are defined once and reused everywhere instead of being copy-pasted per page.

Run: python3 build.py
Output: ../dist/
"""
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
SITE_NAME = "لوحة عربي"
SITE_URL = "https://example.com"  # placeholder — update to the real deployed domain

# ---------------------------------------------------------------------------
# NAV / FOOTER DATA (single source of truth)
# ---------------------------------------------------------------------------
NAV_TOOLS = [
    ("/arabic-keyboard/", "لوحة المفاتيح العربية"),
    ("/calligraphy/", "استوديو الخط العربي"),
    ("/transliteration/", "التحويل الصوتي"),
    ("/tashkeel/", "التشكيل"),
    ("/editor/", "المحرر"),
    ("/typing-test/", "اختبار الطباعة"),
]
NAV_LEARN = [
    ("/arabic-alphabet/", "الأبجدية العربية"),
    ("/learn-arabic/", "تعلّم العربية"),
]
NAV_RESOURCES = [
    ("/faq/", "الأسئلة الشائعة"),
    ("/about/", "من نحن"),
    ("/contact/", "تواصل معنا"),
]
FOOT_TOOLS = NAV_TOOLS + [("/tools/", "كل الأدوات")]
FOOT_LEARN = NAV_LEARN + [("/arabic-typing-test/", "اختبار الطباعة العربي")]
FOOT_RESOURCES = NAV_RESOURCES
FOOT_COMPANY = [("/privacy/", "الخصوصية"), ("/terms/", "الشروط")]

ALL_ROUTES = ["/"] + [p for p, _ in NAV_TOOLS + NAV_LEARN + NAV_RESOURCES] + \
    ["/tools/", "/arabic-typing-test/", "/privacy/", "/terms/"]

# ---------------------------------------------------------------------------
# COMPONENT TEMPLATES
# ---------------------------------------------------------------------------

def asset(path, depth):
    """Return a relative path to /assets/... based on route depth."""
    prefix = "../" * depth if depth else "./"
    return prefix + "assets/" + path


def root_rel(depth):
    return "../" * depth if depth else "./"


def nav_dropdown(items, current_path):
    links = "".join(
        f'<a href="{root_rel(0)}{p.strip("/")}/"{" aria-current=\"page\"" if p == current_path else ""}>{label}</a>'
        for p, label in items
    )
    return links


def header_html(current_path, depth):
    r = root_rel(depth)

    def link(path, label):
        current = ' aria-current="page"' if path == current_path else ""
        href = r if path == "/" else f"{r}{path.strip('/')}/"
        return f'<a href="{href}"{current}>{label}</a>'

    tools_links = "".join(f'<a href="{r}{p.strip("/")}/">{l}</a>' for p, l in NAV_TOOLS)
    learn_links = "".join(f'<a href="{r}{p.strip("/")}/">{l}</a>' for p, l in NAV_LEARN)
    res_links = "".join(f'<a href="{r}{p.strip("/")}/">{l}</a>' for p, l in NAV_RESOURCES)

    return f"""
<a href="#main" class="skip-link lang-en">تخطَّ إلى المحتوى</a>
<header class="site">
  <div class="wrap nav-row">
    <a href="{r}" class="brand"><span class="mark">ع</span>{SITE_NAME}</a>
    <nav class="primary" aria-label="التنقل الرئيسي">
      <div class="nav-item">
        <button type="button" aria-haspopup="true">الأدوات <span aria-hidden="true">▾</span></button>
        <div class="dropdown">{tools_links}</div>
      </div>
      <div class="nav-item">
        <button type="button" aria-haspopup="true">تعلّم <span aria-hidden="true">▾</span></button>
        <div class="dropdown">{learn_links}</div>
      </div>
      <div class="nav-item">
        <button type="button" aria-haspopup="true">موارد <span aria-hidden="true">▾</span></button>
        <div class="dropdown">{res_links}</div>
      </div>
    </nav>
    <div class="head-actions">
      <select class="lang-select lang-en" aria-label="اختر اللغة">
        <option value="ar" selected>العربية</option>
        <option value="en">English</option>
      </select>
      <button class="icon-btn" id="themeToggle" aria-label="تبديل الوضع الداكن" title="الوضع الداكن">🌙</button>
      <button class="icon-btn hamburger" id="menuToggle" aria-label="فتح القائمة">☰</button>
    </div>
  </div>
</header>

<div id="mobileNav" aria-hidden="true">
  <div class="mobile-panel">
    <div class="close-x"><button class="icon-btn" id="mobileNavClose" aria-label="إغلاق القائمة">✕</button></div>
    {link("/", "الرئيسية")}
    <div class="grp-label lang-en">Tools</div>
    {"".join(f'<a href="{r}{p.strip("/")}/">{l}</a>' for p, l in NAV_TOOLS)}
    <div class="grp-label lang-en">Learn</div>
    {"".join(f'<a href="{r}{p.strip("/")}/">{l}</a>' for p, l in NAV_LEARN)}
    <div class="grp-label lang-en">Resources</div>
    {"".join(f'<a href="{r}{p.strip("/")}/">{l}</a>' for p, l in NAV_RESOURCES)}
  </div>
</div>
"""


def footer_html(depth):
    r = root_rel(depth)

    def col(items):
        return "".join(f'<li><a href="{r}{p.strip("/")}/">{l}</a></li>' for p, l in items)

    return f"""
<footer class="site">
  <div class="wrap">
    <div class="foot-grid">
      <div>
        <a href="{r}" class="brand" style="margin-bottom:10px;"><span class="mark">ع</span>{SITE_NAME}</a>
        <p style="color:var(--ink-soft); font-size:13.5px; line-height:1.8; max-width:280px;">منصة أدوات نصية عربية حديثة للكتابة والتعلم والتحويل — تعمل مباشرة في متصفحك دون الحاجة لتثبيت أي برنامج.</p>
      </div>
      <div><h4 class="lang-en">Tools</h4><ul>{col(FOOT_TOOLS)}</ul></div>
      <div><h4 class="lang-en">Learn</h4><ul>{col(FOOT_LEARN)}</ul></div>
      <div><h4 class="lang-en">Resources</h4><ul>{col(FOOT_RESOURCES)}</ul></div>
      <div><h4 class="lang-en">Company</h4><ul>{col(FOOT_COMPANY)}</ul></div>
    </div>
    <div class="foot-bottom">
      <span>© 2026 {SITE_NAME}</span>
      <span>صُنع بعناية للكتابة العربية</span>
    </div>
  </div>
</footer>
"""


def breadcrumbs_html(items, depth):
    """items: list of (path_or_None, label). Last item has path None (current page)."""
    r = root_rel(depth)
    parts = []
    for i, (path, label) in enumerate(items):
        if i > 0:
            parts.append('<span class="sep" aria-hidden="true">/</span>')
        if path is None:
            parts.append(f'<span class="current" aria-current="page">{label}</span>')
        else:
            href = r if path == "/" else f"{r}{path.strip('/')}/"
            parts.append(f'<a href="{href}">{label}</a>')
    return f'<nav class="breadcrumbs wrap lang-en" aria-label="Breadcrumb">{"".join(parts)}</nav>'


def faq_html(items, list_id="pageFaq"):
    rows = "".join(f"""
      <div class="faq-item">
        <button class="faq-q" aria-expanded="false">{q} <span class="chev" aria-hidden="true">⌄</span></button>
        <div class="faq-a">{a}</div>
      </div>""" for q, a in items)
    return f'<div id="{list_id}" data-faq-list>{rows}</div>'


def related_tools_html(items, depth):
    r = root_rel(depth)
    cards = "".join(f"""
      <a href="{r}{p.strip('/')}/" class="card"><div class="ic">{icon}</div><h3>{title}</h3><p>{desc}</p></a>""" for p, icon, title, desc in items)
    return f'<div class="grid-cards">{cards}</div>'


def faq_jsonld(items):
    import json
    data = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": q,
                "acceptedAnswer": {"@type": "Answer", "text": re.sub("<[^<]+?>", "", a)},
            }
            for q, a in items
        ],
    }
    return f'<script type="application/ld+json">{json.dumps(data, ensure_ascii=False)}</script>'


def page(
    path,
    title,
    description,
    h1,
    body_html,
    breadcrumb_items=None,
    extra_head="",
    extra_scripts=None,
    faq_ld=None,
):
    """Assemble a full HTML document for a route."""
    depth = 0 if path == "/" else len([p for p in path.split("/") if p])
    canonical = SITE_URL + path
    r = root_rel(depth)
    crumbs = breadcrumbs_html(breadcrumb_items, depth) if breadcrumb_items else ""
    scripts = extra_scripts or []
    script_tags = "\n  ".join(f'<script src="{asset(s, depth)}" defer></script>' for s in scripts)

    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{canonical}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:type" content="website">
<meta property="og:url" content="{canonical}">
<meta name="theme-color" content="#1F6F53">
<link rel="manifest" href="{r}manifest.json">
<link rel="icon" href="{r}assets/icons/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&family=Tajawal:wght@300;400;500;700;800&family=Noto+Naskh+Arabic:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="{asset('css/styles.css', depth)}">
{faq_ld or ""}
{extra_head}
</head>
<body>
{header_html(path, depth)}
{crumbs}
<main id="main">
  <div class="wrap">
    {body_html}
  </div>
</main>
{footer_html(depth)}
<div class="toast" id="toast" role="status"></div>
<script src="{asset('js/app.js', depth)}" defer></script>
  {script_tags}
</body>
</html>"""


def write_page(path, html):
    if path == "/":
        out_dir = DIST
    else:
        out_dir = os.path.join(DIST, path.strip("/"))
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    print("built", path)


def copy_static():
    if os.path.exists(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST, exist_ok=True)
    shutil.copytree(os.path.join(ROOT, "assets"), os.path.join(DIST, "assets"))
    for fname in ("manifest.json", "sw.js", "robots.txt"):
        src = os.path.join(ROOT, fname)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(DIST, fname))


def write_sitemap():
    urls = "\n".join(
        f"  <url><loc>{SITE_URL}{p}</loc></url>" for p in ALL_ROUTES
    )
    xml = f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n'
    with open(os.path.join(DIST, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(xml)
    print("built sitemap.xml (%d urls)" % len(ALL_ROUTES))
