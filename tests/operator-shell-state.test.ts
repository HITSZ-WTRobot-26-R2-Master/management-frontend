import { describe, expect, test } from "bun:test"
import { createStore } from "jotai"

const authTokenStorageKey = "r2-management.auth-token"

function createMemoryStorage(initialValues: Record<string, string> = {}) {
  const values = new Map(Object.entries(initialValues))

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
  } satisfies Storage
}

function installWebStorage({
  local,
  session,
}: {
  local: Storage
  session: Storage
}) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: local,
  })
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: session,
  })
}

describe("operator shell persisted state", () => {
  test("persists the API token in localStorage", async () => {
    const local = createMemoryStorage({
      [authTokenStorageKey]: JSON.stringify("saved-token"),
    })
    const session = createMemoryStorage()

    installWebStorage({ local, session })

    const { authTokenAtom, clearAuthTokenAtom } = await import(
      "../src/state/operator-shell"
    )
    const store = createStore()

    expect(store.get(authTokenAtom)).toBe("saved-token")
    expect(session.getItem(authTokenStorageKey)).toBeNull()

    store.set(authTokenAtom, "next-token")

    expect(local.getItem(authTokenStorageKey)).toBe(
      JSON.stringify("next-token"),
    )
    expect(session.getItem(authTokenStorageKey)).toBeNull()

    store.set(clearAuthTokenAtom)

    expect(local.getItem(authTokenStorageKey)).toBe(JSON.stringify(""))
    expect(session.getItem(authTokenStorageKey)).toBeNull()
  })
})
