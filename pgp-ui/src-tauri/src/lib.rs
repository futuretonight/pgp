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
fn start_temporary_chat() -> Result<(Vec<u8>, Vec<u8>), String> {
    match aura::start_temporary_chat() {
        Ok(identity) => Ok((identity.public_key.bytes.clone(), identity.private_key.bytes.clone())),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  aura::protect_process();
  
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      create_identity,
      encrypt_file,
      decrypt_file,
      sign_message,
      verify_message,
      start_temporary_chat
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
