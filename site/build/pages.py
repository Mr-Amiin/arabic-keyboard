#!/usr/bin/env python3
"""Content for every route. Run via build.py (which imports this)."""
from build import (
    page, write_page, faq_html, related_tools_html, faq_jsonld,
    ALL_ROUTES, SITE_NAME, copy_static, write_sitemap,
)

# ---------------------------------------------------------------------------
# Shared content fragments
# ---------------------------------------------------------------------------

TOOL_CARDS = [
    ("/arabic-keyboard/", "⌨️", "لوحة المفاتيح العربية", "اكتب بالعربية باستخدام لوحة مفاتيح افتراضية أو تحويل صوتي أو لوحتك الفعلية."),
    ("/transliteration/", "🔤", "التحويل الصوتي", "حوّل الكتابة اللاتينية (Arabizi) إلى نص عربي فوريًا مع مرجع تحويل كامل."),
    ("/tashkeel/", "✨", "التشكيل", "أضف الحركات الإعرابية إلى نصك العربي — معاينة سريعة داخل المتصفح."),
    ("/editor/", "📝", "المحرر العربي", "بيئة كتابة عربية كاملة مع تنسيق واتجاه نص وإحصائيات."),
    ("/typing-test/", "⏱️", "اختبار الطباعة", "قِس سرعتك ودقتك في الكتابة بالعربية بمدد زمنية متعددة."),
    ("/arabic-typing-test/", "🏁", "اختبار الطباعة العربي", "نسخة مخصّصة لاختبار سرعة الطباعة بالعربية الفصحى."),
    ("/arabic-alphabet/", "📚", "الأبجدية العربية", "تعلم الحروف وأشكالها المتصلة ونطقها بشكل تفاعلي."),
    ("/learn-arabic/", "🎓", "تعلّم العربية", "دروس منظمة تغطي الحروف والأرقام والتشكيل وأساسيات الكتابة."),
]

def tool_cards_subset(paths):
    return [c for c in TOOL_CARDS if c[0] in paths]

TOOLBAR_HTML = """
<div class="toolbar" role="toolbar" aria-label="أدوات المحرر">
  <div class="tb-group">
    <button class="tb-btn" id="btnClear">🗑️ <span>مسح</span></button>
    <button class="tb-btn" id="btnUndo">↶ <span>تراجع</span></button>
    <button class="tb-btn" id="btnRedo">↷ <span>إعادة</span></button>
  </div>
  <div class="tb-sep"></div>
  <div class="tb-group">
    <button class="tb-btn" id="btnCopy">📋 <span>نسخ</span></button>
    <button class="tb-btn" id="btnPaste">📥 <span>لصق</span></button>
    <button class="tb-btn" id="btnDownload">⬇️ <span>تنزيل</span></button>
    <button class="tb-btn" id="btnPrint">🖨️ <span>طباعة</span></button>
  </div>
  <div class="tb-sep"></div>
  <div class="tb-group">
    <button class="tb-btn" id="btnDir">↔️ <span>الاتجاه</span></button>
    <button class="tb-btn" id="btnFontMinus">A-</button>
    <button class="tb-btn" id="btnFontPlus">A+</button>
  </div>
</div>
"""

def editor_block(placeholder="اكتب النص هنا…"):
    return f"""
<div class="editor-area">
  <textarea id="editor" class="editor" dir="rtl" placeholder="{placeholder}" aria-label="محرر النص العربي"></textarea>
  <div class="editor-meta lang-en">
    <span id="charCount">0 حرف</span>
    <span id="wordCount">0 كلمة</span>
  </div>
</div>
<div class="kb-panel">
  <div class="kb-head">
    <div class="mode-toggle" role="tablist" aria-label="وضع الإدخال">
      <button class="active" id="modeKeyboard" role="tab" aria-selected="true">⌨️ لوحة افتراضية</button>
      <button id="modeTranslit" role="tab" aria-selected="false">🔤 تحويل صوتي</button>
    </div>
    <span class="translit-note" id="modeHint">انقر الأزرار أو استخدم لوحة مفاتيحك الفعلية</span>
  </div>
  <div id="virtualKeyboard"></div>
</div>
"""

GENERIC_FAQ = [
    ("كيف أكتب بالعربية بدون لوحة مفاتيح عربية؟", "استخدم لوحة المفاتيح الافتراضية بالنقر على الأحرف، أو فعّل وضع «تحويل صوتي» واكتب بأحرف لاتينية مثل a وb و3 و7 لتحويلها تلقائيًا إلى عربية."),
    ("هل يعمل الموقع بدون اتصال بالإنترنت؟", "الوظائف الأساسية مثل الكتابة والتحويل الصوتي ولوحة المفاتيح تعمل محليًا في متصفحك، ويمكن للنسخة المثبّتة كتطبيق ويب أن تستمر في العمل دون اتصال."),
    ("هل يمكنني تنزيل النص الذي كتبته؟", "نعم، استخدم زر «تنزيل» في شريط الأدوات لحفظ النص كملف نصي على جهازك."),
]

