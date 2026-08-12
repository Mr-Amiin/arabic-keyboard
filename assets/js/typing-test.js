/* ============================================================
   لوحة عربي — Arabic typing test component
   Mounts onto any page with: #promptText, #typing-input,
   #statWpm, #statAcc, #statErr, #statTime, #restartTest
   Optional: [data-duration] buttons, #resultPanel
   ============================================================ */
window.ArabicTypingTest = (function () {
  "use strict";

  const SAMPLE_TEXTS = [
    "اللغة العربية من أجمل اللغات وأكثرها ثراءً بالمفردات والتعابير الجميلة",
    "يمكنك الآن الكتابة بالعربية مباشرة من متصفحك دون الحاجة لتثبيت أي برنامج إضافي",
    "القراءة غذاء العقل ووسيلة لاكتساب المعرفة وتوسيع الآفاق في كل مجالات الحياة",
    "الصبر مفتاح الفرج ومن جد وجد ومن زرع حصد وفي التأني السلامة وفي العجلة الندامة",
    "تعلم لغة جديدة يفتح أبوابًا لثقافات وطرق تفكير مختلفة ويوسع مدارك الإنسان"
  ];

  function init() {
    const promptEl = document.getElementById("promptText");
    const typingInput = document.getElementById("typing-input");
    if (!promptEl || !typingInput) return null;
    const statWpm = document.getElementById("statWpm");
    const statAcc = document.getElementById("statAcc");
    const statErr = document.getElementById("statErr");
    const statTime = document.getElementById("statTime");
    const restartBtn = document.getElementById("restartTest");
    const resultPanel = document.getElementById("resultPanel");
    const durationBtns = document.querySelectorAll("[data-duration]");

    let duration = 60;
    let promptStr = "", startTime = null, timerInt = null, testDone = false;

    function pickPrompt() {
      return SAMPLE_TEXTS[Math.floor(Math.random() * SAMPLE_TEXTS.length)];
    }
    function renderPrompt(typed) {
      let html = "";
      for (let i = 0; i < promptStr.length; i++) {
        const ch = promptStr[i];
        if (i < typed.length) html += `<span class="${typed[i] === ch ? "correct" : "wrong"}">${ch}</span>`;
        else html += `<span class="pending">${ch}</span>`;
      }
      promptEl.innerHTML = html;
    }
    function startTest() {
      promptStr = pickPrompt();
      typingInput.value = ""; typingInput.disabled = false;
      startTime = null; testDone = false;
      if (statWpm) statWpm.textContent = "0";
      if (statAcc) statAcc.textContent = "100%";
      if (statErr) statErr.textContent = "0";
      if (statTime) statTime.textContent = duration;
      if (resultPanel) resultPanel.classList.remove("show");
      clearInterval(timerInt);
      renderPrompt("");
    }
    function tick() {
      const elapsed = (Date.now() - startTime) / 1000;
      const remaining = Math.max(0, duration - Math.floor(elapsed));
      if (statTime) statTime.textContent = remaining;
      if (remaining <= 0) finishTest();
    }
    function finishTest() {
      clearInterval(timerInt); testDone = true; typingInput.disabled = true;
      if (resultPanel) resultPanel.classList.add("show");
      window.showToast?.("انتهى الاختبار!");
    }
    typingInput.addEventListener("input", () => {
      if (testDone) return;
      if (!startTime) { startTime = Date.now(); timerInt = setInterval(tick, 250); }
      const typed = typingInput.value;
      renderPrompt(typed);
      let errors = 0;
      for (let i = 0; i < typed.length; i++) if (typed[i] !== promptStr[i]) errors++;
      const elapsedMin = Math.max((Date.now() - startTime) / 60000, 1 / 60);
      const wpm = Math.round(typed.trim().split(/\s+/).length / elapsedMin);
      const acc = typed.length ? Math.max(0, Math.round(((typed.length - errors) / typed.length) * 100)) : 100;
      if (statWpm) statWpm.textContent = isFinite(wpm) ? wpm : 0;
      if (statAcc) statAcc.textContent = acc + "%";
      if (statErr) statErr.textContent = errors;
      if (typed.length >= promptStr.length) finishTest();
    });
    if (restartBtn) restartBtn.addEventListener("click", () => { startTest(); typingInput.focus(); });
    durationBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        durationBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        duration = parseInt(btn.getAttribute("data-duration"), 10) || 60;
        startTest();
      });
    });

    startTest();
    return { startTest };
  }

  return { init };
})();
