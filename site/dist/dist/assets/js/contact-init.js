/* Demo-only contact form validation + submit feedback (no backend wired yet) */
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector(".demo-box");
  const submitBtn = document.getElementById("contactSubmit");
  if (!form || !submitBtn) return;
  submitBtn.addEventListener("click", () => {
    const name = document.getElementById("cName");
    const email = document.getElementById("cEmail");
    const msg = document.getElementById("cMsg");
    let valid = true;
    [name, email, msg].forEach((field) => {
      const wrap = field.closest(".form-field");
      if (!field.value.trim()) { wrap.classList.add("invalid"); valid = false; }
      else wrap.classList.remove("invalid");
    });
    if (!valid) { window.showToast?.("يرجى تعبئة جميع الحقول"); return; }
    window.showToast?.("هذا نموذج عرض توضيحي — لم يتم إرسال الرسالة فعليًا");
  });
});
