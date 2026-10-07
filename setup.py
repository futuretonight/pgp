import os
import subprocess
import sys
import shutil

def print_step(msg):
    print(f"\n\033[1;36m[*] {msg}\033[0m")

def print_success(msg):
    print(f"\033[1;32m[+] {msg}\033[0m")

def print_error(msg):
    print(f"\033[1;31m[-] {msg}\033[0m")

def check_command(cmd, name, install_url):
    print_step(f"Checking for {name}...")
    if shutil.which(cmd) is None:
        print_error(f"{name} is not installed or not in PATH.")
        print(f"Please install it from: {install_url}")
        sys.exit(1)
    print_success(f"{name} found.")

def main():
    print("\033[1;32m===================================================\033[0m")
    print("\033[1;32m  Hermes / Aura Privacy Engine - Auto Setup Script \033[0m")
    print("\033[1;32m===================================================\033[0m")

    # 1. Check dependencies
    check_command("node", "Node.js", "https://nodejs.org/")
    check_command("npm", "NPM", "https://nodejs.org/")
    check_command("cargo", "Rust / Cargo", "https://rustup.rs/")

    # 2. Install NPM dependencies
    print_step("Installing frontend dependencies...")
    pgp_ui_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pgp-ui")
    if not os.path.exists(pgp_ui_dir):
        print_error(f"Directory {pgp_ui_dir} not found. Are you in the right directory?")
        sys.exit(1)

    os.chdir(pgp_ui_dir)
    try:
        subprocess.run(["npm", "install"], check=True)
        print_success("Dependencies installed.")
    except subprocess.CalledProcessError:
        print_error("npm install failed.")
        sys.exit(1)

    # 3. Launch Tauri
    print_step("Launching Hermes...")
    print("Note: The very first launch will take a few minutes while it compiles the heavy Rust cryptography.")
    try:
        subprocess.run(["npm", "run", "tauri", "dev"], check=True)
    except KeyboardInterrupt:
        print_success("Exiting Hermes gracefully...")
    except subprocess.CalledProcessError:
        print_error("Failed to start Tauri dev server.")
        sys.exit(1)

if __name__ == "__main__":
    main()
