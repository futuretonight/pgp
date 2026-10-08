use anyhow::Result;
use arti_client::config::pt::TransportConfigBuilder;
use arti_client::config::{BridgeConfigBuilder, CfgPath, PtTransportName};
use arti_client::{TorClient, TorClientConfig};
use futures::StreamExt;
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;
use tokio::sync::mpsc;
use tor_rtcompat::PreferredRuntime;

pub struct TorMeshNode {
    pub client: Arc<TorClient<PreferredRuntime>>,
    onion_address: Mutex<Option<String>>,
    // Keeps the onion service alive; dropping it would take the service down.
    onion_service: Mutex<Option<Arc<tor_hsservice::RunningOnionService>>>,
    // Channel for pushing incoming messages to Tauri
    incoming_tx: mpsc::Sender<Vec<u8>>,
    incoming_rx: Mutex<Option<mpsc::Receiver<Vec<u8>>>>,
}

/// Directories searched for pluggable-transport binaries, in priority order.
/// Hermes ships `lyrebird` (obfs4, meek_lite, webtunnel, snowflake) as a Tauri sidecar, which the
/// bundler places next to the app executable. Release builds use only that copy, so nothing on the
/// user's PATH can stand in for it; debug builds also look where Tor Browser or Homebrew put one.
fn pt_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(exe_dir) = std::env::current_exe().ok().and_then(|p| p.parent().map(PathBuf::from)) {
        dirs.push(exe_dir);
    }
    if cfg!(debug_assertions) {
        const TOR_BROWSER_PT: &str = "Tor Browser.app/Contents/MacOS/Tor/PluggableTransports";
        dirs.push(PathBuf::from("/Applications").join(TOR_BROWSER_PT));
        if let Some(home) = std::env::var_os("HOME") {
            dirs.push(PathBuf::from(home).join("Applications").join(TOR_BROWSER_PT));
        }
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
        if let Some(path) = std::env::var_os("PATH") {
            dirs.extend(std::env::split_paths(&path));
        }
    }
    dirs
}

