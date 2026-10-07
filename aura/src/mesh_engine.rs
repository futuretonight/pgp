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
    /// Bootstraps the Tor circuit
    pub async fn new() -> Result<Self> {
        let config = TorClientConfig::default();
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
        
        // TODO: Wire up actual tor_hsservice once the API stabilizes.
        // For now, simulate a node address generation.
        {
            use rand::RngCore;
            let mut rng = rand::thread_rng();
            let mut bytes = [0u8; 16];
            rng.fill_bytes(&mut bytes);
            let hex = hex::encode(bytes);
            *lock = Some(format!("hermes{}.onion", hex));
        }
        
        // Setup a local listener to simulate receiving hidden service traffic
        // In a real Arti implementation, this would be a stream from launch_onion_service
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let tx = self.incoming_tx.clone();
        
        tokio::spawn(async move {
            loop {
                if let Ok((mut socket, _)) = listener.accept().await {
                    let tx_clone = tx.clone();
                    tokio::spawn(async move {
                        let mut len_buf = [0u8; 4];
                        if socket.read_exact(&mut len_buf).await.is_ok() {
                            let len = u32::from_le_bytes(len_buf) as usize;
                            if len < 10 * 1024 * 1024 { // max 10MB payload
                                let mut payload = vec![0u8; len];
                                if socket.read_exact(&mut payload).await.is_ok() {
                                    let _ = tx_clone.send(payload).await;
                                }
                            }
                        }
                    });
                }
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
