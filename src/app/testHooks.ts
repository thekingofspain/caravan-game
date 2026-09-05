let cached: boolean | null = null;

export function testHooksEnabled(): boolean {
    if (cached !== null) return cached;

    cached =
        typeof window === "undefined"
            ? false
            : import.meta.env.DEV || new URLSearchParams(window.location.search).has("e2e");

    return cached;
}
