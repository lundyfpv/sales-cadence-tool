'use strict';
// Builds a throwaway database the size of a busy team: 1 admin (TSM + Admin), 1 director, 5 RSMs and 30 TSMs,
// each rep with 150 customers seen every 4 weeks for two years (about 121,000 appointments).
//   node --disable-warning=ExperimentalWarning scripts/load-test/seed.js /tmp/cadence-load
// Never point it at real data: it writes into the folder you give it. Every account's password is "password12345".
const path = require('path');
const dir = process.argv[2];
if (!dir) { console.error('Give a folder for the test database, e.g. /tmp/cadence-load'); process.exit(1); }
process.env.DATA_DIR = path.resolve(dir);
const store = require('../../server/store');
const auth = require('../../server/auth');
if (auth.userCount() > 0) { console.error('That folder already has a database. Use an empty one.'); process.exit(1); }

const REPS = +(process.env.REPS || 30), CUSTOMERS = +(process.env.CUSTOMERS || 150), VISITS = +(process.env.VISITS || 26);
const t0 = Date.now();
const admin = auth.createUser('alec', 'password12345', 'tsm', 'Alec', null, true);
const director = auth.createUser('dana', 'password12345', 'director', 'Dana', null);
const rsms = Array.from({ length: 5 }, (_, i) => auth.createUser('rsm' + i, 'password12345', 'rsm', 'RSM ' + i, director));
const tsms = Array.from({ length: REPS }, (_, i) => auth.createUser('tsm' + i, 'password12345', 'tsm', 'TSM ' + i, rsms[i % 5]));
store.kvSet('rolesV2', true);
// dates count back from today so the newest appointment of each customer is still open
const start = Date.now() - (VISITS - 1) * 28 * 864e5;
const day = d => new Date(start + d * 864e5).toISOString().slice(0, 10);
let customers = 0, appointments = 0;
store.transaction(() => {
  for (const [ti, owner] of [admin, ...tsms].entries()) {
    for (let c = 0; c < CUSTOMERS; c++) {
      const cid = `c${ti}_${c}`; customers++;
      store.putDoc('customers', cid, {
        name: `Customer ${ti}-${c}`, contact: 'Pat Doe', phone: '555-0100', email: 'pat@example.com', address: 'Somewhere, TX',
        kind: c % 5 ? 'visit' : 'call', cadence: 4, unit: 'weeks', homeDay: 2 + c % 3, active: true, duration: 60,
        notes: 'Account notes. '.repeat(4), assigned: c % 2 === 0, prospect: c % 17 === 0, products: ['Equipment', 'Samsung'],
        rhythmDate: day((VISITS - 2) * 28 + (c % 28)), lastTouch: day((VISITS - 2) * 28 + (c % 28)),
      }, owner);
      for (let k = 0; k < VISITS; k++) {
        const d = (c % 28) + k * 28, open = k === VISITS - 1; appointments++;
        store.putDoc('appointments', `a${ti}_${c}_${k}`, {
          customerId: cid, kind: c % 5 ? 'visit' : 'call', date: day(d), time: '10:00', duration: 60,
          status: open ? 'proposed' : (k % 9 === 0 ? 'missed' : 'completed'), rhythmDate: day(d),
          notes: 'Agenda line one\nAgenda line two', recap: open ? '' : 'Reviewed orders\nTalked pricing\nNext steps agreed',
          actions: 'Send quote\nFollow up on samples', actionsDone: [], recapSent: !open,
        }, owner);
      }
    }
  }
});
console.log(`Seeded ${customers} customers and ${appointments} appointments in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
console.log('Accounts: alec (TSM + Admin), dana (director), rsm0–rsm4, tsm0–tsm' + (REPS - 1) + '. Password: password12345');
