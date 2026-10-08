use std::path::PathBuf;

#[tauri::command]
fn create_identity(passphrase: &str, user_id: &str, algo: String) -> Result<(Vec<u8>, Vec<u8>), String> {
    match aura::create_identity(passphrase, user_id, &algo) {
        Ok(identity) => Ok((identity.public_key.bytes.clone(), identity.private_key.bytes.clone())),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn encrypt_file(in_path: String, out_path: String, pub_key_bytes: Vec<u8>) -> Result<(), String> {
    let pk = aura::PublicKey { bytes: pub_key_bytes };
    match aura::encrypt_file(&PathBuf::from(in_path), &PathBuf::from(out_path), &[pk]) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn decrypt_file(in_path: String, out_path: String, priv_key_bytes: Vec<u8>, passphrase: &str) -> Result<(), String> {
    let sk = aura::PrivateKey { bytes: priv_key_bytes };
    match aura::decrypt_file(&PathBuf::from(in_path), &PathBuf::from(out_path), &sk, passphrase) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn sign_message(message: Vec<u8>, priv_key_bytes: Vec<u8>, passphrase: &str) -> Result<Vec<u8>, String> {
    let sk = aura::PrivateKey { bytes: priv_key_bytes };
    match aura::sign_message(&message, &sk, passphrase) {
        Ok(sig) => Ok(sig),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn verify_message(message: Vec<u8>, signature: Vec<u8>, pub_key_bytes: Vec<u8>) -> Result<bool, String> {
    let pk = aura::PublicKey { bytes: pub_key_bytes };
    match aura::verify_message(&message, &signature, &pk) {
        Ok(valid) => Ok(valid),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn encrypt_message(message: Vec<u8>, pub_key_bytes: Vec<u8>) -> Result<Vec<u8>, String> {
    let pk = aura::PublicKey { bytes: pub_key_bytes };
    match aura::encrypt_message(&message, &[pk]) {
        Ok(ciphertext) => Ok(ciphertext),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn decrypt_message(ciphertext: Vec<u8>, priv_key_bytes: Vec<u8>, passphrase: &str) -> Result<Vec<u8>, String> {
    let sk = aura::PrivateKey { bytes: priv_key_bytes };
    match aura::decrypt_message(&ciphertext, &sk, passphrase) {
        Ok(plaintext) => Ok(plaintext),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn start_temporary_chat() -> Result<(Vec<u8>, Vec<u8>), String> {
    match aura::start_temporary_chat() {
        Ok(identity) => Ok((identity.public_key.bytes.clone(), identity.private_key.bytes.clone())),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn save_vault(pub_key_bytes: Vec<u8>, priv_key_bytes: Vec<u8>, passphrase: &str, path: String) -> Result<(), String> {
    let identity = aura::Identity {
        public_key: aura::PublicKey { bytes: pub_key_bytes },
        private_key: aura::PrivateKey { bytes: priv_key_bytes },
    };
    match aura::save_identity_to_vault(&identity, passphrase, &PathBuf::from(path)) {
        Ok(_) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn load_vault(passphrase: &str, path: String) -> Result<(Vec<u8>, Vec<u8>), String> {
    match aura::load_identity_from_vault(passphrase, &PathBuf::from(path)) {
        Ok(identity) => Ok((identity.public_key.bytes.clone(), identity.private_key.bytes.clone())),
        Err(e) => Err(e.to_string()),
    }
}

use std::sync::Arc;
use tokio::sync::Mutex;
use aura::mesh_engine::TorMeshNode;
use std::time::{Duration, Instant};

struct AppState {
    tor_node: Mutex<Option<Arc<TorMeshNode>>>,
    // Serializes start_tor_node so remounting the chat view never starts a second node.
    tor_start: Mutex<()>,
    // (last fetched, ping ms, relay+bridge count) from the Tor metrics API
    metrics: Mutex<(Instant, u32, u32)>,
}

#[tauri::command]
async fn start_tor_node(
    use_bridges: bool,
    bridge_lines: Vec<String>,
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use tauri::Emitter;
    let _starting = state.tor_start.lock().await;

    // One Tor node per app run: a second client would fight over Arti's state
    // directory and onion-service key. Bridge changes apply after a restart.
    if let Some(node) = state.tor_node.lock().await.as_ref() {
        return node
            .get_onion_address()
            .await
            .ok_or_else(|| "Tor node is running but has no onion address".to_string());
    }

    let node = TorMeshNode::new(use_bridges, bridge_lines).await.map_err(|e| e.to_string())?;
    node.start_hidden_service().await.map_err(|e| e.to_string())?;
    
    let addr = node.get_onion_address().await.unwrap_or_else(|| "hermes_error.onion".to_string());
    
    if let Some(mut rx) = node.take_receiver().await {
        tauri::async_runtime::spawn(async move {
            while let Some(payload) = rx.recv().await {
                // Emit the raw binary payload to the frontend.
                // The frontend will decrypt it with its private key.
                let _ = app_handle.emit("mesh-message-received", payload);
            }
        });
    }
    
    // Save to state
    let mut lock = state.tor_node.lock().await;
    *lock = Some(Arc::new(node));
    
    Ok(addr)
}

#[tauri::command]
async fn connect_peer(target_onion: String, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let lock = state.tor_node.lock().await;
    if let Some(node) = lock.as_ref() {
        node.connect_peer(&target_onion).await.map_err(|e| e.to_string())
    } else {
        Err("Tor node is not initialized. Please wait for bootstrapping.".into())
    }
}

#[tauri::command]
async fn send_mesh_message(target_onion: String, payload: Vec<u8>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let lock = state.tor_node.lock().await;
    if let Some(node) = lock.as_ref() {
        node.send_direct_message(&target_onion, &payload).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Tor node is not initialized. Please wait for bootstrapping.".into())
    }
}

#[derive(serde::Serialize)]
struct TelemetryData {
    status: String,
    nodes: u32,
    ping: u32,
}

/// Round-trip time to the Tor metrics API and the number of public relays + bridges.
async fn fetch_real_metrics() -> Result<(u32, u32), reqwest::Error> {
    let start = Instant::now();
    let resp = reqwest::get("https://onionoo.torproject.org/summary?limit=1").await?;
    let ping = start.elapsed().as_millis() as u32;

    let json: serde_json::Value = resp.json().await?;
    let mut nodes = 0;
    if let Some(relays) = json.get("relays_truncated").and_then(|v| v.as_u64()) {
        nodes = relays as u32 + 1; // +1 for the one relay we fetched
    }
    if let Some(bridges) = json.get("bridges_truncated").and_then(|v| v.as_u64()) {
        nodes += bridges as u32;
    }
    Ok((ping, nodes))
}

#[tauri::command]
async fn get_telemetry(state: tauri::State<'_, AppState>) -> Result<TelemetryData, String> {
    let (ping, nodes) = {
        let mut metrics = state.metrics.lock().await;
        // Refresh at most once a minute (or until the first successful fetch).
        if metrics.0.elapsed() > Duration::from_secs(60) || metrics.2 == 0 {
            if let Ok((p, n)) = fetch_real_metrics().await {
                *metrics = (Instant::now(), p, n);
            }
        }
        (metrics.1, metrics.2)
    };

    let status = if state.tor_node.lock().await.is_some() {
        "Connected (Hidden Service)"
    } else {
        "Bootstrapping..."
    };
    Ok(TelemetryData { status: status.to_string(), nodes, ping })
}

/// Hide (or show) the window while the node keeps routing in the background.
/// On macOS, clicking the Dock icon brings a hidden window back (see `run`).
#[tauri::command]
fn toggle_headless(app_handle: tauri::AppHandle, hide: bool) -> Result<(), String> {
    use tauri::Manager;
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

/// Fetch Tor Project's default bridges from the Moat API. `transport` keeps only lines of
/// that type (matched on the line's transport token, so "meek" also matches "meek_lite").
#[tauri::command]
async fn request_bridges(transport: Option<String>) -> Result<String, String> {
    let resp = reqwest::Client::new()
        .post("https://bridges.torproject.org/moat/circumvention/defaults")
        .header("Content-Type", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let mut all_bridges = Vec::new();
    for setting in json.get("settings").and_then(|v| v.as_array()).into_iter().flatten() {
        let Some(bridges) = setting.get("bridges") else { continue };
        for s in bridges.get("bridge_strings").and_then(|v| v.as_array()).into_iter().flatten() {
            let Some(line) = s.as_str() else { continue };
            if let Some(t) = transport.as_deref() {
                let token = line.split_whitespace().next().unwrap_or("");
                if token != t && !token.starts_with(&format!("{t}_")) {
                    continue;
                }
            }
            all_bridges.push(line.to_string());
        }
    }

    if all_bridges.is_empty() {
        return Err("No bridges returned from the Tor Project bridge service".into());
    }
    all_bridges.sort();
    all_bridges.dedup();
    Ok(all_bridges.join("\n"))
}

/// Placeholder: the volunteer Snowflake proxy (helping censored users reach Tor) is not
/// implemented in the engine yet. The setting is stored by the UI; this is a no-op.
#[tauri::command]
fn set_snowflake_proxy(_enabled: bool) -> Result<(), String> {
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  aura::protect_process();
  
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::new().build())
    .setup(|app| {
        use tauri::Manager;
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
        }
        Ok(())
    })
    .manage(AppState {
        tor_node: Mutex::new(None),
        tor_start: Mutex::new(()),
        metrics: Mutex::new((Instant::now(), 0, 0)),
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
      request_bridges,
      set_snowflake_proxy
    ])
    .build(tauri::generate_context!())
    .expect("error while running tauri application")
    .run(|_app, _event| {
      // A window hidden by "Run Node" comes back when the Dock icon is clicked.
      #[cfg(target_os = "macos")]
      if let tauri::RunEvent::Reopen { .. } = _event {
        use tauri::Manager;
        if let Some(window) = _app.get_webview_window("main") {
          let _ = window.show();
          let _ = window.set_focus();
        }
      }
    });
}
