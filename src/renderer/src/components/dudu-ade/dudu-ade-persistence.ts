// Renderer localStorage lives under this app's own userData, so it never touches the official Orca profile.
export function readPersistedJson<T>(key: string, fallback: T, isValid: (value: unknown) => boolean): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return fallback
    }
    const parsed: unknown = JSON.parse(raw)
    return isValid(parsed) ? (parsed as T) : fallback
  } catch {
    return fallback
  }
}

const pendingWrites = new Map<string, ReturnType<typeof setTimeout>>()

export function writePersistedJsonSoon(key: string, value: unknown, delayMs = 300): void {
  const pending = pendingWrites.get(key)
  if (pending) {
    clearTimeout(pending)
  }
  pendingWrites.set(
    key,
    setTimeout(() => {
      pendingWrites.delete(key)
      try {
        window.localStorage.setItem(key, JSON.stringify(value))
      } catch {}
    }, delayMs)
  )
}
