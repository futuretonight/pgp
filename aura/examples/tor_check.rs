//! End-to-end check of the Tor engine: bootstrap, publish our onion service, then send a message
//! to it over Tor and receive it. Uses its own Arti directories, not the app's.
//!
//!   cargo run --release --example tor_check -- direct
//!   cargo run --release --example tor_check -- snowflake   # or obfs4; needs lyrebird on PATH
use aura::mesh_engine::{NodeDirs, TorMeshNode, builtin_bridges};
use std::time::{Duration, Instant};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let mode = std::env::args().nth(1).unwrap_or_else(|| "direct".into());
    let fallback = mode == "fallback";
    let bridges = if mode == "direct" || fallback { vec![] } else { builtin_bridges(&mode).expect("direct, fallback, obfs4 or snowflake") };
    let base = std::env::temp_dir().join(format!("hermes-tor-check-{mode}"));
    let dirs = NodeDirs { pt_state: base.join("pt"), arti: Some(base.join("arti")) };

    let started = Instant::now();
    let node = TorMeshNode::new(&bridges, dirs).await?;
    if fallback {
        // What the app does when a direct connection stalls: switch the running client to Snowflake.
        let err = node.bootstrap(Duration::from_secs(1), |_| {}).await.expect_err("should stall");
        println!("direct start gave up: {err}");
        node.set_bridges(&builtin_bridges("snowflake").unwrap()).await?;
    }
    let mut last = String::new();
    node.bootstrap(Duration::from_secs(180), |s| {
        let line = format!("{:>3}% via {} | {}", s.percent, s.via, s.blocked.as_deref().unwrap_or(&s.summary));
        if line != last {
            println!("[{:>5.1}s] {line}", started.elapsed().as_secs_f32());
            last = line;
        }
    })
    .await?;
    println!("bootstrapped in {:.1}s; consensus lists {:?} usable relays", started.elapsed().as_secs_f32(), node.status().relays);

    let addr = node.start_hidden_service().await?;
    let mut rx = node.take_receiver().unwrap();
    println!("onion service {addr}");
    loop {
        let state = node.status().onion.unwrap_or_default();
        println!("[{:>5.1}s] onion: {state}", started.elapsed().as_secs_f32());
        if state.starts_with("Reachable") { break; }
        tokio::time::sleep(Duration::from_secs(5)).await;
    }

    let mut attempt = 1;
    while let Err(e) = node.send_direct_message(&addr, b"ping over tor").await {
        println!("[{:>5.1}s] send attempt {attempt} failed: {e:#}", started.elapsed().as_secs_f32());
        attempt += 1;
        if attempt > 4 { return Err(e); }
    }
    let got = tokio::time::timeout(Duration::from_secs(60), rx.recv()).await?.unwrap();
    assert_eq!(got, b"ping over tor");
    println!("message delivered through our own onion service; rtt {:?} ms; total {:.1}s",
        node.status().peer_rtt_ms, started.elapsed().as_secs_f32());
    Ok(())
}
