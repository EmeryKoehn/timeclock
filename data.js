const crypto = require('crypto');
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

// Each person has their own passcode (set in Vercel > Settings > Environment Variables)
const PEOPLE = [
  { id: 'emery', name: 'Emery', pass: process.env.PASS_EMERY },
  { id: 'ethan', name: 'Ethan', pass: process.env.PASS_ETHAN },
];

const same = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const given = req.headers['x-passcode'] || '';
  const person = given && PEOPLE.find((p) => p.pass && same(p.pass, given));
  if (!person) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return res.status(401).json({ error: 'bad passcode' });
  }
  if (!URL_ || !TOKEN) return res.status(500).json({ error: 'database not connected' });
  const key = 'timeclock:' + person.id;
  try {
    if (req.method === 'GET') {
      const raw = await redis(['GET', key]);
      return res.status(200).json({ name: person.name, state: raw ? JSON.parse(raw) : null });
    }
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || !body.state || !body.state.users) return res.status(400).json({ error: 'bad data' });
      await redis(['SET', key, JSON.stringify(body.state)]);
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server error' });
  }
};
