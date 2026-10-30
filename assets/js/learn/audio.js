/* Learn Arabic — pronunciation playback.
   1) Recorded audio: add verified files to RECORDINGS ({ "letter-ba": "/assets/audio/ba.mp3" }) and they play first.
   2) Otherwise the browser's built-in speech synthesis (device voice, NOT native-quality recording). */
window.LearnAudio = (function () {
  "use strict";
  const RECORDINGS = {};
  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
  function arabicVoice() { if (!synth) return null; const v = synth.getVoices() || []; return v.find(function (x) { return /^ar(-|_|$)/i.test(x.lang); }) || null; }
  function status() {
    if (!synth) return { ok: false, msg: "This browser does not support speech playback. Use the keyboard tool or a dictionary for audio." };
    if (!arabicVoice()) return { ok: false, msg: "No Arabic voice was found on this device, so audio may be silent or sound wrong. Install an Arabic voice in your system settings." };
    return { ok: true, msg: "Audio uses your device’s Arabic text-to-speech voice. It approximates pronunciation and is not a native recording." };
  }
  function speak(text, key) {
    if (key && RECORDINGS[key]) { try { new Audio(RECORDINGS[key]).play(); return true; } catch (e) { /* fall through */ } }
    if (!synth) return false;
    const u = new SpeechSynthesisUtterance(text); const v = arabicVoice(); u.lang = v ? v.lang : "ar-SA"; if (v) u.voice = v; u.rate = 0.8;
    synth.cancel(); synth.speak(u); return true;
  }
  if (synth && synth.addEventListener) synth.addEventListener("voiceschanged", function () { document.dispatchEvent(new CustomEvent("learn-voices")); });
  return { speak: speak, status: status, RECORDINGS: RECORDINGS };
})();