# ---------------------------------------------------------------------------
# HOME  /
# ---------------------------------------------------------------------------
def build_home():
    body = f"""
<section class="hero">
  <span class="eyebrow lang-en">بدون تثبيت — يعمل مباشرة في المتصفح</span>
  <h1>اكتب بالعربية<br>بدون لوحة مفاتيح عربية</h1>
  <p class="lead">استخدم لوحة المفاتيح الافتراضية، أو التحويل الصوتي من الأحرف اللاتينية، أو لوحة مفاتيحك الفعلية — واكتب نصًا عربيًا واضحًا وسليمًا في ثوانٍ.</p>
</section>

<section class="tool-card" id="tool">
  {TOOLBAR_HTML}
  {editor_block()}
</section>

<div class="grid-cards" aria-label="أدوات سريعة">
  {''.join(f'<a href="{p.strip("/")}/" class="card"><div class="ic">{ic}</div><h3>{t}</h3><p>{d}</p></a>' for p, ic, t, d in TOOL_CARDS)}
</div>

<section class="section">
  <div class="section-head">
    <span class="kicker lang-en">Why لوحة عربي</span>
    <h2>لماذا هذه المنصة؟</h2>
    <p>مصمّمة لتكون سريعة وواضحة ومريحة للعين، بلا إعلانات مزعجة أو تحميلات ثقيلة.</p>
  </div>
  <div class="grid-cards">
    <div class="card"><div class="ic">⚡</div><h3>سريعة</h3><p>تعمل فور تحميل الصفحة دون تثبيت أي برنامج إضافي.</p></div>
    <div class="card"><div class="ic">🌓</div><h3>وضع داكن</h3><p>تصميم مريح للعين ليلًا ونهارًا مع تباين عالٍ للنص العربي.</p></div>
    <div class="card"><div class="ic">♿</div><h3>سهلة الوصول</h3><p>تدعم التنقل بلوحة المفاتيح وقارئات الشاشة بشكل كامل.</p></div>
    <div class="card"><div class="ic">📱</div><h3>متجاوبة</h3><p>تعمل بسلاسة على الجوال والتابلت وسطح المكتب.</p></div>
  </div>
</section>

<section class="section" id="faq-home">
  <div class="section-head">
    <span class="kicker lang-en">FAQ</span>
    <h2>أسئلة سريعة</h2>
  </div>
  <div class="wrap-narrow" style="padding:0;">
    {faq_html(GENERIC_FAQ)}
  </div>
</section>
"""
    html = page(
        "/",
        f"{SITE_NAME} | اكتب بالعربية أونلاين بدون لوحة مفاتيح",
        "اكتب بالعربية أونلاين مباشرة من متصفحك: لوحة مفاتيح افتراضية، تحويل صوتي، تشكيل، محرر نصوص، واختبار سرعة الطباعة — كل ذلك في مكان واحد ومجانًا.",
        "اكتب بالعربية بدون لوحة مفاتيح عربية",
        body,
        extra_scripts=["js/keyboard-tool.js", "js/home-init.js"],
        faq_ld=faq_jsonld(GENERIC_FAQ),
    )
    write_page("/", html)


# ---------------------------------------------------------------------------
# /arabic-keyboard/
# ---------------------------------------------------------------------------
def build_arabic_keyboard():
    faq = [
        ("ما الفرق بين هذه اللوحة ولوحة مفاتيح Windows العربية؟", "لوحة المفاتيح هذه تعمل داخل المتصفح مباشرة بدون أي تثبيت أو تغيير إعدادات نظام التشغيل، وتصلح لأي جهاز له متصفح ويب."),
        ("هل تدعم اللوحة الحركات (الفتحة والضمة والكسرة)؟", "يمكنك إدراج الحركات عبر أداة التشكيل السريع في شريط الأدوات، وسندعم مفاتيح حركات مخصّصة على اللوحة الافتراضية في تحديث لاحق."),
        ("هل يمكنني الكتابة بلوحة مفاتيحي الفعلية أيضًا؟", "نعم، يمكنك الكتابة مباشرة داخل مربع النص بلوحة مفاتيحك الفعلية، سواء كانت عربية أو إنجليزية مع وضع التحويل الصوتي."),
    ]
    body = f"""
<section class="hero compact">
  <span class="eyebrow lang-en">Free · No install</span>
  <h1>لوحة المفاتيح العربية الافتراضية</h1>
  <p class="lead">اكتب بالعربية فورًا من متصفحك على أي جهاز، بلوحة مفاتيح افتراضية كاملة أو بالتحويل الصوتي من الأحرف اللاتينية.</p>
</section>

<section class="tool-card" id="tool">
  {TOOLBAR_HTML}
  {editor_block()}
</section>

<article class="content-block wrap-narrow" style="padding:0;">
  <h2>كيف تكتب بالعربية بدون لوحة مفاتيح عربية؟</h2>
  <p>إذا كان جهازك لا يحتوي على لوحة مفاتيح عربية فعلية، يمكنك استخدام اللوحة الافتراضية أعلاه بالنقر على الأحرف بالفأرة أو باللمس على الجوال، أو تفعيل وضع «تحويل صوتي» والكتابة بأحرف لاتينية مألوفة (مثل 3 لحرف العين و7 لحرف الحاء) لتتحول تلقائيًا إلى نص عربي سليم.</p>
  <h3>تخطيط لوحة المفاتيح العربية</h3>
  <p>يتبع التخطيط الافتراضي هنا ترتيب لوحة المفاتيح العربية القياسية (تخطيط 101/102 مفتاح المعتمد عالميًا)، مع إتاحة كل حرف عبر النقر أو التنقل بمفتاح Tab للوصول الكامل بلوحة المفاتيح.</p>
  <h3>اختصارات مفيدة</h3>
  <ul>
    <li>زر «الاتجاه» لتبديل الكتابة بين RTL وLTR فوريًا لفقرات إنجليزية داخل النص العربي.</li>
    <li>زر «تشكيل سريع» لإضافة حركات تقريبية لمراجعة النص بصريًا.</li>
    <li>زر «تنزيل» لحفظ ما كتبته كملف نصي فورًا.</li>
  </ul>
</article>

<section class="section">
  <div class="section-head">
    <span class="kicker lang-en">Related</span>
    <h2>أدوات ذات صلة</h2>
  </div>
  {related_tools_html(tool_cards_subset(["/transliteration/", "/tashkeel/", "/typing-test/"]), 1)}
</section>

<section class="section">
  <div class="section-head"><span class="kicker lang-en">FAQ</span><h2>أسئلة شائعة عن لوحة المفاتيح العربية</h2></div>
  <div class="wrap-narrow" style="padding:0;">{faq_html(faq)}</div>
</section>
"""
    html = page(
        "/arabic-keyboard/",
        "لوحة المفاتيح العربية الافتراضية — اكتب بالعربية أونلاين",
        "لوحة مفاتيح عربية افتراضية مجانية تعمل في المتصفح. اكتب بالعربية بالنقر أو باللمس أو بالتحويل الصوتي، بدون تثبيت أي برنامج.",
        "لوحة المفاتيح العربية الافتراضية",
        body,
        breadcrumb_items=[("/", "الرئيسية"), ("/tools/", "الأدوات"), (None, "لوحة المفاتيح العربية")],
        extra_scripts=["js/keyboard-tool.js", "js/arabic-keyboard-init.js"],
        faq_ld=faq_jsonld(faq),
    )
    write_page("/arabic-keyboard/", html)


