// Prints the FALCON_ACCESS value for a Falcon password, the same hash the lock page stores in its cookie.
//   node tools/falcon-hash.mjs "the password"
// Put the printed value in Vercel → Project → Settings → Environment Variables as FALCON_ACCESS, then redeploy.
import { pbkdf2Sync } from 'node:crypto';

const password = (process.argv[2] || '').trim().toLowerCase();   // the lock page trims and lowercases too
if (!password) {
  console.error('Usage: node tools/falcon-hash.mjs "the password"');
  process.exit(1);
}
console.log(pbkdf2Sync(password, 'notfiguredyet.com/work/falcon', 150000, 32, 'sha256').toString('hex'));
