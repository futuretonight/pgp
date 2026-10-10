use anyhow::{Context, Result, anyhow, bail};
use arti_client::config::pt::TransportConfigBuilder;
use arti_client::config::{BridgeConfigBuilder, CfgPath, PtTransportName, Reconfigure};
use arti_client::{TorClient, TorClientConfig};
use futures::StreamExt;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::mpsc;
use tor_netdir::Timeliness;
use tor_rtcompat::PreferredRuntime;

/// Port peers connect to on each other's onion service.
const PEER_PORT: u16 = 80;
/// Largest message we accept from a peer.
pub const MAX_MESSAGE_BYTES: usize = 10 * 1024 * 1024;
/// How long to wait for a peer's onion service (descriptor lookup + rendezvous).
const PEER_CONNECT_TIMEOUT: Duration = Duration::from_secs(120);
/// How long an incoming stream may take to deliver its message.
const PEER_READ_TIMEOUT: Duration = Duration::from_secs(120);
/// How long lyrebird may take to report its SOCKS ports.
const PT_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(30);

/// Tor Browser's built-in bridges, copied from `tor/pluggable_transports/pt_config.json` in the
/// Tor Expert Bundle that `pgp-ui/scripts/fetch-sidecars.mjs` pins (update both together).
/// They are used when bridges.torproject.org is unreachable, which is common on the networks
/// that need bridges in the first place. Tor Browser's meek line is left out: it has no RSA
/// fingerprint, and Arti requires one.
const BUILTIN_OBFS4: &[&str] = &[
    "obfs4 37.218.245.14:38224 D9A82D2F9C2F65A18407B1D2B764F130847F8B5D cert=bjRaMrr1BRiAW8IE9U5z27fQaYgOhX1UCmOpg2pFpoMvo6ZgQMzLsaTzzQNTlm7hNcb+Sg iat-mode=0",
    "obfs4 209.148.46.65:443 74FAD13168806246602538555B5521A0383A1875 cert=ssH+9rP8dG2NLDN2XuFw63hIO/9MNNinLmxQDpVa+7kTOa9/m+tGWT1SmSYpQ9uTBGa6Hw iat-mode=0",
    "obfs4 146.57.248.225:22 10A6CD36A537FCE513A322361547444B393989F0 cert=K1gDtDAIcUfeLqbstggjIw2rtgIKqdIhUlHp82XRqNSq/mtAjp1BIC9vHKJ2FAEpGssTPw iat-mode=0",
    "obfs4 45.145.95.6:27015 C5B7CD6946FF10C5B3E89691A7D3F2C122D2117C cert=TD7PbUO0/0k6xYHMPW3vJxICfkMZNdkRrb63Zhl5j9dW3iRGiCx0A7mPhe5T2EDzQ35+Zw iat-mode=0",
    "obfs4 51.222.13.177:80 5EDAC3B810E12B01F6FD8050D2FD3E277B289A08 cert=2uplIpLQ0q9+0qMFrK5pkaYRDOe460LL9WHBvatgkuRr/SL31wBOEupaMMJ6koRE6Ld0ew iat-mode=0",
    "obfs4 212.83.43.95:443 BFE712113A72899AD685764B211FACD30FF52C31 cert=ayq0XzCwhpdysn5o0EyDUbmSOx3X/oTEbzDMvczHOdBJKlvIdHHLJGkZARtT4dcBFArPPg iat-mode=1",
    "obfs4 212.83.43.74:443 39562501228A4D5E27FCA4C0C81A01EE23AE3EE4 cert=PBwr+S8JTVZo6MPdHnkTwXJPILWADLqfMGoVvhZClMq/Urndyd42BwX9YFJHZnBB3H0XCw iat-mode=1",
];
const BUILTIN_SNOWFLAKE: &[&str] = &[
    "snowflake 192.0.2.3:80 2B280B23E1107BB62ABFC40DDCC8824814F80A72 fingerprint=2B280B23E1107BB62ABFC40DDCC8824814F80A72 url=https://1098762253.rsc.cdn77.org/ fronts=app.datapacket.com,www.datapacket.com ice=stun:stun.epygi.com:3478,stun:stun.uls.co.za:3478,stun:stun.voipgate.com:3478,stun:stun.mixvoip.com:3478,stun:stun.telnyx.com:3478,stun:stun.hot-chilli.net:3478,stun:stun.fitauto.ru:3478,stun:stun.m-online.net:3478 utls-imitate=hellorandomizedalpn",
    "snowflake 192.0.2.4:80 8838024498816A039FCBBAB14E6F40A0843051FA fingerprint=8838024498816A039FCBBAB14E6F40A0843051FA url=https://1098762253.rsc.cdn77.org/ fronts=app.datapacket.com,www.datapacket.com ice=stun:stun.epygi.com:3478,stun:stun.uls.co.za:3478,stun:stun.voipgate.com:3478,stun:stun.mixvoip.com:3478,stun:stun.telnyx.com:3478,stun:stun.hot-chilli.net:3478,stun:stun.fitauto.ru:3478,stun:stun.m-online.net:3478 utls-imitate=hellorandomizedalpn",
];