# ---------------------------------------------------------------------------
# /transliteration/
# ---------------------------------------------------------------------------
def build_transliteration():
    faq = [
        ("هل نظام التحويل الصوتي موحّد عالميًا؟", "لا. الكتابة العربية بأحرف لاتينية (تُعرف أيضًا بـ Arabizi) ليست معيارًا رسميًا واحدًا، بل عرفًا شائعًا بين المستخدمين تختلف تفاصيله من شخص لآخر. الجدول أدناه يوثّق التعيين الذي تستخدمه هذه الأداة تحديدًا."),
        ("لماذا يُستخدم الرقم 3 لحرف العين؟", "لأن شكل الرقم 3 يشبه بصريًا حرف العين المعكوس، وهو عرف شائع جدًا في الكتابة العربية غير الرسمية (Arabizi) منذ عهد الرسائل النصية المبكرة."),
        ("هل يمكن أن يعطي حرف لاتيني واحد أكثر من حرف عربي؟", "نعم في بعض الحالات (مثل w التي قد تدل على واو، أو الرقم 9 الذي يدل على صاد). عند الغموض تختار الأداة التعيين الأكثر شيوعًا، ويمكنك تصحيح الناتج يدويًا."),
    ]
    body = f"""
<section class="hero compact">
  <span class="eyebrow lang-en">Latin → Arabic</span>
  <h1>التحويل الصوتي (Arabizi) إلى العربية</h1>
  <p class="lead">اكتب بأحرف لاتينية وأرقام مألوفة واحصل على نص عربي فوري، مع جدول تعيين موثّق أدناه.</p>
</section>

<section class="tool-card">
  <div class="editor-area">
    <label for="translitInput" class="lang-en" style="font-size:12.5px; color:var(--ink-soft); display:block; margin-bottom:8px;">Latin / Arabizi input</label>
    <textarea id="translitInput" class="editor lang-en" dir="ltr" placeholder="Ex: ana asken fi masr, ahlan wa sahlan"></textarea>
  </div>
  <div class="toolbar">
    <div class="tb-group">
      <button class="tb-btn primary" id="btnConvert">🔤 <span>تحويل إلى عربية</span></button>
      <button class="tb-btn" id="btnClearT">🗑️ <span>مسح</span></button>
      <button class="tb-btn" id="btnCopyT">📋 <span>نسخ الناتج</span></button>
      <button class="tb-btn" id="btnDownloadT">⬇️ <span>تنزيل</span></button>
    </div>
  </div>
  <div class="editor-area" style="padding-top:0;">
    <div id="translitOutput" class="editor" dir="rtl" style="min-height:120px;" aria-live="polite"></div>
  </div>
</section>

<section class="section">
  <div class="section-head left">
    <span class="kicker lang-en">Mapping reference</span>
    <h2>جدول التحويل الصوتي</h2>
    <p>هذا هو التعيين الذي تعتمده الأداة أعلاه — مبني على الاصطلاح الشائع بين مستخدمي العربية (Arabizi).</p>
  </div>
  <div class="map-wrap">
    <table class="map-table lang-en">
      <thead><tr><th>Latin</th><th>Arabic</th><th>Latin</th><th>Arabic</th><th>Latin</th><th>Arabic</th></tr></thead>
      <tbody id="mapTableBody"></tbody>
    </table>
  </div>
</section>

<section class="section">
  <div class="section-head left">
    <span class="kicker lang-en">Numbers</span>
    <h2>تعيينات الأرقام في Arabizi</h2>
  </div>
  <div class="map-wrap">
    <table class="map-table lang-en">
      <thead><tr><th>Number</th><th>Represents</th><th>Why</th></tr></thead>
      <tbody>
        <tr><td class="lat">2</td><td>ء / ق</td><td>Glottal stop shape</td></tr>
        <tr><td class="lat">3</td><td>ع</td><td>Mirrors ain's curve</td></tr>
        <tr><td class="lat">5</td><td>خ</td><td>Similar guttural sound to kh</td></tr>
        <tr><td class="lat">6</td><td>ط</td><td>Emphatic ta</td></tr>
        <tr><td class="lat">7</td><td>ح</td><td>Shape resembles ha</td></tr>
        <tr><td class="lat">9</td><td>ص</td><td>Emphatic sad</td></tr>
      </tbody>
    </table>
  </div>
</section>

<article class="content-block wrap-narrow" style="padding:0 20px;">
  <h2>ما هو التحويل الصوتي العربي؟</h2>
  <p>التحويل الصوتي (يُعرف أيضًا باسم Arabizi أو Franco-Arabic) هو أسلوب كتابة الكلمات العربية بأحرف لاتينية وأرقام، نشأ من الحاجة للتواصل بالعربية عبر أجهزة لا تدعم لوحة المفاتيح العربية. هذه الأداة تحوّل هذا الأسلوب إلى نص عربي حقيقي فوريًا.</p>
</article>

<section class="section">
  <div class="section-head"><span class="kicker lang-en">Related</span><h2>أدوات ذات صلة</h2></div>
  {related_tools_html(tool_cards_subset(["/arabic-keyboard/", "/tashkeel/", "/arabic-alphabet/"]), 1)}
</section>

<section class="section">
  <div class="section-head"><span class="kicker lang-en">FAQ</span><h2>أسئلة شائعة عن التحويل الصوتي</h2></div>
  <div class="wrap-narrow" style="padding:0;">{faq_html(faq)}</div>
</section>
"""
    html = page(
        "/transliteration/",
        "التحويل الصوتي العربي (Arabizi) — تحويل فوري إلى العربية",
        "حوّل الكتابة اللاتينية العربية (Arabizi) إلى نص عربي فوريًا، مع جدول تعيين كامل وموثّق لأرقام وأحرف Arabizi.",
        "التحويل الصوتي (Arabizi) إلى العربية",
        body,
        breadcrumb_items=[("/", "الرئيسية"), ("/tools/", "الأدوات"), (None, "التحويل الصوتي")],
        extra_scripts=["js/keyboard-tool.js", "js/transliteration-init.js"],
        faq_ld=faq_jsonld(faq),
    )
    write_page("/transliteration/", html)


