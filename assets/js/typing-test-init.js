document.addEventListener("DOMContentLoaded", () => {
  window.ArabicTypingTest.init();

  /* On-screen Arabic keyboard (/typing-test/ only): the same shared component as /arabic-keyboard/ and /tashkeel/
     (assets/js/keyboard-tool.js), attached to the test's own input. It inserts at the caret / over the selection and
     fires one normal "input" event, so the test treats on-screen typing exactly like physical typing. Always visible:
     there is deliberately no ON/OFF switch. Pages without #typingKbPanel (e.g. /arabic-typing-test/) are unaffected. */
  const panel = document.getElementById("typingKbPanel");
  const input = document.getElementById("typing-input");
  if (!panel || !input) return;
  const kb = window.ArabicKeyboardTool
    ? window.ArabicKeyboardTool.init({ editorId: "typing-input", highlight: false, emitInput: true })
    : null;
  if (!kb) { panel.hidden = true; return; }   // keyboard script missing: leave the plain test alone

  /* Phones: do not slide the OS keyboard over the on-screen keys (every key tap re-focuses the input). Hardware
     keyboards, paste, selection and caret placement are unaffected. */
  input.setAttribute("inputmode", "none");

  /* Pressing a key must not move focus off the input (a blur/refocus flickers the caret and, on touch screens,
     can scroll the page). Keys still work from the keyboard (Tab + Enter/Space) because that fires "click" only. */
  panel.addEventListener("mousedown", (e) => e.preventDefault());
});
