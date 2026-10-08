// Persisted user settings (Settings tab). Keys match the ones used on main so
// existing choices carry over. Storage can be unavailable, so every access is
// guarded and falls back to the default.
export const PREF_KEYS = {
  algo: 'hermes_algo',                 // 'ecc' | 'rsa' | 'nist'
  cipher: 'hermes_cipher',             // 'aes' | 'xchacha'
  v3Only: 'hermes_v3',                 // 'true' | 'false'
  useBridges: 'hermes_use_bridges',    // 'true' | 'false'
  bridgeType: 'hermes_bridge_type',    // 'obfs4' | 'snowflake' | 'meek'
  bridgeSource: 'hermes_bridge_source',// 'builtin' | 'request' | 'provide'
  bridgeString: 'hermes_bridge_string',// user-provided bridge lines
  requestedBridges: 'hermes_requested_bridges', // lines fetched via "Request a New Bridge"
  volunteer: 'hermes_volunteer',       // 'true' | 'false'
};

export function readPref(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writePref(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* not persisted */ }
}

export const splitBridgeLines = (text) =>
  (text || '').split('\n').map(l => l.trim()).filter(Boolean);
