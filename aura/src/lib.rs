use anyhow::Result;
use sequoia_openpgp::cert::prelude::*;
use sequoia_openpgp::crypto::Password;
use sequoia_openpgp::serialize::SerializeInto;
use std::path::Path;
use zeroize::{Zeroize, ZeroizeOnDrop};

pub mod mesh_engine;

pub struct PublicKey {
    pub bytes: Vec<u8>,
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct PrivateKey {
    pub bytes: Vec<u8>,
}

use rand::RngCore;

/// Stores data masked with a random XOR pad to prevent plain RAM dumping.
/// Upon dropping, both mask and data are zeroized.
#[derive(Zeroize, ZeroizeOnDrop)]
pub struct MaskedMemory {
    mask: Vec<u8>,
    masked_data: Vec<u8>,
}

impl MaskedMemory {
    pub fn new(data: &[u8]) -> Self {
        let mut rng = rand::thread_rng();
        let mut mask = vec![0u8; data.len()];
        rng.fill_bytes(&mut mask);
        
        let mut masked_data = Vec::with_capacity(data.len());
        for (i, &b) in data.iter().enumerate() {
            masked_data.push(b ^ mask[i]);
        }
        
        Self { mask, masked_data }
    }

    pub fn unmask(&self) -> Vec<u8> {
        let mut unmasked = Vec::with_capacity(self.masked_data.len());
        for (i, &b) in self.masked_data.iter().enumerate() {
            unmasked.push(b ^ self.mask[i]);
        }
        unmasked
    }
}

/// Protects the application from being run inside a debugger.
/// Exits immediately if a debugger is detected.
#[cfg(target_os = "windows")]
pub fn protect_process() {
    use windows_sys::Win32::System::Diagnostics::Debug::{
        CheckRemoteDebuggerPresent, IsDebuggerPresent,
    };
    use windows_sys::Win32::System::Threading::GetCurrentProcess;
    
    unsafe {
        if IsDebuggerPresent() != 0 {
            std::process::exit(1);
        }
        let mut is_debugger_present = 0;
        let proc = GetCurrentProcess();
        if CheckRemoteDebuggerPresent(proc, &mut is_debugger_present) != 0 && is_debugger_present != 0 {
            std::process::exit(1);
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn protect_process() {
    // Stub for non-Windows platforms
}

#[derive(Zeroize, ZeroizeOnDrop)]
pub struct Identity {
    #[zeroize(skip)]
    pub public_key: PublicKey,
    pub private_key: PrivateKey,
}

/// Creates a new OpenPGP identity (Ed25519/X25519)
/// Returns a new Identity struct containing the private and public keys.
pub fn create_identity(passphrase: &str, user_id: &str) -> Result<Identity> {
    let password = Password::from(passphrase);
    
    let (cert, _) = CertBuilder::new()
        .add_userid(user_id)
        .add_signing_subkey()
        .add_transport_encryption_subkey()
        .set_password(Some(password))
        .generate()?;

    let private_bytes = cert.as_tsk().to_vec()?;
    let public_bytes = cert.to_vec()?;

    Ok(Identity {
        public_key: PublicKey { bytes: public_bytes },
        private_key: PrivateKey { bytes: private_bytes },
    })
}

/// Encrypts a file at `in_path`, writes ciphertext to `out_path` using given recipients' public keys.
pub fn encrypt_file(in_path: &Path, out_path: &Path, recipients_pubkeys: &[PublicKey]) -> Result<()> {
    use sequoia_openpgp::serialize::stream::{Message, Encryptor, LiteralWriter};
    use sequoia_openpgp::cert::Cert;
    use sequoia_openpgp::parse::Parse;
    use sequoia_openpgp::policy::StandardPolicy;
    use std::fs::File;

    let p = &StandardPolicy::new();
    let mut certs = Vec::new();
    for pk in recipients_pubkeys {
        certs.push(Cert::from_bytes(&pk.bytes)?);
    }

    let mut sink = File::create(out_path)?;
    let message = Message::new(&mut sink);

    let mut recipients = Vec::new();
    for cert in &certs {
        for ka in cert.keys().with_policy(p, None).supported().for_transport_encryption() {
            recipients.push(ka.clone());
        }
    }

    let message = Encryptor::for_recipients(message, recipients).build()?;
    let mut writer = LiteralWriter::new(message).build()?;
    let mut in_file = File::open(in_path)?;
    std::io::copy(&mut in_file, &mut writer)?;
    writer.finalize()?;

    Ok(())
}

struct DecryptHelper {
    keypair: sequoia_openpgp::crypto::KeyPair,
}

impl sequoia_openpgp::parse::stream::DecryptionHelper for DecryptHelper {
    fn decrypt(
        &mut self,
        pkesks: &[sequoia_openpgp::packet::PKESK],
        _skesks: &[sequoia_openpgp::packet::SKESK],
        sym_algo: Option<sequoia_openpgp::types::SymmetricAlgorithm>,
        decrypt: &mut dyn FnMut(Option<sequoia_openpgp::types::SymmetricAlgorithm>, &sequoia_openpgp::crypto::SessionKey) -> bool,
    ) -> sequoia_openpgp::Result<Option<sequoia_openpgp::cert::Cert>> {
        for pkesk in pkesks {
            if let Some((algo, session_key)) = pkesk.decrypt(&mut self.keypair, sym_algo) {
                decrypt(algo, &session_key);
                return Ok(None);
            }
        }
        anyhow::bail!("Failed to decrypt")
    }
}

impl sequoia_openpgp::parse::stream::VerificationHelper for DecryptHelper {
    fn get_certs(&mut self, _ids: &[sequoia_openpgp::KeyHandle]) -> sequoia_openpgp::Result<Vec<sequoia_openpgp::cert::Cert>> {
        Ok(Vec::new()) // Signature verification ignored for simple decryption
    }

    fn check(&mut self, _structure: sequoia_openpgp::parse::stream::MessageStructure) -> sequoia_openpgp::Result<()> {
        Ok(())
    }
}

/// Encrypts an in-memory message using given recipients' public keys.
pub fn encrypt_message(payload: &[u8], recipients_pubkeys: &[PublicKey]) -> Result<Vec<u8>> {
    use sequoia_openpgp::serialize::stream::{Message, Encryptor, LiteralWriter};
    use sequoia_openpgp::cert::Cert;
    use sequoia_openpgp::parse::Parse;
    use sequoia_openpgp::policy::StandardPolicy;

    let p = &StandardPolicy::new();
    let mut certs = Vec::new();
    for pk in recipients_pubkeys {
        certs.push(Cert::from_bytes(&pk.bytes)?);
    }

    let mut sink = Vec::new();
    let message = Message::new(&mut sink);

    let mut recipients = Vec::new();
    for cert in &certs {
        for ka in cert.keys().with_policy(p, None).supported().for_transport_encryption() {
            recipients.push(ka.clone());
        }
    }

    let message = Encryptor::for_recipients(message, recipients).build()?;
    let mut writer = LiteralWriter::new(message).build()?;
    std::io::copy(&mut std::io::Cursor::new(payload), &mut writer)?;
    writer.finalize()?;

    Ok(sink)
}

/// Decrypts an in-memory message using a private key.
pub fn decrypt_message(payload: &[u8], private_key: &PrivateKey, passphrase: &str) -> Result<Vec<u8>> {
    use sequoia_openpgp::parse::stream::DecryptorBuilder;
    use sequoia_openpgp::cert::Cert;
    use sequoia_openpgp::parse::Parse;
    use sequoia_openpgp::policy::StandardPolicy;
    use sequoia_openpgp::crypto::Password;

    let p = &StandardPolicy::new();
    let cert = Cert::from_bytes(&private_key.bytes)?;

    let mut keypair = None;
    for ka in cert.keys().with_policy(p, None).secret().supported().for_transport_encryption() {
        let mut key = ka.key().clone();
        if key.secret().is_encrypted() {
            let key_ref = key.clone();
            key.secret_mut().decrypt_in_place(&key_ref, &Password::from(passphrase)).map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;
        }
        if let Ok(kp) = key.into_keypair() {
            keypair = Some(kp);
            break;
        }
    }

    let keypair = keypair.ok_or_else(|| anyhow::anyhow!("No suitable decryption key found"))?;
    let helper = DecryptHelper { keypair };

    let mut decryptor = DecryptorBuilder::from_bytes(payload)?.with_policy(p, None, helper)?;

    let mut out_sink = Vec::new();
    std::io::copy(&mut decryptor, &mut out_sink)?;

    Ok(out_sink)
}

/// Decrypts a file at `in_path` using a private key, writes plaintext to `out_path`.
pub fn decrypt_file(in_path: &Path, out_path: &Path, private_key: &PrivateKey, passphrase: &str) -> Result<()> {
    use sequoia_openpgp::parse::stream::DecryptorBuilder;
    use sequoia_openpgp::cert::Cert;
    use sequoia_openpgp::parse::Parse;
    use sequoia_openpgp::policy::StandardPolicy;
    use sequoia_openpgp::crypto::Password;
    use std::fs::File;

    let p = &StandardPolicy::new();
    let cert = Cert::from_bytes(&private_key.bytes)?;

    let mut keypair = None;
    for ka in cert.keys().with_policy(p, None).secret().supported().for_transport_encryption() {
        let mut key = ka.key().clone();
        if key.secret().is_encrypted() {
            let key_ref = key.clone();
            key.secret_mut().decrypt_in_place(&key_ref, &Password::from(passphrase)).map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;
        }
        if let Ok(kp) = key.into_keypair() {
            keypair = Some(kp);
            break;
        }
    }

    let keypair = keypair.ok_or_else(|| anyhow::anyhow!("No suitable decryption key found"))?;
    let helper = DecryptHelper { keypair };

    let in_file = File::open(in_path)?;
    let mut decryptor = DecryptorBuilder::from_reader(in_file)?.with_policy(p, None, helper)?;

    let mut out_file = File::create(out_path)?;
    std::io::copy(&mut decryptor, &mut out_file)?;

    Ok(())
}


/// Signs a message (or file) with a private key. Returns signature bytes.
pub fn sign_message(message: &[u8], private_key: &PrivateKey, passphrase: &str) -> Result<Vec<u8>> {
    use sequoia_openpgp::serialize::stream::{Message, Signer};
    use sequoia_openpgp::cert::Cert;
    use sequoia_openpgp::parse::Parse;
    use sequoia_openpgp::policy::StandardPolicy;
    use sequoia_openpgp::crypto::Password;
    use std::io::Write;

    let p = &StandardPolicy::new();
    let cert = Cert::from_bytes(&private_key.bytes)?;

    let mut keypair = None;
    for ka in cert.keys().with_policy(p, None).secret().supported().for_signing() {
        let mut key = ka.key().clone();
        if key.secret().is_encrypted() {
            let key_ref = key.clone();
            key.secret_mut().decrypt_in_place(&key_ref, &Password::from(passphrase)).map_err(|e| anyhow::anyhow!("Signing decryption failed: {}", e))?;
        }
        if let Ok(kp) = key.into_keypair() {
            keypair = Some(kp);
            break;
        }
    }
    let keypair = keypair.ok_or_else(|| anyhow::anyhow!("No suitable signing key found"))?;

    let mut sink = Vec::new();
    {
        let msg = Message::new(&mut sink);
        let mut signer = Signer::new(msg, keypair)?.detached().build()?;
        signer.write_all(message)?;
        signer.finalize()?;
    }

    Ok(sink)
}

struct VerifyHelper {
    cert: sequoia_openpgp::cert::Cert,
}

impl sequoia_openpgp::parse::stream::VerificationHelper for VerifyHelper {
    fn get_certs(&mut self, _ids: &[sequoia_openpgp::KeyHandle]) -> sequoia_openpgp::Result<Vec<sequoia_openpgp::cert::Cert>> {
        Ok(vec![self.cert.clone()])
    }

    fn check(&mut self, structure: sequoia_openpgp::parse::stream::MessageStructure) -> sequoia_openpgp::Result<()> {
        let mut valid = false;
        for layer in structure.into_iter() {
            if let sequoia_openpgp::parse::stream::MessageLayer::SignatureGroup { results } = layer {
                if results.into_iter().any(|r| r.is_ok()) {
                    valid = true;
                }
            }
        }
        if valid {
            Ok(())
        } else {
            anyhow::bail!("Signature verification failed")
        }
    }
}

/// Verifies `message` + `signature` with a public key. Returns true if valid.
pub fn verify_message(message: &[u8], signature: &[u8], public_key: &PublicKey) -> Result<bool> {
    use sequoia_openpgp::parse::stream::DetachedVerifierBuilder;
    use sequoia_openpgp::cert::Cert;
    use sequoia_openpgp::parse::Parse;
    use sequoia_openpgp::policy::StandardPolicy;

    let p = &StandardPolicy::new();
    let cert = Cert::from_bytes(&public_key.bytes)?;
    let helper = VerifyHelper { cert };

    let mut verifier = DetachedVerifierBuilder::from_bytes(signature)?
        .with_policy(p, None, helper)?;
    verifier.verify_bytes(message)?;

    Ok(true)
}


/// Starts a temporary chat session: generates ephemeral keys, returns an Identity.
pub fn start_temporary_chat() -> Result<Identity> {
    use sequoia_openpgp::cert::prelude::CertBuilder;

    let (cert, _) = CertBuilder::new()
        .add_userid("ephemeral@aura.local")
        .add_signing_subkey()
        .add_transport_encryption_subkey()
        .generate()?;

    let private_bytes = cert.as_tsk().to_vec()?;
    let public_bytes = cert.to_vec()?;

    Ok(Identity {
        public_key: PublicKey { bytes: public_bytes },
        private_key: PrivateKey { bytes: private_bytes },
    })
}

/// Initializes or unlocks the in-memory KDBX vault (using keepass-rs).
pub fn unlock_vault(kdbx_bytes: &[u8], passphrase: &str) -> Result<()> {
    use keepass::{Database, DatabaseKey};
    use std::io::Cursor;

    let key = DatabaseKey::new().with_password(passphrase);
    let mut cursor = Cursor::new(kdbx_bytes);
    
    // Parses and decrypts the KDBX file, validating its integrity and ChaCha20/Argon2 params.
    let _db = Database::open(&mut cursor, key)?;
    
    Ok(())
}

use argon2::Argon2;
use chacha20poly1305::{
    aead::{Aead, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use rand::Rng;

pub fn save_identity_to_vault(identity: &Identity, passphrase: &str, path: &Path) -> Result<()> {
    // 1. Serialize the identity
    let mut data = Vec::new();
    data.extend_from_slice(&(identity.public_key.bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(&identity.public_key.bytes);
    data.extend_from_slice(&(identity.private_key.bytes.len() as u32).to_le_bytes());
    data.extend_from_slice(&identity.private_key.bytes);

    // 2. Derive key using Argon2
    let mut salt_bytes = [0u8; 16];
    rand::thread_rng().fill(&mut salt_bytes);
    
    let mut key_bytes = [0u8; 32];
    Argon2::default().hash_password_into(passphrase.as_bytes(), &salt_bytes, &mut key_bytes)
        .map_err(|e| anyhow::anyhow!(e.to_string()))?;

    // 3. Encrypt with XChaCha20Poly1305
    let cipher = XChaCha20Poly1305::new(&key_bytes.into());
    let mut nonce_bytes = [0u8; 24];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = XNonce::from(nonce_bytes);

    let ciphertext = cipher.encrypt(&nonce, data.as_ref()).map_err(|e| anyhow::anyhow!(e.to_string()))?;

    // 4. Save to file (Salt + Nonce + Ciphertext)
    let mut out_file = std::fs::File::create(path)?;
    use std::io::Write;
    out_file.write_all(&salt_bytes)?;
    out_file.write_all(&nonce_bytes)?;
    out_file.write_all(&ciphertext)?;

    Ok(())
}

pub fn load_identity_from_vault(passphrase: &str, path: &Path) -> Result<Identity> {
    use std::io::Read;
    let mut in_file = std::fs::File::open(path)?;
    
    let mut salt_bytes = [0u8; 16];
    in_file.read_exact(&mut salt_bytes)?;

    let mut nonce_bytes = [0u8; 24];
    in_file.read_exact(&mut nonce_bytes)?;

    let mut ciphertext = Vec::new();
    in_file.read_to_end(&mut ciphertext)?;

    // Derive key using Argon2
    let mut key_bytes = [0u8; 32];
    Argon2::default().hash_password_into(passphrase.as_bytes(), &salt_bytes, &mut key_bytes)
        .map_err(|e| anyhow::anyhow!(e.to_string()))?;

    // Decrypt
    let cipher = XChaCha20Poly1305::new(&key_bytes.into());
    let nonce = XNonce::from(nonce_bytes);
    let plaintext = cipher.decrypt(&nonce, ciphertext.as_ref()).map_err(|_| anyhow::anyhow!("Invalid passphrase or corrupt vault"))?;

    // Parse identity
    if plaintext.len() < 8 { anyhow::bail!("Corrupt vault data"); }
    let pub_len = u32::from_le_bytes([plaintext[0], plaintext[1], plaintext[2], plaintext[3]]) as usize;
    if plaintext.len() < 4 + pub_len + 4 { anyhow::bail!("Corrupt vault data"); }
    let pub_bytes = plaintext[4..4+pub_len].to_vec();
    
    let priv_len_start = 4 + pub_len;
    let priv_len = u32::from_le_bytes([plaintext[priv_len_start], plaintext[priv_len_start+1], plaintext[priv_len_start+2], plaintext[priv_len_start+3]]) as usize;
    if plaintext.len() < priv_len_start + 4 + priv_len { anyhow::bail!("Corrupt vault data"); }
    let priv_bytes = plaintext[priv_len_start+4 .. priv_len_start+4+priv_len].to_vec();

    Ok(Identity {
        public_key: PublicKey { bytes: pub_bytes },
        private_key: PrivateKey { bytes: priv_bytes },
    })
}

