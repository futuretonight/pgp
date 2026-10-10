// Persisted user settings (Settings tab). Keys match the ones used on main so
// existing choices carry over. Storage can be unavailable, so every access is
// guarded and falls back to the default.
export const PREF_KEYS = {
  algo: 'hermes_algo',                 // 'ecc' | 'rsa' | 'nist'
  useBridges: 'hermes_use_bridges',    // 'true' | 'false'
  bridgeType: 'hermes_bridge_type',    // 'obfs4' | 'snowflake'
  bridgeSource: 'hermes_bridge_source',// 'builtin' | 'request' | 'provide'
  bridgeString: 'hermes_bridge_string',// user-provided bridge lines
  requestedBridges: 'hermes_requested_bridges', // lines fetched via "Request a New Bridge"
  autoFallback: 'hermes_auto_fallback',// 'true' | 'false': switch to Snowflake if Tor is blocked
};

export const BUILTIN_BRIDGE_TYPES = ['obfs4', 'snowflake'];

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

// The built-in bridge type to use. Older versions offered meek, which Arti cannot use;
// Snowflake is its closest replacement (also hard for a firewall to block).
export const builtinBridgeType = () => {
  const type = readPref(PREF_KEYS.bridgeType, 'obfs4');
  return BUILTIN_BRIDGE_TYPES.includes(type) ? type : 'snowflake';
};

// Arguments for the start_tor_node command, from the bridge settings.
export function torStartOptions() {
  const useBridges = readPref(PREF_KEYS.useBridges, 'false') === 'true';
  const autoFallback = readPref(PREF_KEYS.autoFallback, 'true') !== 'false';
  const options = { useBridges, bridgeLines: [], builtin: null, autoFallback };
  if (!useBridges) return options;

  const source = readPref(PREF_KEYS.bridgeSource, 'builtin');
  if (source === 'provide') {
    options.bridgeLines = splitBridgeLines(readPref(PREF_KEYS.bridgeString, ''));
    if (!options.bridgeLines.length) throw new Error('Bridges are on but no bridge lines were provided in Settings.');
  } else if (source === 'request') {
    options.bridgeLines = splitBridgeLines(readPref(PREF_KEYS.requestedBridges, ''));
    if (!options.bridgeLines.length) throw new Error("Bridges are on but none were requested yet. Use 'Request a New Bridge' in Settings.");
  } else {
    options.builtin = builtinBridgeType();
  }
  return options;
}