fn find_binary(names: &[&str]) -> Option<PathBuf> {
    for dir in pt_search_dirs() {
        for name in names {
            let candidate = dir.join(format!("{name}{}", std::env::consts::EXE_SUFFIX));
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Pick the binary that provides a pluggable-transport protocol. The bundled lyrebird covers
/// them all; the other names are only found by debug builds' wider search.
fn pt_binary_for(protocol: &str) -> Result<PathBuf> {
    let names: &[&str] = match protocol {
        "snowflake" => &["lyrebird", "snowflake-client"],
        "obfs4" | "meek_lite" | "webtunnel" | "obfs3" | "scramblesuit" => &["lyrebird", "obfs4proxy"],
        _ => anyhow::bail!("Bridges of type '{protocol}' are not supported."),
    };
    find_binary(names).ok_or_else(|| {
        if cfg!(debug_assertions) {
            anyhow::anyhow!(
                "Bridges of type '{protocol}' need the lyrebird transport. Run `npm run sidecars` \
                 in pgp-ui, then restart `npm run tauri dev`."
            )
        } else {
            anyhow::anyhow!(
                "Bridges of type '{protocol}' need the lyrebird transport that ships with Hermes, \
                 but it is missing from the install. Reinstall Hermes."
            )
        }
    })
}

/// The transport named by a bridge line, or `None` for a plain (direct) bridge.
/// Lines look like `obfs4 1.2.3.4:443 FINGERPRINT cert=...` or `1.2.3.4:443 FINGERPRINT`.
fn bridge_transport(line: &str) -> Option<&str> {
    let first = line.split_whitespace().next()?;
    if first.contains(':') || first.contains('.') || first.starts_with('[') {
        None
    } else {
        Some(first)
    }
}

impl TorMeshNode {
    /// Bootstraps the Tor circuit, optionally through bridges.
    pub async fn new(use_bridges: bool, bridge_lines: Vec<String>) -> Result<Self> {
        let mut builder = TorClientConfig::builder();

        if use_bridges {
            let lines: Vec<String> = bridge_lines
                .iter()
                .map(|l| l.trim().trim_start_matches("Bridge ").trim().to_string())
                .filter(|l| !l.is_empty())
                .collect();
            if lines.is_empty() {
                anyhow::bail!("Bridges are enabled but no bridge lines were provided.");
            }

            let mut bridges = Vec::new();
            let mut parse_errors = Vec::new();
            for line in &lines {
                match line.parse::<BridgeConfigBuilder>() {
                    Ok(bridge) => bridges.push(bridge),
                    Err(e) => parse_errors.push(e.to_string()),
                }
            }
            if bridges.is_empty() {
                anyhow::bail!("None of the bridge lines are valid: {}", parse_errors.join("; "));
            }

            // Every transport used by a bridge needs a binary that speaks it.
            // Group protocols by binary so each binary is launched once.
            let mut by_binary: BTreeMap<PathBuf, Vec<String>> = BTreeMap::new();
            for line in &lines {
                if let Some(protocol) = bridge_transport(line) {
                    let binary = pt_binary_for(protocol)?;
                    let protocols = by_binary.entry(binary).or_default();
                    if !protocols.iter().any(|p| p == protocol) {
                        protocols.push(protocol.to_string());
                    }
                }
            }

            builder.bridges().set_bridges(bridges);
            for (binary, protocols) in by_binary {
                let names = protocols
                    .iter()
                    .map(|p| p.parse::<PtTransportName>())
                    .collect::<std::result::Result<Vec<_>, _>>()?;
                let mut transport = TransportConfigBuilder::default();
                transport.protocols(names).path(CfgPath::new_literal(binary)).run_on_startup(true);
                builder.bridges().transports().push(transport);
            }
        }

        let config = builder.build()?;
        let client = TorClient::create_bootstrapped(config).await?;

        let (tx, rx) = mpsc::channel(100);

        Ok(Self {
            client,
            onion_address: Mutex::new(None),
            onion_service: Mutex::new(None),
            incoming_tx: tx,
            incoming_rx: Mutex::new(Some(rx)),
        })
    }

    /// Retrieve the Onion Address
    pub async fn get_onion_address(&self) -> Option<String> {
        let lock = self.onion_address.lock().await;
        lock.clone()
    }

    /// Launch our onion service and listen for incoming connections.
    /// The service key is kept in Arti's keystore, so the address is stable across restarts.
    pub async fn start_hidden_service(&self) -> Result<()> {
        use safelog::DisplayRedacted;
        use tor_hsservice::config::OnionServiceConfigBuilder;

        let nickname = "hermes".to_string().try_into()?;
        let svc_config = OnionServiceConfigBuilder::default()
            .nickname(nickname)
            .build()
            .map_err(|e| anyhow::anyhow!("Onion service config failed: {e}"))?;

        let (onion_svc, mut rend_requests) = self
            .client
            .launch_onion_service(svc_config)
            .map_err(|e| anyhow::anyhow!("Onion service launch failed: {e}"))?
            .ok_or_else(|| anyhow::anyhow!("Onion service is disabled in the Tor config"))?;

        let onion_id = onion_svc
            .onion_address()
            .ok_or_else(|| anyhow::anyhow!("No onion address was generated"))?;
        // HsId's Debug/Display output is redacted by safelog; peers need the real address.
        *self.onion_address.lock().await = Some(onion_id.display_unredacted().to_string());
        *self.onion_service.lock().await = Some(onion_svc);

        let tx = self.incoming_tx.clone();

        // Each rendezvous request carries streams; each stream is one framed message:
        // a 4-byte little-endian length followed by the payload.
        tokio::spawn(async move {
            while let Some(rend_request) = rend_requests.next().await {
                let tx = tx.clone();
                tokio::spawn(async move {
                    let Ok(mut stream_requests) = rend_request.accept().await else { return };
                    while let Some(stream_request) = stream_requests.next().await {
                        let tx = tx.clone();
                        tokio::spawn(async move {
                            let connected = tor_cell::relaycell::msg::Connected::new_empty();
                            let Ok(mut stream) = stream_request.accept(connected).await else { return };
                            let mut len_buf = [0u8; 4];
                            if stream.read_exact(&mut len_buf).await.is_err() {
                                return;
                            }
                            let len = u32::from_le_bytes(len_buf) as usize;
                            if len >= 10 * 1024 * 1024 {
                                return; // max 10MB payload
                            }
                            let mut payload = vec![0u8; len];
                            if stream.read_exact(&mut payload).await.is_ok() {
                                let _ = tx.send(payload).await;
                            }
                        });
                    }
                });
            }
        });

        Ok(())
    }

    /// Check that a peer's onion service is reachable by opening (and closing) a stream to it.
    pub async fn connect_peer(&self, target_onion: &str) -> Result<()> {
        let _stream = self.client.connect((target_onion, 80)).await?;
        Ok(())
    }

    /// Sends a direct message over the Tor circuit to a remote Onion Service
    pub async fn send_direct_message(&self, target_onion: &str, payload: &[u8]) -> Result<()> {
        // We connect to the target hidden service on port 80 (standard Tor port)
        let addr = (target_onion, 80);

        // Use the embedded Arti client to build a circuit and connect
        let mut stream = self.client.connect(addr).await?;

        // Write the payload length first (simple protocol framing)
        let len = payload.len() as u32;
        stream.write_all(&len.to_le_bytes()).await?;

        // Write the payload
        stream.write_all(payload).await?;
        stream.flush().await?;

        Ok(())
    }

    /// Take the receiver so it can be passed to Tauri's event loop
    pub async fn take_receiver(&self) -> Option<mpsc::Receiver<Vec<u8>>> {
        let mut lock = self.incoming_rx.lock().await;
        lock.take()
    }
}
