/* Learn Arabic — pronunciation playback.
   1) RECORDED audio: add VERIFIED files to RECORDINGS ({ "letter-ba": "/assets/audio/ba.mp3" }); they play first. None exist today,
      so nothing in the UI claims recordings.
   2) Otherwise the browser's speech synthesis (a DEVICE-GENERATED voice, not a native recording). The voice in use is named in the UI.
   Events are published on `document` as "learn-audio" (start / end / error) and "learn-voices" (voice list changed). */
window.LearnAudio = (function () {
  "use strict";
  const RECORDINGS = {};
  const synth = ("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) ? window.speechSynthesis : null;
  const PREF_KEY = "ak-learn-speech", RATES = { normal: 0.9, slow: 0.6 }, START_TIMEOUT_MS = 4000;
  let speed = "normal";
  try { const v = window.localStorage.getItem(PREF_KEY); if (v === "slow" || v === "normal") speed = v; } catch (e) { /* storage unavailable: keep the default */ }

  // ar-SA first: its voices are the closest to Modern Standard Arabic. Regional voices (ar-EG, ar-AE, ...) are used only when nothing
  // better exists, and the UI names the voice so learners know what they are hearing.
  function rank(v) {
    const l = String(v.lang || "").toLowerCase().replace("_", "-");
    if (l === "ar-sa") return 0; if (l === "ar") return 1; if (/^ar-/.test(l)) return 2; return 99;
  }
  function voices() {
    if (!synth) return [];
    return (synth.getVoices() || []).filter(v => rank(v) < 99).sort((a, b) => rank(a) - rank(b) || (b.localService ? 1 : 0) - (a.localService ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
  }
  function status() {
    if (!synth) return { supported: false, hasVoice: false, voice: null, msg: "This browser cannot play speech, so there is no audio here. Use the transliteration and a dictionary or teacher for pronunciation." };
    const v = voices()[0];
    if (!v) return { supported: true, hasVoice: false, voice: null, msg: "No Arabic voice was found on this device, so audio may be silent or sound wrong. Install an Arabic voice in your system settings." };
    return { supported: true, hasVoice: true, voice: { name: v.name, lang: v.lang }, msg: "Device voice: " + v.name + " (" + v.lang + "). This is device-generated speech, not a native recording, so it only approximates pronunciation." };
  }
  function errorMessage(code) {
    switch (code) {
      case "not-allowed": return "The browser blocked audio. Press Hear again.";
      case "no-start": return "The device voice did not start. Your device may not have a working Arabic voice.";
      case "unsupported": return "This browser cannot play speech.";
      case "language-unavailable": case "voice-unavailable": return "Your device has no Arabic voice for speech. Install one in your system settings.";
      default: return "Speech could not be played (" + (code || "unknown error") + ").";
    }
  }
  function emit(detail) { try { document.dispatchEvent(new CustomEvent("learn-audio", { detail: detail })); } catch (e) { /* ignore */ } }

  function speakSynth(text) {
    if (!synth || !text) { emit({ type: "error", error: "unsupported", message: errorMessage("unsupported") }); return false; }
    const v = voices()[0], u = new SpeechSynthesisUtterance(text);
    u.lang = v ? v.lang : "ar-SA"; if (v) u.voice = v; u.rate = RATES[speed];
    let started = false;
    const timer = setTimeout(function () { if (!started) { try { synth.cancel(); } catch (e) { /* ignore */ } emit({ type: "error", error: "no-start", message: errorMessage("no-start") }); } }, START_TIMEOUT_MS);
    u.onstart = function () { started = true; clearTimeout(timer); emit({ type: "start", source: "device", voice: v ? v.name : null, rate: u.rate }); };
    u.onend = function () { clearTimeout(timer); emit({ type: "end" }); };
    u.onerror = function (e) { clearTimeout(timer); const c = e && e.error; if (c === "canceled" || c === "interrupted") return; emit({ type: "error", error: c || "unknown", message: errorMessage(c) }); };
    try { synth.cancel(); synth.speak(u); } catch (err) { clearTimeout(timer); emit({ type: "error", error: "exception", message: errorMessage("exception") }); return false; }
    return true;
  }
  function speak(text, key) {
    if (key && RECORDINGS[key]) {
      try { const a = new Audio(RECORDINGS[key]); a.onerror = function () { speakSynth(text); }; const p = a.play(); if (p && p.catch) p.catch(function () { speakSynth(text); }); emit({ type: "start", source: "recording" }); return true; } catch (e) { /* fall through to speech */ }
    }
    return speakSynth(text);
  }
  function setSpeed(s) { if (s !== "slow" && s !== "normal") return speed; speed = s; try { window.localStorage.setItem(PREF_KEY, s); } catch (e) { /* ignore */ } return speed; }
  if (synth) { try { synth.getVoices(); } catch (e) { /* ignore */ } if (synth.addEventListener) synth.addEventListener("voiceschanged", function () { document.dispatchEvent(new CustomEvent("learn-voices")); }); }
  return { speak: speak, status: status, voices: voices, errorMessage: errorMessage, RECORDINGS: RECORDINGS, hasRecording: function (k) { return !!RECORDINGS[k]; },
    getSpeed: function () { return speed; }, setSpeed: setSpeed, toggleSpeed: function () { return setSpeed(speed === "slow" ? "normal" : "slow"); }, RATES: RATES };
})();