# ---------------------------------------------------------------------------
# /tashkeel/
# ---------------------------------------------------------------------------
def build_tashkeel():
    faq = [
        ("هل التشكيل التلقائي دقيق لغويًا 100%؟", "لا. التشكيل العربي الصحيح يعتمد على السياق النحوي والصرفي الكامل للجملة، وهو ما يحتاج فعليًا محرك معالجة لغة طبيعية متخصصًا. المعاينة الحالية على هذه الصفحة تجريبية وتوضّح الفكرة فقط."),
        ("ما هي الحركات العربية الأساسية؟", "الفتحة، الضمة، الكسرة، السكون، الشدة، والتنوين بأنواعه الثلاثة (تنوين الفتح والضم والكسر)."),
        ("متى أحتاج إلى تشكيل النص؟", "التشكيل مفيد في تعليم القراءة، والنصوص الدينية، والشعر، وأي سياق يتطلب نطقًا دقيقًا لا لبس فيه."),
    ]
    body = f"""
<section class="hero compact">
  <span class="eyebrow lang-en">Diacritics</span>
  <h1>أداة التشكيل</h1>
  <p class="lead">أضف الحركات الإعرابية إلى نصك العربي.</p>
  <div style="margin-top:14px;"><span class="badge preview">⚠️ معاينة تجريبية داخل المتصفح</span></div>
</section>

<section class="demo-box wrap-narrow">
  <label for="tashkeelIn" style="font-size:13px; font-weight:600; display:block; margin-bottom:8px;">النص بدون تشكيل</label>
  <textarea class="demo-in editor" id="tashkeelIn" dir="rtl" placeholder="اكتب نصًا عربيًا بدون تشكيل…"></textarea>
  <div style="text-align:center; margin-top:14px;">
    <button class="tb-btn primary" id="tashkeelRun">تشكيل النص ✨</button>
  </div>
  <label for="tashkeelOut" style="font-size:13px; font-weight:600; display:block; margin:14px 0 8px;">الناتج</label>
  <div class="demo-out" id="tashkeelOut" dir="rtl" aria-live="polite">—</div>
  <div class="notice">⚠️ <span>هذه معاينة تقريبية تضيف حركة الفتحة بشكل مبسّط فوق الحروف الساكنة، ولا تعكس قواعد الإعراب الكاملة. النتائج قد تكون غير دقيقة لغويًا في بعض السياقات — راجع النصوص الرسمية بشريًا.</span></div>
</section>

<article class="content-block wrap-narrow" style="padding:32px 20px 0;">
  <h2>ما هو التشكيل العربي؟</h2>
  <p>التشكيل هو مجموعة العلامات التي تُضاف فوق الحروف العربية أو تحتها لتوضيح النطق الصحيح للكلمة.</p>
  <h3>أنواع الحركات</h3>
  <ul>
    <li><strong>الفتحة (َ)</strong> — تدل على صوت "أ" قصير.</li>
    <li><strong>الضمة (ُ)</strong> — تدل على صوت "أُ" قصير.</li>
    <li><strong>الكسرة (ِ)</strong> — تدل على صوت "إ" قصير.</li>
    <li><strong>السكون (ْ)</strong> — يدل على عدم وجود حركة بعد الحرف.</li>
    <li><strong>الشدة (ّ)</strong> — تدل على تضعيف الحرف (نطقه مرتين).</li>
    <li><strong>التنوين</strong> — إضافة نون ساكنة في النطق عند وقف الاسم عن الإعراب (فتح، ضم، كسر).</li>
  </ul>
  <h3>حدود هذه الأداة</h3>
  <p>نظام التشكيل الآلي الدقيق يتطلب تحليلًا نحويًا وصرفيًا كاملًا للجملة عبر خدمة معالجة لغة طبيعية متخصصة. النسخة الحالية على هذه الصفحة هي <strong>معاينة تجريبية بسيطة</strong> تعمل بالكامل داخل المتصفح دون اتصال بخادم، وهي مخصّصة لتوضيح الفكرة فقط. ندرس دمج خدمة تشكيل حقيقية عبر واجهة برمجية (API) في تحديث قادم — إن توفر ذلك سيظهر بوضوح كميزة "مدعومة بالذكاء الاصطناعي" منفصلة عن هذه المعاينة.</p>
</article>

<section class="section">
  <div class="section-head"><span class="kicker lang-en">Related</span><h2>أدوات ذات صلة</h2></div>
  {related_tools_html(tool_cards_subset(["/arabic-keyboard/", "/editor/", "/arabic-alphabet/"]), 1)}
</section>

<section class="section">
  <div class="section-head"><span class="kicker lang-en">FAQ</span><h2>أسئلة شائعة عن التشكيل</h2></div>
  <div class="wrap-narrow" style="padding:0;">{faq_html(faq)}</div>
</section>
"""
    html = page(
        "/tashkeel/",
        "أداة التشكيل العربي — إضافة الحركات الإعرابية",
        "أضف الحركات الإعرابية (الفتحة، الضمة، الكسرة، الشدة، التنوين) إلى نصك العربي عبر معاينة تجريبية داخل المتصفح، مع شرح كامل لأنواع الحركات.",
        "أداة التشكيل",
        body,
        breadcrumb_items=[("/", "الرئيسية"), ("/tools/", "الأدوات"), (None, "التشكيل")],
        extra_scripts=["js/tashkeel-tool.js", "js/tashkeel-init.js"],
        faq_ld=faq_jsonld(faq),
    )
    write_page("/tashkeel/", html)


