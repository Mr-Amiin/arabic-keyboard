/* Worker entry point. Keep this file minimal: the main module of a Worker may only export handlers.
   All logic lives in ./core.js (which the tests import directly). See the header comment there. */
import { handle } from "./core.js";

export default {
  fetch(request, env, ctx) { return handle(request, env, ctx); }
};
