import type { PersistedState } from "./types";

function fallbackUuid(): string {
  let out = "";
  for (let i = 0; i < 36; i += 1) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      out += "-";
      continue;
    }

    if (i === 14) {
      out += "4";
      continue;
    }

    const value = Math.random() * 16 | 0;
    out += (i === 19 ? (value & 0x3) | 0x8 : value).toString(16);
  }
  return out;
}

export function createUuid(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : fallbackUuid();
}

export function ensureUserId(state: PersistedState): {
  userId: string;
  isNew: boolean;
  state: PersistedState;
} {
  if (state.userId) {
    return { userId: state.userId, isNew: false, state };
  }

  const userId = createUuid();
  return {
    userId,
    isNew: true,
    state: { ...state, userId },
  };
}
