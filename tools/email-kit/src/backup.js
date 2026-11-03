/* Passwords and keys are never persisted. Only the downloaded backup is encrypted. */
const Backup = (() => {
  const encode = bytes => {
    const parts = [];
    for (let i = 0; i < bytes.length; i += 16384) parts.push(String.fromCharCode(...bytes.subarray(i, i + 16384)));
    return btoa(parts.join(''));
  };
  const decode = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  async function key(password, salt) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations:600000}, material,
      {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
  }
  async function seal(data,password) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv}, await key(password,salt), new TextEncoder().encode(JSON.stringify(data)));
    return {format:'usha-backup-v1',salt:encode(salt),iv:encode(iv),cipher:encode(new Uint8Array(cipher))};
  }
  async function open(data,password) {
    const salt = decode(data.salt), iv = decode(data.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error('Invalid backup');
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv}, await key(password,salt), decode(data.cipher));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  return {seal,open};
})();
