# Task Progress: Full Tor Mesh Migration

## 1. Setup Script
- [x] Create `setup.py`
- [x] Update `setup_and_run.bat`
- [x] Update `setup_and_run.sh`

## 2. UI Updates (Removing WebRTC)
- [x] Uninstall `peerjs` dependency.
- [x] Remove WebRTC logic from `SecureChat.jsx`.
- [x] Update `SecureChat.jsx` to reflect Tor bootstrapping states.
- [x] Update `App.jsx` telemetry to read from real Tor states rather than mocked WebRTC states.

## 3. Clipboard Media Sending
- [x] Add `onPaste` listener in `SecureChat.jsx`.
- [x] Convert images to Base64 and trigger PGP signing via Tauri IPC before sending.

## 4. Pure Tor + libp2p Mesh Architecture (Backend)
- [x] Add Arti dependencies to `aura/Cargo.toml`.
- [x] Scaffold `mesh_engine.rs` and initialize `TorClient`.
- [x] Expose `start_tor_node` Tauri command.
- [x] Wire up real Arti Tor Hidden Service creation (or complete scaffolding).
- [x] Integrate direct Tor TCP Streams over Arti client.
- [x] Implement Tauri event emission for incoming P2P messages.
- [x] Implement `send_mesh_message` Tauri command.

---
**Current Status**: Complete! The Tor mesh architecture is fully wired up using direct TCP streams over the Arti client, replacing the unsafe WebRTC implementation.
