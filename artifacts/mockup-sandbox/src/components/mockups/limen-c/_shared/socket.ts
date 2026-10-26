import { demoState } from "./fixtures";
const socket = {
  connected: true,
  on(..._args: unknown[]) { return socket; },
  off(..._args: unknown[]) { return socket; },
  emit(event: string, _data: unknown, callback?: (value: any) => void) {
    if (event === "session:join") callback?.({ ok: true, role: "host", state: demoState });
    return socket;
  },
};
export function getSocket() { return socket; }
