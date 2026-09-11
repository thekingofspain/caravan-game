// Shared e2e diagnostics: single-line labels with truncated payloads so CI
// failures stay readable. Full output via E2E_VERBOSE=1.
const MAX_INFO_CHARS = 1500;

export function logInfo(label, value) {
  const text = typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? String(value));
  if (process.env.E2E_VERBOSE === "1") {
    console.log(label, text);
    return;
  }
  if (text.length > MAX_INFO_CHARS) {
    console.log(
      `${label} ${text.slice(0, MAX_INFO_CHARS)}…[truncated ${text.length - MAX_INFO_CHARS} chars, rerun with E2E_VERBOSE=1 for full]`
    );
    return;
  }
  console.log(label, text);
}
