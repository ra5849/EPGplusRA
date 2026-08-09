// Estado global ligero (pub/sub) y "tick" periódico para refrescar la hora.

export function createStore(initial = {}) {
  let state = { ...initial };
  const listeners = new Set();
  return {
    /** Lectura amigable: state.get() o state.get('view'). */
    get(key) {
      return key === undefined ? state : state[key];
    },
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Ejecuta fn cada intervalo; devuelve stop(). */
export function tick(fn, ms = 30_000) {
  const id = setInterval(fn, ms);
  return () => clearInterval(id);
}