# ---------------------------------------------------------------------------
# /editor/
# ---------------------------------------------------------------------------
def build_editor():
    faq = [
        ("هل يحفظ المحرر عملي تلقائيًا؟", "لا يوجد حفظ سحابي تلقائي حاليًا. استخدم زر «تنزيل» بشكل دوري لحفظ نسخة من نصك على جهازك."),
        ("هل يدعم المحرر النصوص الطويلة؟", "نعم، مساحة الكتابة قابلة للتمدد رأسيًا ولا يوجد حد أقصى عملي لطول النص."),
        ("هل يمكنني الكتابة بالعربية والإنجليزية معًا؟", "نعم، استخدم زر «الاتجاه» لتبديل اتجاه الفقرة الحالية عند الحاجة للتبديل بين النصين."),
    ]
    body = f"""
<section class="hero compact">
  <span class="eyebrow lang-en">Writing tool</span>
  <h1>المحرر العربي</h1>
  <p class="lead">بيئة كتابة عربية مخصّصة للملاحظات والرسائل والنصوص القصيرة — بدون تسجيل دخول وبدون تعقيد.</p>
</section>

<section class="tool-card">
  {TOOLBAR_HTML}
  {editor_block("ابدأ الكتابة… ملاحظات، رسالة، فقرة قصيرة")}
</section>

<article class="content-block wrap-narrow" style="padding:0 20px;">
  <h2>محرر مخصّص للكتابة العربية</h2>
  <p>على عكس الصفحة الرئيسية التي تُبرز اللوحة الافتراضية أولًا، هذه الصفحة مصمّمة لمن يريد التركيز على الكتابة المتصلة الطويلة: ملاحظة، رسالة، أو مسودة نص قصير، مع إحصائيات حية لعدد الأحرف والكلمات.</p>
</article>

<section class="section">
  <div class="section-head"><span class="kicker lang-en">Related</span><h2>أدوات ذات صلة</h2></div>
  {related_tools_html(tool_cards_subset(["/arabic-keyboard/", "/tashkeel/", "/typing-test/"]), 1)}
</section>

<section class="section">
  <div class="section-head"><span class="kicker lang-en">FAQ</span><h2>أسئلة شائعة عن المحرر</h2></div>
  <div class="wrap-narrow" style="padding:0;">{faq_html(faq)}</div>
</section>
"""
    html = page(
        "/editor/",
        "المحرر العربي — اكتب وحرّر نصوصك العربية أونلاين",
        "محرر نصوص عربي كامل مع دعم RTL/LTR، تحكم بحجم الخط، تراجع وإعادة، تنزيل وطباعة، وإحصائيات حية للأحرف والكلمات.",
        "المحرر العربي",
        body,
        breadcrumb_items=[("/", "الرئيسية"), ("/tools/", "الأدوات"), (None, "المحرر")],
        extra_scripts=["js/keyboard-tool.js", "js/editor-init.js"],
        faq_ld=faq_jsonld(faq),
    )
    write_page("/editor/", html)


# ---------------------------------------------------------------------------
# /typing-test/  and  /arabic-typing-test/ (shared component, different copy)
# ---------------------------------------------------------------------------
def typing_test_body(seo_variant=False):
    return f"""
<section class="hero compact">
  <span class="eyebrow lang-en">Speed test</span>
  <h1>{"اختبار الطباعة العربي" if seo_variant else "اختبار سرعة الطباعة"}</h1>
  <p class="lead">اكتب النص المعروض بأسرع وقت ممكن وبأعلى دقة، واختر مدة الاختبار المناسبة لك.</p>
</section>

<div class="duration-select lang-en">
  <button data-duration="15">15s</button>
  <button class="active" data-duration="30">30s</button>
  <button data-duration="60">60s</button>
</div>

<div class="stat-grid lang-en">
  <div class="stat"><div class="num" id="statWpm">0</div><div class="lbl">WPM</div></div>
  <div class="stat"><div class="num" id="statAcc">100%</div><div class="lbl">Accuracy</div></div>
  <div class="stat"><div class="num" id="statErr">0</div><div class="lbl">Errors</div></div>
  <div class="stat"><div class="num" id="statTime">30</div><div class="lbl">Seconds</div></div>
</div>
<div class="prompt-text" id="promptText" dir="rtl"></div>
<input type="text" id="typing-input" class="editor" style="min-height:auto; padding:14px 16px; font-size:20px;" dir="rtl" placeholder="ابدأ الكتابة هنا لتشغيل المؤقت…" autocomplete="off">
<div style="text-align:center; margin-top:14px;">
  <button class="tb-btn primary" id="restartTest">إعادة الاختبار ↻</button>
</div>
<div class="result-panel" id="resultPanel">
  <h3 style="margin-bottom:8px;">🎉 انتهى الاختبار</h3>
  <p style="color:var(--ink-soft);">راجع نتائجك أعلاه، ثم اضغط «إعادة الاختبار» لمحاولة تحسين رقمك.</p>
</div>

<article class="content-block wrap-narrow" style="padding:32px 20px 0;">
  <h2>{"اختبار طباعة مخصّص للعربية الفصحى" if seo_variant else "كيف يعمل اختبار الطباعة؟"}</h2>
  <p>يقيس الاختبار عدد الكلمات في الدقيقة (WPM) ونسبة الدقة بمقارنة كل حرف تكتبه بالنص الأصلي لحظيًا، مع عداد أخطاء تراكمي.</p>
</article>

<section class="section">
  <div class="section-head"><span class="kicker lang-en">Related</span><h2>أدوات ذات صلة</h2></div>
  {related_tools_html(tool_cards_subset(["/arabic-keyboard/", "/editor/", "/arabic-alphabet/"]), 1)}
</section>
"""

