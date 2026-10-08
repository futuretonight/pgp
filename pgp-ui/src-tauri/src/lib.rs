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
use std::time::Instant;

struct AppState {
    tor_node: Mutex<Option<Arc<TorMeshNode>>>,
    start_time: Instant,
    metrics: Mutex<(Instant, u32, u32)>,
}

#[tauri::command]
async fn start_tor_node(
    use_bridges: bool, 
    bridge_lines: Vec<String>, 
    state: tauri::State<'_, AppState>, 
    app_handle: tauri::AppHandle
) -> Result<String, String> {
    use tauri::Emitter;
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
        let addr = (target_onion.as_str(), 80);
        let _stream = node.client.connect(addr).await.map_err(|e| e.to_string())?;
        Ok(())
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
    uptime: u64,
    status: String,
    nodes: u32,
    ping: u32,
}

async fn fetch_real_metrics() -> Result<(u32, u32), reqwest::Error> {
    let start = std::time::Instant::now();
    let resp = reqwest::get("https://onionoo.torproject.org/summary?limit=1").await?;
    let ping = start.elapsed().as_millis() as u32;
    
    let json: serde_json::Value = resp.json().await?;
    let mut nodes = 0;
    if let Some(relays) = json.get("relays_truncated").and_then(|v| v.as_u64()) {
        nodes = relays as u32 + 1; // +1 for the 1 we fetched
    }
    if let Some(bridges) = json.get("bridges_truncated").and_then(|v| v.as_u64()) {
        nodes += bridges as u32;
    }
    
    Ok((ping, nodes))
}

#[tauri::command]
async fn get_telemetry(state: tauri::State<'_, AppState>) -> Result<TelemetryData, String> {
    let uptime = state.start_time.elapsed().as_secs();
    
    let mut ping = 0;
    let mut nodes = 0;
    
    {
        let mut metrics = state.metrics.lock().await;
        if metrics.0.elapsed().as_secs() > 60 || metrics.2 == 0 {
            if let Ok((p, n)) = fetch_real_metrics().await {
                metrics.1 = p;
                metrics.2 = n;
                metrics.0 = std::time::Instant::now();
            }
        }
        ping = metrics.1;
        nodes = metrics.2;
    }

    let lock = state.tor_node.lock().await;
    
    if let Some(_node) = lock.as_ref() {
        Ok(TelemetryData {
            uptime,
            status: "Connected (Hidden Service)".to_string(),
            nodes,
            ping,
        })
    } else {
        Ok(TelemetryData {
            uptime,
            status: "Routing...".to_string(),
            nodes,
            ping,
        })
    }
}

#[tauri::command]
fn toggle_headless(app_handle: tauri::AppHandle, hide: bool) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app_handle.get_webview_window("main") {
        if hide {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn request_bridges() -> Result<String, String> {
    let client = reqwest::Client::new();
    let resp = client.post("https://bridges.torproject.org/moat/circumvention/defaults")
        .send()
        .await
        .map_err(|e| e.to_string())?;
        
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    
    let mut all_bridges = Vec::new();
    
    if let Some(settings) = json.get("settings").and_then(|v| v.as_array()) {
        for setting in settings {
            if let Some(bridges) = setting.get("bridges") {
                if let Some(strings) = bridges.get("bridge_strings").and_then(|v| v.as_array()) {
                    for s in strings {
                        if let Some(bridge_str) = s.as_str() {
                            all_bridges.push(bridge_str.to_string());
                        }
                    }
                }
            }
        }
    }
    
    if all_bridges.is_empty() {
        return Err("No bridges returned from Moat API".into());
    }
    
    all_bridges.sort();
    all_bridges.dedup();
    Ok(all_bridges.join("\n"))
}

#[tauri::command]
fn set_snowflake_proxy(enabled: bool) -> Result<(), String> {
    // Real implementation would launch or stop the embedded snowflake-proxy daemon
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  aura::protect_process();
  
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::new().build())
    .manage(AppState {
        tor_node: Mutex::new(None),
        start_time: std::time::Instant::now(),
        metrics: Mutex::new((std::time::Instant::now() - std::time::Duration::from_secs(100), 0, 0)),
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
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
