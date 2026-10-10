use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use aura::mesh_engine::{builtin_bridges, BootstrapError, NodeDirs, TorMeshNode, TorStatus};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Mutex;

/// Run crypto and file work off the main thread so the window stays responsive
/// (RSA-4096 key generation or Argon2 alone can take seconds on a slow laptop).
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> anyhow::Result<T> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("{e:#}"))
}

/// Expand a leading `~`, and resolve a relative path against `base`.
fn resolve_path(path: &str, base: &Path, app: &AppHandle) -> Result<PathBuf, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("No file path given".into());
    }
    if let Some(rest) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        let home = app.path().home_dir().map_err(|e| e.to_string())?;
        return Ok(home.join(rest));
    }
    let p = PathBuf::from(path);
    Ok(if p.is_absolute() { p } else { base.join(p) })
}

/// Relative vault paths live in the app's data directory: the working directory of an installed
/// app is `/` or Program Files, neither of which is writable.
fn vault_path(path: &str, app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    resolve_path(path, &dir, app)
}

/// Relative file paths are taken from the user's home directory.
fn user_path(path: &str, app: &AppHandle) -> Result<PathBuf, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    resolve_path(path, &home, app)
}

#[tauri::command]
async fn create_identity(passphrase: String, user_id: String, algo: String) -> Result<(Vec<u8>, Vec<u8>), String> {
    blocking(move || {
        let identity = aura::create_identity(&passphrase, &user_id, &algo)?;
        Ok((identity.public_key.bytes.clone(), identity.private_key.bytes.clone()))
    })
    .await
}

#[tauri::command]
async fn encrypt_file(in_path: String, out_path: String, pub_key_bytes: Vec<u8>, app: AppHandle) -> Result<String, String> {
    let (input, output) = (user_path(&in_path, &app)?, user_path(&out_path, &app)?);
    blocking(move || {
        aura::encrypt_file(&input, &output, &[aura::PublicKey { bytes: pub_key_bytes }])?;
        Ok(output.display().to_string())
    })
    .await
}

#[tauri::command]
async fn decrypt_file(in_path: String, out_path: String, priv_key_bytes: Vec<u8>, passphrase: String, app: AppHandle) -> Result<String, String> {
    let (input, output) = (user_path(&in_path, &app)?, user_path(&out_path, &app)?);
    blocking(move || {
        aura::decrypt_file(&input, &output, &aura::PrivateKey { bytes: priv_key_bytes }, &passphrase)?;
        Ok(output.display().to_string())
    })
    .await
}

#[tauri::command]
async fn sign_message(message: Vec<u8>, priv_key_bytes: Vec<u8>, passphrase: String) -> Result<Vec<u8>, String> {
    blocking(move || aura::sign_message(&message, &aura::PrivateKey { bytes: priv_key_bytes }, &passphrase)).await
}

#[tauri::command]
async fn verify_message(message: Vec<u8>, signature: Vec<u8>, pub_key_bytes: Vec<u8>) -> Result<bool, String> {
    blocking(move || aura::verify_message(&message, &signature, &aura::PublicKey { bytes: pub_key_bytes })).await
}

#[tauri::command]
async fn encrypt_message(message: Vec<u8>, pub_key_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    blocking(move || aura::encrypt_message(&message, &[aura::PublicKey { bytes: pub_key_bytes }])).await
}

#[tauri::command]
async fn decrypt_message(ciphertext: Vec<u8>, priv_key_bytes: Vec<u8>, passphrase: String) -> Result<Vec<u8>, String> {
    blocking(move || aura::decrypt_message(&ciphertext, &aura::PrivateKey { bytes: priv_key_bytes }, &passphrase)).await
}

#[tauri::command]
async fn start_temporary_chat() -> Result<(Vec<u8>, Vec<u8>), String> {
    blocking(|| {
        let identity = aura::start_temporary_chat()?;
        Ok((identity.public_key.bytes.clone(), identity.private_key.bytes.clone()))
    })
    .await
}

/// Encrypts the identity into a vault file and returns where it was written.
#[tauri::command]
async fn save_vault(pub_key_bytes: Vec<u8>, priv_key_bytes: Vec<u8>, passphrase: String, path: String, app: AppHandle) -> Result<String, String> {
    let path = vault_path(&path, &app)?;
    blocking(move || {
        let identity = aura::Identity {
            public_key: aura::PublicKey { bytes: pub_key_bytes },
            private_key: aura::PrivateKey { bytes: priv_key_bytes },
        };
        aura::save_identity_to_vault(&identity, &passphrase, &path)?;
        Ok(path.display().to_string())
    })
    .await
}