/// The bridges shipped with Hermes for `transport` ("obfs4" or "snowflake").
pub fn builtin_bridges(transport: &str) -> Option<Vec<String>> {
    let lines = match transport {
        "obfs4" => BUILTIN_OBFS4,
        "snowflake" => BUILTIN_SNOWFLAKE,
        _ => return None,
    };
    Some(lines.iter().map(|l| l.to_string()).collect())
}

/// Directories searched for the `lyrebird` pluggable-transport binary, in priority order.
/// Hermes ships lyrebird (obfs4, meek_lite, webtunnel, snowflake) as a Tauri sidecar, which the
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

fn find_lyrebird() -> Result<PathBuf> {
    let name = format!("lyrebird{}", std::env::consts::EXE_SUFFIX);
    pt_search_dirs()
        .into_iter()
        .map(|dir| dir.join(&name))
        // fetch-sidecars.mjs leaves an empty placeholder when it could not download lyrebird.
        .find(|p| p.metadata().map(|m| m.is_file() && m.len() > 0).unwrap_or(false))
        .ok_or_else(|| {
            if cfg!(debug_assertions) {
                anyhow!(
                    "Bridges need the lyrebird transport, which is missing. Run `npm run sidecars` \
                     in pgp-ui (it needs to reach dist.torproject.org), then restart `npm run tauri dev`."
                )
            } else {
                anyhow!(
                    "Bridges need the lyrebird transport that ships with Hermes, \
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

/// Drop blank lines and the torrc-style `Bridge ` prefix that bridges.torproject.org shows.
fn clean_bridge_lines(lines: &[String]) -> Vec<String> {
    lines
        .iter()
        .map(|l| l.trim().trim_start_matches("Bridge ").trim().to_string())
        .filter(|l| !l.is_empty())
        .collect()
}

/// Normalise a peer address to a bare v3 onion hostname, or explain why it isn't one.
pub fn normalize_onion(addr: &str) -> Result<String> {
    let addr = addr.trim().to_ascii_lowercase();
    let addr = addr.trim_start_matches("http://").trim_start_matches("https://").trim_end_matches('/');
    let Some(host) = addr.strip_suffix(".onion") else {
        bail!("'{addr}' is not a .onion address");
    };
    if host.len() != 56 || !host.chars().all(|c| matches!(c, 'a'..='z' | '2'..='7')) {
        bail!("'{addr}' is not a valid v3 onion address (56 characters before .onion)");
    }
    Ok(addr.to_string())
}

/// A lyrebird process we launched, and the SOCKS proxy it opened for each transport.
///
/// Hermes runs lyrebird itself instead of letting Arti do it so it can start it without a console
/// window on Windows (Arti would open one, and closing it would kill the bridge connection).
/// Dropping this kills the process.
struct PtProcess {
    _child: Child,
    methods: Vec<(String, SocketAddr)>,
}

/// Launch lyrebird as a managed transport (pt-spec.txt) for `protocols`.
async fn launch_lyrebird(protocols: &[String], state_dir: &Path) -> Result<PtProcess> {
    let binary = find_lyrebird()?;
    std::fs::create_dir_all(state_dir)
        .with_context(|| format!("Could not create {}", state_dir.display()))?;

    let mut cmd = Command::new(&binary);
    cmd.env("TOR_PT_MANAGED_TRANSPORT_VER", "1")
        .env("TOR_PT_CLIENT_TRANSPORTS", protocols.join(","))
        .env("TOR_PT_STATE_LOCATION", state_dir)
        // lyrebird exits when we do: our end of its stdin closes with us.
        .env("TOR_PT_EXIT_ON_STDIN_CLOSE", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd
        .spawn()
        .with_context(|| format!("Could not start {}", binary.display()))?;
    let stdout = child.stdout.take().context("lyrebird has no stdout pipe")?;
    let mut lines = BufReader::new(stdout).lines();

    let mut methods = Vec::new();
    let handshake = async {
        while let Some(line) = lines.next_line().await? {
            let mut words = line.split_whitespace();
            match words.next() {
                Some("CMETHOD") => {
                    let (Some(name), Some(_socks5), Some(addr)) = (words.next(), words.next(), words.next())
                    else {
                        bail!("lyrebird sent a malformed line: {line}");
                    };
                    let addr = addr.parse().with_context(|| format!("lyrebird sent a bad address: {line}"))?;
                    methods.push((name.to_string(), addr));
                }
                Some("CMETHOD-ERROR") | Some("VERSION-ERROR") | Some("ENV-ERROR") => {
                    bail!("lyrebird refused to start: {line}");
                }
                Some("CMETHODS") => return Ok(()),
                _ => {} // VERSION, LOG, STATUS
            }
        }
        bail!("lyrebird exited before it was ready")
    };
    tokio::time::timeout(PT_HANDSHAKE_TIMEOUT, handshake)
        .await
        .map_err(|_| anyhow!("lyrebird did not start within {}s", PT_HANDSHAKE_TIMEOUT.as_secs()))??;

    // Keep draining its stdout (LOG/STATUS lines) so lyrebird never blocks on a full pipe.
    tokio::spawn(async move { while let Ok(Some(_)) = lines.next_line().await {} });
    Ok(PtProcess { _child: child, methods })
}

/// How the client currently reaches Tor: the bridges in use (none = direct) and their transport.
struct Route {
    bridges: Vec<String>,
    _pt: Option<PtProcess>,
}

impl Route {
    fn describe(&self) -> String {
        if self.bridges.is_empty() {
            return "direct".into();
        }
        let mut kinds: Vec<&str> = self.bridges.iter().map(|l| bridge_transport(l).unwrap_or("plain")).collect();
        kinds.sort();
        kinds.dedup();
        format!("{} bridge", kinds.join(" + "))
    }
}

/// Where the node keeps its files. `arti` = None uses Arti's default state and cache directories
/// (where the onion service key already lives, so the address stays the same).
#[derive(Clone, Debug)]
pub struct NodeDirs {
    pub pt_state: PathBuf,
    pub arti: Option<PathBuf>,
}

/// Build an Arti config for `bridges` (empty = connect directly), launching lyrebird if needed.
async fn prepare_route(bridges: Vec<String>, dirs: &NodeDirs) -> Result<(TorClientConfig, Route)> {
    let mut builder = TorClientConfig::builder();
    if let Some(arti) = &dirs.arti {
        builder
            .storage()
            .state_dir(CfgPath::new_literal(arti.join("state")))
            .cache_dir(CfgPath::new_literal(arti.join("cache")));
    }
    let mut pt = None;

    if !bridges.is_empty() {
        let mut parsed = Vec::new();
        let mut errors = Vec::new();
        for line in &bridges {
            match line.parse::<BridgeConfigBuilder>() {
                Ok(bridge) => parsed.push(bridge),
                Err(e) => errors.push(format!("{e}")),
            }
        }
        if parsed.is_empty() {
            bail!("None of the bridge lines are valid: {}", errors.join("; "));
        }

        let mut protocols: Vec<String> = bridges.iter().filter_map(|l| bridge_transport(l)).map(str::to_string).collect();
        protocols.sort();
        protocols.dedup();
        for p in &protocols {
            if !matches!(p.as_str(), "obfs4" | "snowflake" | "webtunnel" | "meek_lite" | "obfs3" | "scramblesuit") {
                bail!("Bridges of type '{p}' are not supported.");
            }
        }
        if !protocols.is_empty() {
            let process = launch_lyrebird(&protocols, &dirs.pt_state).await?;
            for (name, addr) in &process.methods {
                let mut transport = TransportConfigBuilder::default();
                transport.protocols(vec![name.parse::<PtTransportName>()?]).proxy_addr(*addr);
                builder.bridges().transports().push(transport);
            }
            pt = Some(process);
        }
        builder.bridges().set_bridges(parsed);
    }

    Ok((builder.build()?, Route { bridges, _pt: pt }))
}

/// Why `TorMeshNode::bootstrap` gave up.
#[derive(Debug)]
pub enum BootstrapError {
    /// No progress for the allowed time; carries Arti's own description of where it is stuck.
    /// Arti keeps trying in the background, so a later `bootstrap` call can still succeed.
    Stalled(String),
    Failed(anyhow::Error),
}

impl std::fmt::Display for BootstrapError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Stalled(why) => write!(f, "Tor bootstrap made no progress ({why})"),
            Self::Failed(e) => write!(f, "Tor bootstrap failed: {e:#}"),
        }
    }
}

impl std::error::Error for BootstrapError {}

/// A snapshot of the node for the UI.
#[derive(Clone, Debug, serde::Serialize)]
pub struct TorStatus {
    /// Bootstrap progress, 0-100.
    pub percent: u32,
    /// The consensus is downloaded and Tor is usable.
    pub ready: bool,
    /// Arti's own description, e.g. "45%: connecting successfully; directory is fetching microdescriptors".
    pub summary: String,
    /// Why Arti thinks it is stuck (offline, filtered, clock skew...), if it is.
    pub blocked: Option<String>,
    /// Relays listed in the consensus we downloaded.
    pub relays: Option<usize>,
    /// "direct" or the kind of bridge in use.
    pub via: String,
    /// Our onion service's state, once launched.
    pub onion: Option<String>,
    /// Round-trip time of the last successful connection to a peer, in ms.
    pub peer_rtt_ms: Option<u32>,
}

pub struct TorMeshNode {
    pub client: Arc<TorClient<PreferredRuntime>>,
    dirs: NodeDirs,
    route: Mutex<Route>,
    bootstrapped: AtomicBool,
    last_rtt_ms: AtomicU32,
    onion_address: Mutex<Option<String>>,
    // Keeps the onion service alive; dropping it would take the service down.
    onion_service: Mutex<Option<Arc<tor_hsservice::RunningOnionService>>>,
    // Channel for pushing incoming messages to Tauri
    incoming_tx: mpsc::Sender<Vec<u8>>,
    incoming_rx: Mutex<Option<mpsc::Receiver<Vec<u8>>>>,
}

impl TorMeshNode {
    /// Create the Tor client without connecting yet; `bootstrap` connects.
    /// `bridge_lines` empty means connect directly.
    pub async fn new(bridge_lines: &[String], dirs: NodeDirs) -> Result<Self> {
        let (config, route) = prepare_route(clean_bridge_lines(bridge_lines), &dirs).await?;
        let client = TorClient::builder()
            .config(config)
            .create_unbootstrapped_async()
            .await
            .context("Could not create the Tor client")?;
        let (tx, rx) = mpsc::channel(100);

        Ok(Self {
            client,
            dirs,
            route: Mutex::new(route),
            bootstrapped: AtomicBool::new(false),
            last_rtt_ms: AtomicU32::new(0),
            onion_address: Mutex::new(None),
            onion_service: Mutex::new(None),
            incoming_tx: tx,
            incoming_rx: Mutex::new(Some(rx)),
        })
    }

    /// Switch to `bridge_lines` (empty = direct) on the running client.
    /// Returns false if they are already in use.
    pub async fn set_bridges(&self, bridge_lines: &[String]) -> Result<bool> {
        let bridges = clean_bridge_lines(bridge_lines);
        if self.route.lock().unwrap().bridges == bridges {
            return Ok(false);
        }
        let (config, route) = prepare_route(bridges, &self.dirs).await?;
        self.client
            .reconfigure(&config, Reconfigure::AllOrNothing)
            .context("Could not apply the new bridge settings")?;
        // The old lyrebird (if any) is dropped, and so stopped, only once Arti has moved off it.
        *self.route.lock().unwrap() = route;
        Ok(true)
    }

    pub fn is_bootstrapped(&self) -> bool {
        self.bootstrapped.load(Ordering::SeqCst)
    }

    /// Connect to the Tor network: download the consensus and enough relay descriptors to build
    /// circuits. `on_progress` is called about twice a second. Gives up with
    /// `BootstrapError::Stalled` if progress stops for `stall_after`.
    pub async fn bootstrap(
        &self,
        stall_after: Duration,
        mut on_progress: impl FnMut(&TorStatus),
    ) -> std::result::Result<(), BootstrapError> {
        if self.is_bootstrapped() {
            return Ok(());
        }
        // Run Arti's bootstrap in its own task and never cancel it: a cancelled bootstrap leaves
        // its download task running, and Arti then reports later bootstrap calls as done at once.
        let client = self.client.clone();
        let mut task = tokio::spawn(async move { client.bootstrap().await });

        let mut best = -1.0f32;
        let mut last_progress = Instant::now();
        let mut tick = tokio::time::interval(Duration::from_millis(500));
        loop {
            tokio::select! {
                res = &mut task => {
                    return match res {
                        Ok(Ok(())) => {
                            self.bootstrapped.store(true, Ordering::SeqCst);
                            on_progress(&self.status());
                            Ok(())
                        }
                        Ok(Err(e)) => Err(BootstrapError::Failed(e.into())),
                        Err(e) => Err(BootstrapError::Failed(anyhow!("bootstrap task ended: {e}"))),
                    };
                }
                _ = tick.tick() => {
                    let frac = self.client.bootstrap_status().as_frac();
                    if frac > best + 0.005 {
                        best = frac;
                        last_progress = Instant::now();
                    }
                    let status = self.status();
                    on_progress(&status);
                    if last_progress.elapsed() >= stall_after {
                        return Err(BootstrapError::Stalled(status.blocked.unwrap_or(status.summary)));
                    }
                }
            }
        }
    }

    pub fn status(&self) -> TorStatus {
        let boot = self.client.bootstrap_status();
        let relays = self
            .client
            .dirmgr()
            .ok()
            .and_then(|dir| dir.netdir(Timeliness::Timely).ok())
            .map(|netdir| netdir.relays().count());
        let rtt = self.last_rtt_ms.load(Ordering::Relaxed);
        TorStatus {
            percent: (boot.as_frac() * 100.0).round().clamp(0.0, 100.0) as u32,
            ready: self.is_bootstrapped() || boot.ready_for_traffic(),
            summary: boot.to_string(),
            blocked: boot.blocked().map(|b| b.to_string()),
            relays,
            via: self.route.lock().unwrap().describe(),
            onion: self.onion_state(),
            peer_rtt_ms: (rtt > 0).then_some(rtt),
        }
    }

    fn onion_state(&self) -> Option<String> {
        use tor_hsservice::status::State;
        let svc = self.onion_service.lock().unwrap().clone()?;
        let status = svc.status();
        let state = match status.state() {
            State::Bootstrapping => "Publishing",
            State::Running => "Reachable",
            State::DegradedReachable => "Reachable (degraded)",
            State::DegradedUnreachable => "Unreachable, retrying",
            State::Recovering => "Recovering",
            State::Broken => "Broken",
            State::Shutdown => "Starting",
            #[allow(unreachable_patterns)]
            _ => "Unknown",
        };
        Some(match status.current_problem() {
            Some(problem) if state == "Broken" => format!("Broken: {problem:?}"),
            _ => state.to_string(),
        })
    }

    /// Our onion address, once the service is launched.
    pub fn get_onion_address(&self) -> Option<String> {
        self.onion_address.lock().unwrap().clone()
    }

    /// Launch our onion service (once) and listen for incoming messages. Returns its address.
    /// The service key is kept in Arti's keystore, so the address is stable across restarts.
    /// Peers can reach it once its descriptor is published; `status().onion` reports that.
    pub async fn start_hidden_service(&self) -> Result<String> {
        use safelog::DisplayRedacted;
        use tor_hsservice::config::OnionServiceConfigBuilder;

        if let Some(addr) = self.get_onion_address() {
            return Ok(addr);
        }

        let nickname = "hermes".to_string().try_into()?;
        let svc_config = OnionServiceConfigBuilder::default()
            .nickname(nickname)
            .build()
            .map_err(|e| anyhow!("Onion service config failed: {e}"))?;

        let (onion_svc, mut rend_requests) = self
            .client
            .launch_onion_service(svc_config)
            .map_err(|e| anyhow!("Onion service launch failed: {e}"))?
            .ok_or_else(|| anyhow!("Onion service is disabled in the Tor config"))?;

        let onion_id = onion_svc
            .onion_address()
            .ok_or_else(|| anyhow!("No onion address was generated"))?;
        // HsId's Debug/Display output is redacted by safelog; peers need the real address.
        let addr = onion_id.display_unredacted().to_string();
        *self.onion_address.lock().unwrap() = Some(addr.clone());
        *self.onion_service.lock().unwrap() = Some(onion_svc);

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
                            let read = async {
                                let mut len_buf = [0u8; 4];
                                stream.read_exact(&mut len_buf).await.ok()?;
                                let len = u32::from_le_bytes(len_buf) as usize;
                                if len == 0 || len > MAX_MESSAGE_BYTES {
                                    return None;
                                }
                                let mut payload = vec![0u8; len];
                                stream.read_exact(&mut payload).await.ok()?;
                                Some(payload)
                            };
                            // A peer that stalls mid-message must not hold this task forever.
                            if let Ok(Some(payload)) = tokio::time::timeout(PEER_READ_TIMEOUT, read).await {
                                let _ = tx.send(payload).await;
                            }
                        });
                    }
                });
            }
        });

        Ok(addr)
    }

    /// Open a stream to a peer's onion service, recording the round-trip time.
    async fn open_peer_stream(&self, target_onion: &str) -> Result<arti_client::DataStream> {
        let target = normalize_onion(target_onion)?;
        let started = Instant::now();
        let stream = tokio::time::timeout(PEER_CONNECT_TIMEOUT, self.client.connect((target.as_str(), PEER_PORT)))
            .await
            .map_err(|_| {
                anyhow!(
                    "Timed out after {}s reaching {target}. The peer may be offline, or its onion \
                     service may still be publishing (this takes a minute or two after it starts).",
                    PEER_CONNECT_TIMEOUT.as_secs()
                )
            })?
            .with_context(|| format!("Could not reach {target} over Tor"))?;
        let rtt = started.elapsed().as_millis().clamp(1, u32::MAX as u128) as u32;
        self.last_rtt_ms.store(rtt, Ordering::Relaxed);
        Ok(stream)
    }

    /// Check that a peer's onion service is reachable by opening (and closing) a stream to it.
    pub async fn connect_peer(&self, target_onion: &str) -> Result<()> {
        self.open_peer_stream(target_onion).await.map(drop)
    }

    /// Sends a direct message over the Tor circuit to a remote Onion Service
    pub async fn send_direct_message(&self, target_onion: &str, payload: &[u8]) -> Result<()> {
        if payload.is_empty() || payload.len() > MAX_MESSAGE_BYTES {
            bail!("Message is {} bytes; the limit is {} bytes", payload.len(), MAX_MESSAGE_BYTES);
        }
        let mut stream = self.open_peer_stream(target_onion).await?;

        // Write the payload length first (simple protocol framing)
        let len = payload.len() as u32;
        stream.write_all(&len.to_le_bytes()).await?;
        stream.write_all(payload).await?;
        stream.flush().await?;

        Ok(())
    }

    /// Take the receiver so it can be passed to Tauri's event loop
    pub fn take_receiver(&self) -> Option<mpsc::Receiver<Vec<u8>>> {
        self.incoming_rx.lock().unwrap().take()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_bridges_parse() {
        for kind in ["obfs4", "snowflake"] {
            for line in builtin_bridges(kind).unwrap() {
                line.parse::<BridgeConfigBuilder>().unwrap_or_else(|e| panic!("{line}: {e}"));
                assert_eq!(bridge_transport(&line), Some(kind));
            }
        }
    }

    #[test]
    fn transport_of_plain_bridge_is_none() {
        assert_eq!(bridge_transport("1.2.3.4:443 0123456789ABCDEF0123456789ABCDEF01234567"), None);
        assert_eq!(bridge_transport("[2001:db8::1]:443 0123456789ABCDEF0123456789ABCDEF01234567"), None);
    }

    #[test]
    fn bridge_prefix_and_blank_lines_are_cleaned() {
        let lines = vec!["  Bridge obfs4 1.2.3.4:443 X  ".to_string(), "   ".to_string()];
        assert_eq!(clean_bridge_lines(&lines), vec!["obfs4 1.2.3.4:443 X".to_string()]);
    }

    #[test]
    fn onion_addresses_are_validated() {
        let host = "a".repeat(56);
        assert_eq!(normalize_onion(&format!(" HTTP://{}.ONION/ ", host.to_uppercase())).unwrap(), format!("{host}.onion"));
        assert!(normalize_onion("example.com").is_err());
        assert!(normalize_onion("abc.onion").is_err());
        assert!(normalize_onion(&format!("{}.onion", "1".repeat(56))).is_err());
    }
}