def build_typing_test():
    html = page(
        "/typing-test/",
        "اختبار سرعة الطباعة العربية — قِس WPM ودقتك",
        "اختبر سرعة طباعتك بالعربية ودقّتك مع مؤقت قابل للتخصيص (15، 30، 60 ثانية) ونتائج فورية لعدد الكلمات في الدقيقة والأخطاء.",
        "اختبار سرعة الطباعة",
        typing_test_body(False),
        breadcrumb_items=[("/", "الرئيسية"), ("/tools/", "الأدوات"), (None, "اختبار الطباعة")],
        extra_scripts=["js/typing-test.js", "js/typing-test-init.js"],
    )
    write_page("/typing-test/", html)

def build_arabic_typing_test():
    html = page(
        "/arabic-typing-test/",
        "اختبار الطباعة العربي — تدرّب على الكتابة بالفصحى",
        "اختبار طباعة مخصّص للعربية الفصحى: قِس عدد الكلمات في الدقيقة والدقة، وتدرّب على الكتابة السريعة بنصوص عربية متنوعة.",
        "اختبار الطباعة العربي",
        typing_test_body(True),
        breadcrumb_items=[("/", "الرئيسية"), ("/learn-arabic/", "تعلّم العربية"), (None, "اختبار الطباعة العربي")],
        extra_scripts=["js/typing-test.js", "js/typing-test-init.js"],
    )
    write_page("/arabic-typing-test/", html)


# ---------------------------------------------------------------------------
# /arabic-alphabet/
# ---------------------------------------------------------------------------
def build_arabic_alphabet():
    faq = [
        ("كم عدد حروف الأبجدية العربية؟", "٢٨ حرفًا أساسيًا، بالإضافة إلى الهمزة التي تُعد شكلاً من أشكال الألف في بعض التصنيفات."),
        ("لماذا يتغيّر شكل الحرف حسب موضعه في الكلمة؟", "الكتابة العربية متصلة، فمعظم الحروف تتصل بما قبلها وبعدها، مما يغيّر شكلها البصري حسب الموضع (بداية، وسط، نهاية) مع بقاء صوتها ثابتًا."),
        ("ما الحروف التي لا تتصل بما بعدها؟", "ا، د، ذ، ر، ز، و — هذه الحروف تتصل بالحرف الذي قبلها فقط، مما يقطع الاتصال البصري مع الحرف التالي."),
    ]
    body = f"""
<section class="hero compact">
  <span class="eyebrow lang-en">Interactive</span>
  <h1>الأبجدية العربية</h1>
  <p class="lead">انقر أي حرف لسماع نطقه ومشاهدة أشكاله المتصلة (البداية والوسط والنهاية) مع مثال حي.</p>
</section>

<div class="alpha-grid" id="alphaGrid"></div>
<div class="letter-detail" id="letterDetail"></div>

<article class="content-block wrap-narrow" style="padding:32px 20px 0;">
  <h2>أشكال الحرف العربي المتصل</h2>
  <p>كل حرف عربي (باستثناء عدد قليل) له حتى أربعة أشكال بصرية حسب موقعه: منفرد، بداية الكلمة، وسط الكلمة، ونهاية الكلمة — انقر أي بطاقة أعلاه لمشاهدة الأشكال الأربعة لهذا الحرف.</p>
  <h3>نطق غير مدعوم؟</h3>
  <p>إن لم يدعم متصفحك تقنية النطق الصوتي (Speech Synthesis)، ستظهر رسالة توضيحية بدلاً من الصوت — يمكنك الاعتماد على رمز التحويل الصوتي الظاهر تحت كل حرف كبديل.</p>
</article>

<section class="section">
  <div class="section-head"><span class="kicker lang-en">Related</span><h2>أدوات ذات صلة</h2></div>
  {related_tools_html(tool_cards_subset(["/learn-arabic/", "/transliteration/", "/arabic-typing-test/"]), 1)}
</section>

<section class="section">
  <div class="section-head"><span class="kicker lang-en">FAQ</span><h2>أسئلة شائعة عن الأبجدية</h2></div>
  <div class="wrap-narrow" style="padding:0;">{faq_html(faq)}</div>
</section>
"""
    html = page(
        "/arabic-alphabet/",
        "الأبجدية العربية التفاعلية — الحروف وأشكالها ونطقها",
        "تعلّم حروف الأبجدية العربية الـ٢٨ بشكل تفاعلي: استمع للنطق، وشاهد أشكال كل حرف المتصلة (بداية، وسط، نهاية) مع أمثلة.",
        "الأبجدية العربية",
        body,
        breadcrumb_items=[("/", "الرئيسية"), ("/learn-arabic/", "تعلّم العربية"), (None, "الأبجدية العربية")],
        extra_scripts=["js/alphabet.js", "js/arabic-alphabet-init.js"],
        faq_ld=faq_jsonld(faq),
    )
    write_page("/arabic-alphabet/", html)


