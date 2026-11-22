export const host = {
  id: 1,
  quiet: false,
  full: () => null,
  setFull() {},
  closeAll() {},
  hookHls() {},
  seenHls: () => [],
  audio: () => null,
  audioState: () => "none",
  neighbors: () => ({ count: 1, prev: false, next: false }),
  go() {},
  choice: () => null,
  setChoice() {},
};

export function setHost(h) {
  Object.assign(host, h);
}

export function blocked() {
  const f = host.full();
  return f !== null && f !== host.id;
}
