// Minimal undo/redo command stack.
//
// This exists starting Phase 1 (even though nothing is undoable yet)
// so every later phase — add text, move, rotate, recolor, draw, delete,
// layer changes, background changes — pushes through the SAME mechanism
// instead of each feature inventing its own undo logic.
//
// A command is: { do(), undo(), label }. do() is called once when the
// command is first executed (pushCommand runs it for you); undo()/redo()
// are then driven by the stacks below.

const undoStack = [];
const redoStack = [];
const listeners = new Set();

function notify() {
  const state = {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
  listeners.forEach((fn) => fn(state));
}

export function onHistoryChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function pushCommand(command) {
  command.do();
  undoStack.push(command);
  redoStack.length = 0;
  notify();
}

export function undo() {
  const command = undoStack.pop();
  if (!command) return false;
  command.undo();
  redoStack.push(command);
  notify();
  return true;
}

export function redo() {
  const command = redoStack.pop();
  if (!command) return false;
  command.do();
  undoStack.push(command);
  notify();
  return true;
}

export function historyState() {
  return { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
}

// Used by New/Open (project-controller.js): a freshly loaded project
// starts with a clean slate — you should never be able to Ctrl+Z back
// into the project you just left, or into a blank canvas before you
// opened this one.
export function resetHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  notify();
}