# ---------------------------------------------------------------------------
# /learn-arabic/
# ---------------------------------------------------------------------------
def build_learn_arabic():
    lessons = [
        ("/arabic-alphabet/", "📖", "الأبجدية العربية", "الحروف الـ٢٨ وأشكالها المتصلة ونطقها."),
        ("/tashkeel/", "✨", "الحركات والتشكيل", "الفتحة والضمة والكسرة والسكون والشدة والتنوين."),
        ("/transliteration/", "🔤", "التحويل الصوتي", "كيف تُكتب العربية بأحرف لاتينية (Arabizi)."),
        ("/arabic-keyboard/", "⌨️", "لوحة المفاتيح العربية", "تعلّم تخطيط لوحة المفاتيح العربية القياسية."),
        ("/arabic-typing-test/", "🏁", "التدرّب على الطباعة", "درّب سرعتك ودقتك في الكتابة بالعربية."),
        ("/editor/", "📝", "الكتابة المتصلة", "تدرّب على كتابة فقرات وجمل متصلة في محرر مخصّص."),
    ]
    body = f"""
<section class="hero compact">
  <span class="eyebrow lang-en">Start here</span>
  <h1>تعلّم العربية</h1>
  <p class="lead">نقطة انطلاق منظّمة لتعلّم أساسيات الكتابة العربية، من الحروف إلى الطباعة السريعة.</p>
</section>

<section class="section" style="padding-top:8px;">
  <div class="grid-cards">
    {"".join(f'<a href="..{p}" class="card"><div class="ic">{ic}</div><h3>{t}</h3><p>{d}</p></a>' for p, ic, t, d in lessons)}
  </div>
</section>

<article class="content-block wrap-narrow" style="padding:0 20px;">
  <h2>مسار مقترح للمبتدئين</h2>
  <ul>
    <li>ابدأ بصفحة <strong>الأبجدية العربية</strong> لتتعرف على شكل كل حرف ونطقه.</li>
    <li>انتقل إلى <strong>الحركات والتشكيل</strong> لفهم كيفية ضبط نطق الكلمات.</li>
    <li>جرّب <strong>لوحة المفاتيح العربية</strong> لتعتاد كتابة الحروف بنفسك.</li>
    <li>استخدم <strong>التحويل الصوتي</strong> إن كنت معتادًا على الكتابة اللاتينية.</li>
    <li>اختبر تقدّمك عبر <strong>اختبار الطباعة العربي</strong>.</li>
  </ul>
</article>
"""
    html = page(
        "/learn-arabic/",
        "تعلّم العربية — دروس ومسار منظّم للمبتدئين",
        "مسار تعلّم منظّم للغة العربية يشمل الأبجدية والحركات والتحويل الصوتي ولوحة المفاتيح واختبار الطباعة — بطاقات مرتبطة بأدوات حقيقية.",
        "تعلّم العربية",
        body,
        breadcrumb_items=[("/", "الرئيسية"), (None, "تعلّم العربية")],
    )
    write_page("/learn-arabic/", html)


# ---------------------------------------------------------------------------
# /tools/
# ---------------------------------------------------------------------------
def build_tools():
    body = f"""
<section class="hero compact">
  <span class="eyebrow lang-en">Directory</span>
  <h1>كل الأدوات</h1>
  <p class="lead">كل أدوات الكتابة والتعلم العربية في مكان واحد.</p>
</section>
<section class="section" style="padding-top:8px;">
  {related_tools_html(TOOL_CARDS, 1)}
</section>
"""
    html = page(
        "/tools/",
        "كل أدوات الكتابة العربية — لوحة عربي",
        "دليل شامل لكل أدوات لوحة عربي: لوحة المفاتيح، التحويل الصوتي، التشكيل، المحرر، اختبار الطباعة، والأبجدية التفاعلية.",
        "كل الأدوات",
        body,
        breadcrumb_items=[("/", "الرئيسية"), (None, "الأدوات")],
    )
    write_page("/tools/", html)


# ---------------------------------------------------------------------------
# /faq/
# ---------------------------------------------------------------------------
def build_faq():
    all_faq = GENERIC_FAQ + [
        ("هل الموقع مجاني بالكامل؟", "نعم، جميع الأدوات الحالية مجانية للاستخدام بدون تسجيل."),
        ("هل بياناتي أو ما أكتبه يُرسل إلى خادم؟", "الأدوات الأساسية (اللوحة، التحويل الصوتي، التشكيل التجريبي) تعمل بالكامل داخل متصفحك دون إرسال النص إلى أي خادم."),
        ("هل يدعم الموقع الوضع الداكن؟", "نعم، يمكنك التبديل من أيقونة القمر/الشمس في الأعلى، والموقع يحترم تفضيل نظام التشغيل تلقائيًا عند أول زيارة."),
    ]
    body = f"""
<section class="hero compact">
  <span class="eyebrow lang-en">Help</span>
  <h1>الأسئلة الشائعة</h1>
  <p class="lead">إجابات عن أكثر الأسئلة شيوعًا حول لوحة عربي وأدواتها.</p>
</section>
<div class="wrap-narrow" style="padding:0;">
  {faq_html(all_faq)}
</div>
"""
    html = page(
        "/faq/",
        "الأسئلة الشائعة — لوحة عربي",
        "إجابات شاملة عن الكتابة العربية أونلاين، لوحة المفاتيح الافتراضية، التحويل الصوتي، التشكيل، والخصوصية.",
        "الأسئلة الشائعة",
        body,
        breadcrumb_items=[("/", "الرئيسية"), (None, "الأسئلة الشائعة")],
        faq_ld=faq_jsonld(all_faq),
    )
    write_page("/faq/", html)


