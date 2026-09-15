// Phase 31 (deployment hardening): this was previously an inline <script>
// in index.html. Extracted into its own file, with no change to what it
// does, so the editor can run under a strict Content-Security-Policy with
// no script-src exception at all (no 'unsafe-inline', no hash, no nonce)
// -- every script the page loads is an ordinary same-origin <script src>.
window.CALLIGRAPHY_ASSET_BASE = '../assets/';
