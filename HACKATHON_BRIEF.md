# Project Aura: Core Cryptographic Engine

> **Hackathon Objective:** We are not building just another chat app. We are building the hardest, most critical component of secure communication: a reusable, mathematically rigorous cryptographic engine in Rust.

## The Problem
Implementing secure communication (End-to-End Encryption, Perfect Forward Secrecy, Identity Verification) from scratch is notoriously difficult and prone to catastrophic errors. Developers need a plug-and-play engine that handles the deep cryptography safely, so they can focus on building user interfaces.

## Our Hackathon Deliverable: The Aura Engine
For this hackathon, we built the **Aura Engine**: a bare-metal, memory-safe Rust library that handles the complete cryptographic lifecycle of a secure conversation. 

To prove it works, we attached a lightweight Demo UI (React/Tauri) that consumes the engine's APIs.

### The 4 Core Capabilities of the Engine:

1. **Identity Generation (`Identity`)**
   The engine generates cryptographically secure identities (OpenPGP / Ed25519) containing a Public Key, Private Key, and a unique Fingerprint. No more "Trust me, I'm Bob."
   
2. **Identity Verification (`Authentication`)**
   Before a session begins, the engine allows peers to compare and verify cryptographic fingerprints, establishing a verified Web-of-Trust.

3. **Session Establishment (`Handshake`)**
   The engine uses ephemeral **X25519 (ECDH)** keys to negotiate a temporary, shared session secret. Because the keys are ephemeral, this guarantees **Perfect Forward Secrecy (PFS)**—even if a master identity key is compromised years later, past traffic remains undecryptable.

4. **Authenticated Message Encryption (`AEAD`)**
   Using the established session key, the engine encrypts payloads using **ChaCha20-Poly1305** (with strict nonce management). The UI never touches the cryptography; it simply calls `aura.encrypt("hello")` and routes the cipherbytes over the network.

---

## Architecture Flow
```text
AURA ENGINE (Rust)
       │
 ┌─────┼──────────────────────────────────┐
 │     ↓                                  │
 │  Identity (Ed25519 / OpenPGP)          │
 │     ↓                                  │
 │  Handshake (Ephemeral X25519 ECDH)     │
 │     ↓                                  │
 │  Encryption (ChaCha20-Poly1305 AEAD)   │
 └─────┼──────────────────────────────────┘
       ↓
 DEMO CLIENT (React / Tauri)
       │
       ↓
 "Secure Chat Interface"
```

## Future Roadmap (Post-Hackathon)
With the core cryptographic engine finalized, the platform can easily scale into a full ecosystem:
- [ ] **Full Tauri Desktop Client** (Expanding the demo UI)
- [ ] **File Encryption & Secure Notes** (Vault mechanics)
- [ ] **P2P / Relay Networking** (NAT traversal)
- [ ] **Post-Quantum Cryptography (PQC)** (Hybridizing the X25519 handshake with NIST's Kyber KEM)
- [ ] **KDBX v4 Local Storage** (Secure, local-first keystores)
