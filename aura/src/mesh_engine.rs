use anyhow::Result;
use arti_client::{TorClient, TorClientConfig};
use tor_rtcompat::PreferredRuntime;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio::net::TcpListener;

pub struct TorMeshNode {
    pub client: Arc<TorClient<PreferredRuntime>>,
    onion_address: Mutex<Option<String>>,
    // Channel for pushing incoming messages to Tauri
    incoming_tx: mpsc::Sender<Vec<u8>>,
    incoming_rx: Mutex<Option<mpsc::Receiver<Vec<u8>>>>,
}

impl TorMeshNode {
    pub async fn new(use_bridges: bool, bridge_lines: Vec<String>) -> Result<Self> {
        let mut builder = TorClientConfig::builder();
        
        if use_bridges && !bridge_lines.is_empty() {
            let mut bridge_config = Vec::new();
            for line in bridge_lines {
                // arti_client supports parsing standard bridge lines
                if let Ok(bridge) = line.parse() {
                    bridge_config.push(bridge);
                }
            }
            builder.bridges().set_bridges(bridge_config);
        }
        
        let config = builder.build()?;
        let client = TorClient::create_bootstrapped(config).await?;
        
        let (tx, rx) = mpsc::channel(100);
        
        Ok(Self {
            client,
            onion_address: Mutex::new(None),
            incoming_tx: tx,
            incoming_rx: Mutex::new(Some(rx)),
        })
    }

    /// Retrieve the Onion Address
    pub async fn get_onion_address(&self) -> Option<String> {
        let lock = self.onion_address.lock().await;
        lock.clone()
    }

    /// Start a hidden service instance and listen for incoming connections
    pub async fn start_hidden_service(&self) -> Result<()> {
        let mut lock = self.onion_address.lock().await;
        
        use tor_hsservice::config::OnionServiceConfigBuilder;
        let nickname = "hermes".to_string().try_into().unwrap();
        let svc_config = OnionServiceConfigBuilder::default()
            .nickname(nickname)
            .build()
            .map_err(|e| anyhow::anyhow!("Config build failed: {}", e))?;
            
        let (mut req_stream, onion_svc) = self.client.launch_onion_service(svc_config)
            .map_err(|e| anyhow::anyhow!("Onion launch error: {}", e))?;
        
        // Retrieve the real onion address
        let onion_id = onion_svc.onion_name().ok_or_else(|| anyhow::anyhow!("No onion name generated"))?;
        *lock = Some(format!("{}.onion", onion_id));
        
        let tx = self.incoming_tx.clone();
        
        // Listen for actual Tor incoming rendezvous requests
        tokio::spawn(async move {
            use futures::StreamExt;
            while let Some(req) = req_stream.next().await {
                let tx_clone = tx.clone();
                tokio::spawn(async move {
                    if let Ok(mut stream) = req.accept().await {
                        let mut len_buf = [0u8; 4];
                        if stream.read_exact(&mut len_buf).await.is_ok() {
                            let len = u32::from_le_bytes(len_buf) as usize;
                            if len < 10 * 1024 * 1024 { // max 10MB payload
                                let mut payload = vec![0u8; len];
                                if stream.read_exact(&mut payload).await.is_ok() {
                                    let _ = tx_clone.send(payload).await;
                                }
                            }
                        }
                    }
                });
            }
        });
        
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
