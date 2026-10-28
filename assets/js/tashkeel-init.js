document.addEventListener("DOMContentLoaded", () => {
  window.ArabicTashkeel.init({});

  /* On-screen Arabic keyboard: the same shared component as /arabic-keyboard/
     (assets/js/keyboard-tool.js), attached to the Tashkeel textarea. It inserts at
     the caret / over the selection and fires a normal "input" event, so the
     Tashkeel tool treats on-screen typing exactly like physical typing. */
  const row = document.getElementById("tashkeelKbRow");
  const panel = document.getElementById("tashkeelKbPanel");
  const sw = document.getElementById("tashkeelKbSwitch");
  const state = document.getElementById("tashkeelKbState");
  if (!row || !panel || !sw) return;

  const kb = window.ArabicKeyboardTool
    ? window.ArabicKeyboardTool.init({ editorId: "tashkeelIn", highlight: false, emitInput: true })
    : null;
  if (!kb) { row.hidden = true; panel.hidden = true; return; }   // keyboard script missing: leave the plain editor alone

  /* While the on-screen keyboard is ON, ask phones not to open their own keyboard for this
     textarea (inputmode="none"): the OS keyboard would slide up over the on-screen keys, and
     every key tap re-focuses the editor. Hardware keyboards, paste, selection and caret
     placement are unaffected, and switching OFF gives the normal OS keyboard back. */
  const input = document.getElementById("tashkeelIn");
  const setOsKeyboard = (on) => { if (input) { if (on) input.setAttribute("inputmode", "none"); else input.removeAttribute("inputmode"); } };
  setOsKeyboard(true);

  /* ON/OFF switch. Only visibility changes: the textarea, its text and its
     selection are never touched. Default ON (markup ships with aria-checked="true"). */
  sw.addEventListener("click", () => {
    const on = sw.getAttribute("aria-checked") !== "true";
    sw.setAttribute("aria-checked", String(on));
    panel.hidden = !on;
    setOsKeyboard(on);
    if (state) state.textContent = on ? "تشغيل" : "إيقاف";
  });
});
