# Project Hermes & The Aura Cryptographic Engine
## Comprehensive Architectural Documentation

---

## 1. Executive Summary
This project is a privacy-first, decentralized secure communication platform consisting of two main components:
1. **The Aura Engine**: A bare-metal, memory-safe cryptographic library written in Rust. It acts as the mathematical backbone of the system, handling all identity generation, encryption, decryption, and signature verification.
2. **Hermes (UI)**: A React/Vite frontend wrapped in Tauri. It acts as a "dumb terminal," containing no complex cryptographic logic itself, delegating all secure operations to the Aura Engine via strict IPC (Inter-Process Communication).

The fundamental philosophy of this project is **Hybrid Cryptography**: using heavy Asymmetric cryptography (OpenPGP/Ed25519) strictly for Identity and Authentication, while utilizing lightning-fast Symmetric cryptography (XChaCha20-Poly1305 / AES-256-GCM) for data payload encryption.

---

## 2. Aura Engine (Rust Core) Deep Dive

The Aura Engine is designed to be highly reusable and network-agnostic. It does not care *how* data is transmitted (Tor, WebRTC, TCP); it only cares about mathematically proving *who* sent it and ensuring nobody else can read it.

### 2.1 Cryptographic Identity (OpenPGP)
At the heart of the engine is the `Identity` struct, powered by `sequoia-openpgp`. 
- **Generation**: The engine generates Ed25519 (Elliptic Curve) master keypairs.
- **Subkeys**: It automatically derives dedicated subkeys for *Signing* and *Transport Encryption*.
- **Ephemeral Sessions**: The engine supports generating temporary `ephemeral@aura.local` identities for highly sensitive, temporary sessions (a stepping stone toward Perfect Forward Secrecy).

### 2.2 Memory Armor & Anti-Reversing
Because malware or malicious browser extensions often scrape RAM for private keys, the Aura Engine employs kernel-level and memory-level defenses:
- **`MaskedMemory`**: Private keys are never stored in raw plaintext in RAM. The engine generates a random XOR mask, applies it to the data, and stores the masked data. The data is only unmasked for the microsecond it is needed by the CPU.
- **`Zeroize`**: All sensitive structs implement the `ZeroizeOnDrop` trait. The moment a cryptographic operation finishes, Rust overwrites the memory sectors with zeros before releasing it back to the OS.
- **Anti-Debugger API Hooks**: On Windows compiles, the engine hooks into `CheckRemoteDebuggerPresent` and `IsDebuggerPresent`. If an analyst or malware attempts to attach a debugger to scrape memory, the engine immediately self-terminates (`std::process::exit(1)`).

### 2.3 Zero-Knowledge Vault Persistence
Identities are persisted to the hard drive locally, ensuring no central server ever holds the user's keys.
1. **Key Derivation (Argon2)**: When a user saves their vault, their Master Passphrase is combined with a randomly generated cryptographic Salt and processed through the Argon2 hashing algorithm to derive a secure 32-byte encryption key.
2. **Encryption (XChaCha20-Poly1305)**: The raw OpenPGP key bytes are then encrypted using XChaCha20-Poly1305 (an AEAD cipher with an extended 24-byte nonce to prevent collision).
3. **Binary Storage**: The engine writes a custom `.kdbx` / `.vault` binary file containing: `[Salt Length][Salt][XNonce][Ciphertext]`. 
This guarantees that even if a local hard drive is physically stolen, the keys are mathematically impossible to extract without the Argon2 parameters and the Master Passphrase.

### 2.4 Cryptographic Message Authentication
Before a message is sent over any network, it must pass through the engine's signing mechanism.
- The UI passes the plaintext string to Rust.
- Rust uses the Ed25519 signing subkey to generate a detached cryptographic signature.
- The receiving peer passes the signature and plaintext back into their Rust engine.
- `sequoia-openpgp` verifies the cryptographic proof against the sender's known Public Key. If a single bit is altered in transit, the signature fails validation.

### 2.5 File Encryption System
The engine supports physical file encryption via the `encrypt_file` and `decrypt_file` APIs. It streams files directly from the OS, encrypting them via standard OpenPGP symmetric wrapping, and outputs `.gpg` encrypted binaries without buffering the entire file into RAM.

---

## 3. Frontend Integration & UI Security (Hermes)

The UI is built with React and Vite, utilizing a dark "cyber-terminal" aesthetic.

### 3.1 The Tauri IPC Bridge
The frontend and backend are completely sandboxed from each other. React communicates with Rust via asynchronous `#[tauri::command]` hooks. This ensures that a compromised JavaScript thread cannot execute arbitrary code; it can only request specific cryptographic operations (e.g., `invoke('sign_message')`).

### 3.2 DOM-Scraping Prevention (Canvas Framebuffer)
To display the private key visually without exposing it to DOM-scraping XSS attacks or malicious browser extensions (like Grammarly or Honey):
- The frontend utilizes a custom `<SecureFramebufferText>` React component.
- The private key text is never rendered inside an HTML `<div>` or `<p>` tag.
- Instead, the component grabs an HTML5 `<canvas>` context and uses the browser's `requestAnimationFrame` loop (running at ~60fps) to rapidly paint the characters as raw pixels. 
- To the user, it looks like normal text. To a malicious script analyzing `document.body.innerHTML`, the text simply does not exist.

---

## 4. Network Agnosticism (Preparation for Next Phase)

By design, the Aura Engine **does not care** how data is transmitted. It operates purely as a "filter"—plaintext goes in, encrypted/signed cipher-bytes come out. 

Currently, the UI implements a lightweight **PeerJS (WebRTC)** data channel for basic P2P testing, which successfully bypasses central servers by utilizing WebRTC NAT traversal. 

However, because the engine is completely decoupled from the transport layer, the network implementation can be seamlessly swapped or upgraded. Whether the packets are routed through Tor Hidden Services (.onion), an overarching libp2p DHT, or a custom relay architecture, the cryptographic guarantees of the Aura Engine remain absolute.

***(Note: Awaiting your network implementation proposal for the next phase.)***