/// Returns (public key, private key, the vault file that was read).
#[tauri::command]
async fn load_vault(passphrase: String, path: String, app: AppHandle) -> Result<(Vec<u8>, Vec<u8>, String), String> {
    let mut resolved = vault_path(&path, &app)?;
    // Earlier versions resolved relative vault paths against the working directory.
    let legacy = PathBuf::from(path.trim());
    if !resolved.exists() && legacy.is_relative() && legacy.is_file() {
        resolved = legacy;
    }
    blocking(move || {
        let identity = aura::load_identity_from_vault(&passphrase, &resolved)?;
        Ok((identity.public_key.bytes.clone(), identity.private_key.bytes.clone(), resolved.display().to_string()))
    })
    .await
}

struct AppState {
    tor_node: Mutex<Option<Arc<TorMeshNode>>>,
    // Serializes start_tor_node so a second call never starts a second node.
    tor_start: Mutex<()>,
    // Direct connections were blocked this run, so the node moved to built-in Snowflake bridges.
    snowflake_fallback: AtomicBool,
}

/// Give up on a direct connection after this long without bootstrap progress.
const DIRECT_STALL: Duration = Duration::from_secs(45);
/// Bridges (Snowflake especially) are slower to get going, so allow them longer.
const BRIDGE_STALL: Duration = Duration::from_secs(150);

/// A line for the System Logs view.
fn tor_log(app: &AppHandle, level: &str, message: impl Into<String>) {
    let _ = app.emit("tor-log", serde_json::json!({ "level": level, "message": message.into() }));
}

/// Report each new reason Arti gives for being stuck (offline, filtered, clock skew...).
fn blockage_reporter(app: &AppHandle) -> impl FnMut(&TorStatus) + '_ {
    let mut last = None;
    move |status: &TorStatus| {
        if status.blocked != last {
            if let Some(why) = &status.blocked {
                tor_log(app, "WARN", format!("Tor is stuck at {}%: {why}", status.percent));
            }
            last = status.blocked.clone();
        }
    }
}

fn not_started() -> String {
    "Tor is not running yet. Wait for it to connect, or press Retry.".into()
}

/// Start (or re-apply bridge settings to) the Tor node, wait until it can build circuits, and
/// launch our onion service. Returns our onion address.
///
/// `builtin` picks a bridge set shipped with Hermes ("obfs4" or "snowflake") instead of
/// `bridge_lines`. With `auto_fallback`, a direct connection that stalls switches to the
/// built-in Snowflake bridges, as university and national firewalls often block Tor relays.
#[tauri::command]
async fn start_tor_node(
    use_bridges: bool,
    bridge_lines: Vec<String>,
    builtin: Option<String>,
    auto_fallback: Option<bool>,
    state: tauri::State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let _starting = state.tor_start.lock().await;
    let auto_fallback = auto_fallback.unwrap_or(true);
    let snowflake = || builtin_bridges("snowflake").unwrap_or_default();

    let wanted = match (use_bridges, builtin.as_deref()) {
        (true, Some(kind)) => builtin_bridges(kind).ok_or_else(|| format!("There are no built-in {kind} bridges"))?,
        (true, None) => bridge_lines,
        // Keep using the fallback once direct connections have proven blocked.
        (false, _) if auto_fallback && state.snowflake_fallback.load(Ordering::SeqCst) => snowflake(),
        (false, _) => Vec::new(),
    };

    let existing = state.tor_node.lock().await.clone();
    let node = match existing {
        Some(node) => {
            if node.set_bridges(&wanted).await.map_err(|e| format!("{e:#}"))? {
                tor_log(&app, "INFO", format!("Applied new connection settings: now via {}", node.status().via));
            }
            node
        }
        None => {
            let data_dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
            let dirs = NodeDirs { pt_state: data_dir.join("pt_state"), arti: None };
            let node = Arc::new(TorMeshNode::new(&wanted, dirs).await.map_err(|e| format!("{e:#}"))?);
            if let Some(mut rx) = node.take_receiver() {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    while let Some(payload) = rx.recv().await {
                        // Still encrypted: the frontend decrypts it with its private key.
                        let _ = app.emit("mesh-message-received", payload);
                    }
                });
            }
            *state.tor_node.lock().await = Some(node.clone());
            node
        }
    };

    if !node.is_bootstrapped() {
        tor_log(&app, "INFO", format!("Connecting to Tor via {}: downloading the network consensus", node.status().via));
    }
    let stall = if wanted.is_empty() { DIRECT_STALL } else { BRIDGE_STALL };
    match node.bootstrap(stall, blockage_reporter(&app)).await {
        Ok(()) => {}
        Err(BootstrapError::Stalled(why)) if wanted.is_empty() && auto_fallback => {
            tor_log(&app, "WARN", format!("Direct connection to Tor looks blocked ({why}). Switching to built-in Snowflake bridges."));
            node.set_bridges(&snowflake()).await.map_err(|e| format!("Snowflake fallback failed: {e:#}"))?;
            state.snowflake_fallback.store(true, Ordering::SeqCst);
            node.bootstrap(BRIDGE_STALL, blockage_reporter(&app)).await.map_err(|e| e.to_string())?;
        }
        Err(e) => return Err(e.to_string()),
    }

    let status = node.status();
    let relays = status.relays.map(|n| format!("{n} relays")).unwrap_or_else(|| "relays".into());
    tor_log(&app, "SUCCESS", format!("Tor connected via {}: consensus downloaded, {relays} available", status.via));

    let addr = node.start_hidden_service().await.map_err(|e| format!("{e:#}"))?;
    Ok(addr)
}

