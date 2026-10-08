#!/usr/bin/env node
// Fetches the `lyrebird` pluggable-transport binary that Hermes ships as a Tauri sidecar.
// lyrebird speaks obfs4, meek_lite, webtunnel and snowflake, so it is the only binary needed.
//
// It comes from Tor Project's Tor Expert Bundle at a pinned version, and every download is
// checked against the SHA-256 published in that release's GPG-signed sha256sums-signed-build.txt.
//
//   node scripts/fetch-sidecars.mjs                 # the host's target (runs before `npm run tauri`)
//   node scripts/fetch-sidecars.mjs --target <triple>
//   node scripts/fetch-sidecars.mjs --all           # every supported target
//
// To bump TOR_VERSION: download sha256sums-signed-build.txt and its .asc from
// https://dist.torproject.org/torbrowser/<version>/, verify the signature against the Tor Browser
// Developers key (fingerprint EF6E 286D DA85 EA2A 4BA7  DE68 4E2C 6E87 9329 8290), copy the
// tor-expert-bundle hashes into TARGETS, then run with --all and update the `lyrebird` hashes.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const TOR_VERSION = '15.0.24';

// Rust target triple -> Tor Expert Bundle platform, the bundle's SHA-256, and the SHA-256 of the
// lyrebird binary inside it (used to skip work when the sidecar is already in place).
const TARGETS = {
  'aarch64-apple-darwin': {
    platform: 'macos-aarch64',
    bundle: 'd47afd04b6c751129978390ad003d74ac8b88adfbb939350f0f89999e6570644',
    lyrebird: '94f64abef19dc481f32e41f87ec5f999ad64f04e37ac779121533f1c5b42c9a1',
  },
  'x86_64-apple-darwin': {
    platform: 'macos-x86_64',
    bundle: '8acb0b590f6be34084dcb6d84009ac0c61cc7c5261b7a19d2ab94845aa9bd5b6',
    lyrebird: '14b953cb65813857b1492d64ce48a4e981d7d5bff9bc67fa3a899c33daa20fcf',
  },
  'x86_64-pc-windows-msvc': {
    platform: 'windows-x86_64',
    bundle: 'e9dc6ccc93cd6afa507193f4de284d6424233ff5102155cd2c94b259e8a22b65',
    lyrebird: '6e218e85f9a7ae2481f5402ded822471a9a9d0c7e66b05db3842b93fa5c1f02e',
  },
  'x86_64-unknown-linux-gnu': {
    platform: 'linux-x86_64',
    bundle: '8e012ec6815d7899cb64011582e2dade88e74119c6661068a2a3252de0ccd7f2',
    lyrebird: 'ee13ec155cf9b131a3e1b87bd6d697a10c42d04f2eaaeab6b1590c9971d41421',
  },
};
const UNIVERSAL_MAC = 'universal-apple-darwin';

const BIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src-tauri', 'binaries');
const LICENSE_PATH = join(BIN_DIR, 'lyrebird-LICENSE.txt');

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sidecarPath = (triple) =>
  join(BIN_DIR, `lyrebird-${triple}${triple.includes('windows') ? '.exe' : ''}`);

function hostTriple() {
  try {
    const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
    const host = out.match(/^host: (\S+)$/m);
    if (host) return host[1];
  } catch { /* fall through to a guess from Node's view of the platform */ }
  const arch = { arm64: 'aarch64', x64: 'x86_64' }[process.arch] ?? process.arch;
  const os = { darwin: 'apple-darwin', win32: 'pc-windows-msvc', linux: 'unknown-linux-gnu' }[process.platform];
  return `${arch}-${os}`;
}

// Returns the files named in `wanted` from a .tar archive, keyed by path.
function extractFromTar(tar, wanted) {
  const found = {};
  let longName = null;
  for (let off = 0; off + 512 <= tar.length; ) {
    const header = tar.subarray(off, off + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start, len) => header.subarray(start, start + len).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1);
    const prefix = field(345, 155);
    const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    const body = tar.subarray(off + 512, off + 512 + size);
    longName = null;
    if (type === 'L') longName = body.toString('utf8').replace(/\0.*$/s, '');
    else if (type === 'x') longName = body.toString('utf8').match(/\d+ path=([^\n]*)\n/)?.[1] ?? null;
    else if (wanted.includes(name)) found[name] = Buffer.from(body);
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return found;
}

async function fetchTarget(triple) {
  const target = TARGETS[triple];
  const dest = sidecarPath(triple);
  if (target.lyrebird && existsSync(dest) && existsSync(LICENSE_PATH)
      && sha256(readFileSync(dest)) === target.lyrebird) {
    console.log(`[sidecars] lyrebird for ${triple} is up to date`);
    return;
  }

  const file = `tor-expert-bundle-${target.platform}-${TOR_VERSION}.tar.gz`;
  const url = `https://dist.torproject.org/torbrowser/${TOR_VERSION}/${file}`;
  console.log(`[sidecars] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${url}`);
  const archive = Buffer.from(await res.arrayBuffer());

  const actual = sha256(archive);
  if (actual !== target.bundle) {
    throw new Error(`checksum mismatch for ${file}\n  expected ${target.bundle}\n  got      ${actual}\nRefusing to use it.`);
  }

  const exe = `tor/pluggable_transports/lyrebird${triple.includes('windows') ? '.exe' : ''}`;
  const license = 'docs/lyrebird.txt';
  const files = extractFromTar(gunzipSync(archive), [exe, license]);
  if (!files[exe]) throw new Error(`${exe} not found in ${file}`);
  if (target.lyrebird && sha256(files[exe]) !== target.lyrebird) {
    throw new Error(`lyrebird inside ${file} does not match the pinned hash`);
  }

  mkdirSync(BIN_DIR, { recursive: true });
  writeFileSync(`${dest}.tmp`, files[exe]);
  chmodSync(`${dest}.tmp`, 0o755);
  renameSync(`${dest}.tmp`, dest);
  if (files[license]) writeFileSync(LICENSE_PATH, files[license]);
  console.log(`[sidecars] installed ${dest}`);
}

// Tauri's universal macOS build expects one fat binary covering both architectures.
async function fetchUniversalMac() {
  await fetchTarget('aarch64-apple-darwin');
  await fetchTarget('x86_64-apple-darwin');
  execFileSync('lipo', [
    '-create', sidecarPath('aarch64-apple-darwin'), sidecarPath('x86_64-apple-darwin'),
    '-output', sidecarPath(UNIVERSAL_MAC),
  ]);
  console.log(`[sidecars] installed ${sidecarPath(UNIVERSAL_MAC)}`);
}

async function main() {
  const args = process.argv.slice(2);
  const targetFlag = args.indexOf('--target');
  let triples;
  if (args.includes('--all')) {
    triples = Object.keys(TARGETS);
    if (process.platform === 'darwin') triples.push(UNIVERSAL_MAC);
  } else if (targetFlag !== -1 && args[targetFlag + 1]) {
    triples = [args[targetFlag + 1]];
  } else {
    triples = [hostTriple()];
  }

  for (const triple of triples) {
    if (triple === UNIVERSAL_MAC) await fetchUniversalMac();
    else if (TARGETS[triple]) await fetchTarget(triple);
    else throw new Error(`no lyrebird build for ${triple}; supported: ${[...Object.keys(TARGETS), UNIVERSAL_MAC].join(', ')}`);
  }
}

main().catch((e) => {
  console.error(`[sidecars] ${e.message}`);
  process.exit(1);
});
