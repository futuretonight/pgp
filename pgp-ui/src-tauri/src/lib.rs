use std::path::PathBuf;

#[tauri::command]
fn create_identity(passphrase: &str, user_id: &str) -> Result<(Vec<u8>, Vec<u8>), String> {
    match aura::create_identity(passphrase, user_id) {
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

struct AppState {
    tor_node: Mutex<Option<Arc<TorMeshNode>>>,
}

#[tauri::command]
async fn start_tor_node(state: tauri::State<'_, AppState>, app_handle: tauri::AppHandle) -> Result<String, String> {
    use tauri::Emitter;
    let node = TorMeshNode::new().await.map_err(|e| e.to_string())?;
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
async fn send_mesh_message(target_onion: String, payload: Vec<u8>, state: tauri::State<'_, AppState>) -> Result<(), String> {
    let lock = state.tor_node.lock().await;
    if let Some(node) = lock.as_ref() {
        node.send_direct_message(&target_onion, &payload).await.map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Tor node is not initialized. Please wait for bootstrapping.".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  aura::protect_process();
  
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::new().build())
    .manage(AppState {
        tor_node: Mutex::new(None),
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
      send_mesh_message
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
