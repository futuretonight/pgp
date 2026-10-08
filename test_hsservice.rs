use anyhow::Result;
use arti_client::{TorClient, TorClientConfig};
use tor_rtcompat::PreferredRuntime;

#[tokio::main]
async fn main() -> Result<()> {
    let config = TorClientConfig::builder().build()?;
    let client = TorClient::create_bootstrapped(config).await?;
    
    use tor_hsservice::config::OnionServiceConfigBuilder;
    let nickname = "hermes".to_string().try_into().unwrap();
    let svc_config = OnionServiceConfigBuilder::default()
        .nickname(nickname)
        .build()?;
        
    let (req_stream, onion_svc) = client.launch_onion_service(svc_config)?;
    Ok(())
}
