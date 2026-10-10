// Keys, signatures and ciphertext cross the UI as hex strings and reach Rust as byte arrays.

export const toHex = (bytes) =>
  Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');

// Accepts pasted hex with spaces or line breaks; throws a readable error for anything else.
export function fromHex(text, what = 'Value') {
  const clean = String(text ?? '').replace(/\s+/g, '');
  if (!clean) throw new Error(`${what} is empty.`);
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new Error(`${what} is not valid hex.`);
  }
  const bytes = new Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  return bytes;
}

export const textBytes = (text) => Array.from(new TextEncoder().encode(text));
