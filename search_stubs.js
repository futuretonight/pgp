const fs = require('fs');
const path = require('path');
const dirs = ['aura/src', 'pgp-ui/src', 'pgp-ui/src-tauri/src'];
const words = ['stub', 'mock', 'simulate', 'fake', 'dummy', 'todo'];
const walk = (dir) => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      walk(p);
    } else if (p.endsWith('.rs') || p.endsWith('.jsx') || p.endsWith('.js')) {
      const content = fs.readFileSync(p, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        const lower = line.toLowerCase();
        if (words.some(w => lower.includes(w))) {
          console.log(p + ':' + (i+1) + ': ' + line.trim());
        }
      });
    }
  }
};
dirs.forEach(walk);