/// The node, if it has finished connecting to Tor.
async fn ready_node(state: &AppState) -> Result<Arc<TorMeshNode>, String> {
    // Clone the handle so the lock isn't held while we wait on the network.
    let node = state.tor_node.lock().await.clone().ok_or_else(not_started)?;
    if !node.is_bootstrapped() {
        return Err("Tor is still connecting. Try again once the status shows Online.".into());
    }
    Ok(node)
}

#[tauri::command]
async fn connect_peer(target_onion: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let node = ready_node(&state).await?;
    node.connect_peer(&target_onion).await.map_err(|e| format!("{e:#}"))
}

#[tauri::command]
async fn send_mesh_message(target_onion: String, payload: Vec<u8>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let node = ready_node(&state).await?;
    node.send_direct_message(&target_onion, &payload).await.map_err(|e| format!("{e:#}"))
}

/// Live state of the Tor node, or null if it has not been started.
#[tauri::command]
async fn get_telemetry(state: tauri::State<'_, AppState>) -> Result<Option<TorStatus>, String> {
    let node = state.tor_node.lock().await.clone();
    Ok(node.map(|n| n.status()))
}

/// Hide (or show) the window while the node keeps routing in the background.
/// On macOS, clicking the Dock icon brings a hidden window back (see `run`).
#[tauri::command]
fn toggle_headless(app_handle: AppHandle, hide: bool) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        if hide {
            window.minimize().map_err(|e| e.to_string())?;
        } else {
            window.unminimize().map_err(|e| e.to_string())?;
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Fetch bridges from Tor Project's Moat API. `transport` keeps only lines of that type and
/// `source` only that origin ("builtin", or "bridgedb" for the less widely known ones).
#[tauri::command]
async fn request_bridges(transport: Option<String>, source: Option<String>) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post("https://bridges.torproject.org/moat/circumvention/defaults")
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| format!("Could not reach bridges.torproject.org ({e}). It may be blocked on this network; use the built-in bridges instead."))?;
    if !resp.status().is_success() {
        return Err(format!("bridges.torproject.org answered HTTP {}", resp.status()));
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let mut all_bridges = Vec::new();
    for setting in json.get("settings").and_then(|v| v.as_array()).into_iter().flatten() {
        let Some(bridges) = setting.get("bridges") else { continue };
        if let Some(want) = source.as_deref() {
            if bridges.get("source").and_then(|v| v.as_str()) != Some(want) {
                continue;
            }
        }
        for s in bridges.get("bridge_strings").and_then(|v| v.as_array()).into_iter().flatten() {
            let Some(line) = s.as_str() else { continue };
            if let Some(t) = transport.as_deref() {
                if line.split_whitespace().next() != Some(t) {
                    continue;
                }
            }
            all_bridges.push(line.to_string());
        }
    }

    if all_bridges.is_empty() {
        return Err("bridges.torproject.org returned no matching bridges. Try the built-in bridges.".into());
    }
    all_bridges.sort();
    all_bridges.dedup();
    Ok(all_bridges.join("\n"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Exits when a debugger is attached (Windows); skipped in dev builds so they can be debugged.
  if !cfg!(debug_assertions) {
    aura::protect_process();
  }

  tauri::Builder::default()
    // The plugin defaults to TRACE for every crate, which floods the console and log file with
    // network internals; Info is enough to diagnose problems.
    .plugin(
      tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
        .build(),
    )
    .setup(|app| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        Ok(())
    })
    .manage(AppState {
        tor_node: Mutex::new(None),
        tor_start: Mutex::new(()),
        snowflake_fallback: AtomicBool::new(false),
    })
    .invoke_handler(tauri::generate_handler![
      create_identity,
      encrypt_file,
      decrypt_file,
      sign_message,
      verify_message,
      encrypt_message,
      decrypt_message,
      start_temporary_chat,
      save_vault,
      load_vault,
      start_tor_node,
      connect_peer,
      send_mesh_message,
      get_telemetry,
      toggle_headless,
      request_bridges
    ])
    .build(tauri::generate_context!())
    .expect("error while running tauri application")
    .run(|_app, _event| {
      // A window hidden by "Run Node" comes back when the Dock icon is clicked.
      #[cfg(target_os = "macos")]
      if let tauri::RunEvent::Reopen { .. } = _event {
        if let Some(window) = _app.get_webview_window("main") {
          let _ = window.show();
          let _ = window.set_focus();
        }
      }
    });
}