# ---------------------------------------------------------------------------
# /about/
# ---------------------------------------------------------------------------
def build_about():
    body = """
<section class="hero compact">
  <span class="eyebrow lang-en">About</span>
  <h1>من نحن</h1>
  <p class="lead">منصة مستقلة لأدوات الكتابة العربية، بُنيت لتكون سريعة وواضحة وخالية من التعقيد.</p>
</section>
<article class="content-block wrap-narrow" style="padding:0 20px;">
  <h2>مهمتنا</h2>
  <p>نؤمن أن الكتابة بالعربية يجب أن تكون متاحة لأي شخص على أي جهاز، بغض النظر عن نوع لوحة المفاتيح المتوفرة لديه. لهذا بنينا لوحة عربي: مجموعة أدوات نصية عربية تعمل بالكامل داخل المتصفح.</p>
  <h2>ماذا نبني؟</h2>
  <ul>
    <li>لوحة مفاتيح عربية افتراضية سريعة الاستجابة.</li>
    <li>أداة تحويل صوتي (Arabizi) موثّقة وشفافة.</li>
    <li>أدوات تعليمية تفاعلية للأبجدية والنطق.</li>
    <li>أدوات قياس وتدريب على سرعة الطباعة.</li>
  </ul>
  <h2>ما لا ندّعيه</h2>
  <p>نحرص على الوضوح بشأن حدود كل أداة — مثل أداة التشكيل التي تُعرض حاليًا كمعاينة تجريبية وليست محرك معالجة لغة طبيعية كامل الدقة.</p>
</article>
"""
    html = page(
        "/about/", "من نحن — لوحة عربي",
        "تعرّف على فريق ورؤية لوحة عربي، منصة أدوات الكتابة العربية المجانية التي تعمل بالكامل داخل المتصفح.",
        "من نحن", body,
        breadcrumb_items=[("/", "الرئيسية"), (None, "من نحن")],
    )
    write_page("/about/", html)


# ---------------------------------------------------------------------------
# /contact/
# ---------------------------------------------------------------------------
def build_contact():
    body = """
<section class="hero compact">
  <span class="eyebrow lang-en">Get in touch</span>
  <h1>تواصل معنا</h1>
  <p class="lead">لديك اقتراح أو وجدت مشكلة؟ يسعدنا سماعك.</p>
</section>
<div class="wrap-narrow" style="padding:0 20px;">
  <form class="demo-box" onsubmit="return false;">
    <div class="form-field">
      <label for="cName">الاسم</label>
      <input type="text" id="cName" name="name" required>
    </div>
    <div class="form-field">
      <label for="cEmail">البريد الإلكتروني</label>
      <input type="email" id="cEmail" name="email" required>
      <div class="form-hint">لن نشارك بريدك مع أي جهة خارجية.</div>
    </div>
    <div class="form-field">
      <label for="cMsg">رسالتك</label>
      <textarea id="cMsg" name="message" rows="5" required></textarea>
    </div>
    <button type="submit" class="btn primary" id="contactSubmit">إرسال الرسالة</button>
    <p class="form-hint" id="contactNote" style="margin-top:12px;">ملاحظة: هذا نموذج عرض توضيحي ضمن هذا البناء الأولي؛ يحتاج ربطًا بخدمة بريد أو نقطة API فعلية قبل النشر الحقيقي.</p>
  </form>
</div>
"""
    html = page(
        "/contact/", "تواصل معنا — لوحة عربي",
        "تواصل مع فريق لوحة عربي للاستفسارات والاقتراحات والدعم الفني.",
        "تواصل معنا", body,
        breadcrumb_items=[("/", "الرئيسية"), (None, "تواصل معنا")],
        extra_scripts=["js/contact-init.js"],
    )
    write_page("/contact/", html)


# ---------------------------------------------------------------------------
# /privacy/  and  /terms/
# ---------------------------------------------------------------------------
def build_privacy():
    body = """
<section class="hero compact"><h1>سياسة الخصوصية</h1></section>
<article class="content-block wrap-narrow" style="padding:0 20px;">
  <p>آخر تحديث: أغسطس ٢٠٢٦</p>
  <h2>البيانات التي نجمعها</h2>
  <p>الأدوات الأساسية (لوحة المفاتيح، التحويل الصوتي، التشكيل التجريبي) تعمل بالكامل داخل متصفحك؛ النص الذي تكتبه لا يُرسل إلى خوادمنا في هذه النسخة.</p>
  <h2>ملفات تعريف الارتباط</h2>
  <p>لا تستخدم هذه النسخة التجريبية ملفات تعريف ارتباط تتبّعية.</p>
  <h2>التواصل معنا</h2>
  <p>لأي استفسار متعلق بالخصوصية، يرجى استخدام صفحة التواصل.</p>
</article>
"""
    html = page("/privacy/", "سياسة الخصوصية — لوحة عربي", "سياسة الخصوصية الخاصة بمنصة لوحة عربي وكيفية التعامل مع بياناتك.", "سياسة الخصوصية", body, breadcrumb_items=[("/", "الرئيسية"), (None, "الخصوصية")])
    write_page("/privacy/", html)

def build_terms():
    body = """
<section class="hero compact"><h1>الشروط والأحكام</h1></section>
<article class="content-block wrap-narrow" style="padding:0 20px;">
  <p>آخر تحديث: أغسطس ٢٠٢٦</p>
  <h2>استخدام الخدمة</h2>
  <p>هذه المنصة مقدَّمة "كما هي" بدون أي ضمانات، بما في ذلك دقة أدوات التشكيل والتحويل الصوتي التجريبية.</p>
  <h2>الملكية الفكرية</h2>
  <p>المحتوى والتصميم الخاص بالمنصة محمي، ويمكنك استخدام الأدوات لأغراضك الشخصية وغير التجارية بحرية.</p>
</article>
"""
    html = page("/terms/", "الشروط والأحكام — لوحة عربي", "الشروط والأحكام الخاصة باستخدام منصة لوحة عربي وأدواتها.", "الشروط والأحكام", body, breadcrumb_items=[("/", "الرئيسية"), (None, "الشروط")])
    write_page("/terms/", html)


def build_all():
    copy_static()
    build_home()
    build_arabic_keyboard()
    build_transliteration()
    build_tashkeel()
    build_editor()
    build_typing_test()
    build_arabic_typing_test()
    build_arabic_alphabet()
    build_learn_arabic()
    build_tools()
    build_faq()
    build_about()
    build_contact()
    build_privacy()
    build_terms()
    write_sitemap()


if __name__ == "__main__":
    build_all()
