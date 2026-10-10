import os
import re
import subprocess
import sys
import shutil

# Arti (the embedded Tor client) needs this Rust version or newer.
MIN_RUST = (1, 92)

def print_step(msg):
    print(f"\n\033[1;36m[*] {msg}\033[0m")

def print_success(msg):
    print(f"\033[1;32m[+] {msg}\033[0m")

def print_error(msg):
    print(f"\033[1;31m[-] {msg}\033[0m")

def check_command(cmd, name, install_url, reason=None):
    """Exit unless `cmd` is on PATH; return its full path (on Windows npm is npm.cmd, which
    subprocess cannot run by bare name)."""
    print_step(f"Checking for {name}...")
    path = shutil.which(cmd)
    if path is None:
        print_error(f"{name} is not installed or not in PATH.")
        if reason:
            print(f"    \033[1;33mWhy it's needed:\033[0m {reason}")
        print(f"    \033[1;33mAction:\033[0m Please install it from {install_url}")
        print(f"    \033[1;31mIMPORTANT:\033[0m Make sure to add it to your system PATH during installation!")
        sys.exit(1)
    print_success(f"{name} found.")
    return path

def check_rust_version(rustc):
    out = subprocess.run([rustc, "--version"], capture_output=True, text=True).stdout
    match = re.search(r"(\d+)\.(\d+)", out)
    if not match or (int(match[1]), int(match[2])) < MIN_RUST:
        print_error(f"Rust {MIN_RUST[0]}.{MIN_RUST[1]} or newer is required (found: {out.strip() or 'unknown'}).")
        print("    \033[1;33mAction:\033[0m Run `rustup update stable`, then start this script again.")
        sys.exit(1)
    print_success(out.strip())

def main():
    print("\033[1;32m===================================================\033[0m")
    print("\033[1;32m  Hermes / Aura Privacy Engine - Auto Setup Script \033[0m")
    print("\033[1;32m===================================================\033[0m")

    # 1. Check dependencies
    check_command("node", "Node.js", "https://nodejs.org/")
    npm = check_command("npm", "NPM", "https://nodejs.org/")
    check_command("cargo", "Rust / Cargo", "https://rustup.rs/")
    check_rust_version(check_command("rustc", "Rust compiler", "https://rustup.rs/"))
    
    # NASM is explicitly required on Windows for building the 'ring' crate, 
    # which is a core cryptography dependency for arti (Tor) and rustls.
    if sys.platform == "win32":
        check_command(
            "nasm", 
            "NASM (Netwide Assembler)", 
            "https://www.nasm.us/",
            reason="Required to compile the 'ring' cryptography library used by the Tor client."
        )
        if shutil.which("link") is None and shutil.which("cl") is None:
            print("    \033[1;33mNote:\033[0m If the build fails with 'link.exe not found', install the")
            print("    'Desktop development with C++' workload from https://visualstudio.microsoft.com/visual-cpp-build-tools/")

    # 2. Install NPM dependencies
    print_step("Installing frontend dependencies...")
    pgp_ui_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pgp-ui")
    if not os.path.exists(pgp_ui_dir):
        print_error(f"Directory {pgp_ui_dir} not found. Are you in the right directory?")
        sys.exit(1)

    os.chdir(pgp_ui_dir)
    try:
        subprocess.run([npm, "install"], check=True)
        print_success("Dependencies installed.")
    except subprocess.CalledProcessError:
        print_error("npm install failed.")
        sys.exit(1)

    # 3. Launch Tauri
    print_step("Launching Hermes...")
    print("Note: The very first launch compiles the Rust cryptography and Tor client. On a slow")
    print("laptop that can take 15-30 minutes; later launches start in seconds.")
    try:
        subprocess.run([npm, "run", "tauri", "dev"], check=True)
    except KeyboardInterrupt:
        print_success("Exiting Hermes gracefully...")
    except subprocess.CalledProcessError:
        print_error("Failed to start Tauri dev server.")
        sys.exit(1)

if __name__ == "__main__":
    main()
