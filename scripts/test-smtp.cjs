// Tests SMTP settings the same way Supabase uses them (a secure connection
// on port 465, then log in), and shows the email server's own reply -- so
// "Error sending confirmation email" turns into the actual reason.
// If the login works, it also sends you a test email.
//
// Run from the repo root:
//   node scripts/test-smtp.cjs
// Nothing is saved; the password is only sent to the email server.

const tls = require('tls');
const os = require('os');
const { ask } = require('./lib/script-helpers.cjs');

// One SMTP conversation: send a line, wait for the server's full reply --
// possibly several "250-..." lines, ending with one like "250 ...".
function smtpSession(host, port) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let waiting = null;

    const deliver = () => {
      if (!waiting) return;
      // Only complete lines count; the last piece may still be arriving.
      const lines = buffer.split('\r\n');
      const complete = lines.slice(0, -1);
      const end = complete.findIndex((l) => /^\d{3}(?: |$)/.test(l));
      if (end < 0) return;
      buffer = lines.slice(end + 1).join('\r\n');
      const w = waiting;
      waiting = null;
      w.resolve({ code: Number(complete[end].slice(0, 3)), text: complete.slice(0, end + 1).join('\n') });
    };

    const socket = tls.connect(
      { host, port, servername: host, rejectUnauthorized: process.env.SMTP_TEST_INSECURE !== '1' },
      () => resolve(session)
    );
    socket.setTimeout(20000, () => socket.destroy(new Error(`No answer from ${host}:${port} after 20 seconds.`)));
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      deliver();
    });
    socket.on('error', (e) => {
      if (!waiting) return reject(e);
      const w = waiting;
      waiting = null;
      w.reject(e);
    });
    // The server hanging up mid-conversation shouldn't leave us waiting.
    socket.on('close', () => {
      if (!waiting) return;
      const w = waiting;
      waiting = null;
      w.reject(new Error('The email server closed the connection.'));
    });

    const read = () =>
      new Promise((res, rej) => {
        waiting = { resolve: res, reject: rej };
        deliver();
      });
    const session = {
      read,
      send: (line) => {
        socket.write(`${line}\r\n`);
        return read();
      },
      // Say goodbye without waiting for the reply.
      quit: () => socket.end('QUIT\r\n'),
      close: () => socket.end(),
    };
  });
}

async function testSmtp({ host, port, username, password, sender, to, log = console.log }) {
  log(`\nConnecting to ${host}:${port} (secure connection)...`);
  const s = await smtpSession(host, port);
  try {
    const greeting = await s.read();
    if (greeting.code !== 220) throw new Error(`Unexpected greeting:\n${greeting.text}`);
    const ehlo = await s.send(`EHLO ${os.hostname() || 'localhost'}`);
    if (ehlo.code !== 250) throw new Error(`EHLO refused:\n${ehlo.text}`);
    log('Connected. Logging in...');

    const auth = await s.send('AUTH LOGIN');
    if (auth.code !== 334) throw new Error(`The server doesn't accept a login this way:\n${auth.text}`);
    await s.send(Buffer.from(username).toString('base64'));
    const login = await s.send(Buffer.from(password).toString('base64'));
    if (login.code !== 235) {
      return { ok: false, stage: 'login', reply: login.text };
    }
    log('Login accepted!');

    if (!to) return { ok: true };
    const steps = [
      [`MAIL FROM:<${sender}>`, 250, 'sender'],
      [`RCPT TO:<${to}>`, 250, 'recipient'],
      ['DATA', 354, 'message'],
    ];
    for (const [line, code, stage] of steps) {
      const r = await s.send(line);
      if (r.code !== code) return { ok: false, stage, reply: r.text };
    }
    const message = [
      `From: Al Paninos <${sender}>`,
      `To: <${to}>`,
      'Subject: Al Paninos SMTP test',
      `Date: ${new Date().toUTCString()}`,
      '',
      'Your SMTP settings work. Use the same ones in Supabase.',
      '.',
    ].join('\r\n');
    const sent = await s.send(message);
    if (sent.code !== 250) return { ok: false, stage: 'message', reply: sent.text };
    s.quit();
    return { ok: true, sent: true };
  } finally {
    s.close();
  }
}

function explain(result) {
  const reply = result.reply || '';
  if (/5\.7\.8|username and password not accepted|badcredentials/i.test(reply)) {
    return 'Gmail rejected the username or password. Make sure the username is your full Gmail address and the password is a\n' +
      'current app password (myaccount.google.com/apppasswords). Your normal Gmail password will not work.';
  }
  if (/application-specific password required|InvalidSecondFactor/i.test(reply)) {
    return 'Google wants an app password, not your normal password. Create one at myaccount.google.com/apppasswords.';
  }
  if (/not verified|domain/i.test(reply)) {
    return 'The sender address is not on a domain verified with this email service.';
  }
  if (/535|invalid|authentication/i.test(reply)) {
    return 'The email service rejected the login -- check the username and password.';
  }
  return 'See the server reply above.';
}

async function main() {
  console.log('Test SMTP settings (the ones you put in Supabase).\n');
  const host = (await ask('Host [smtp.gmail.com]: ')) || 'smtp.gmail.com';
  const port = Number((await ask('Port [465]: ')) || 465);
  const username = await ask('Username (your full Gmail address, or "resend"): ');
  const password = await ask('Password (Gmail app password / Resend API key): ', { hidden: true, preview: false });
  const sender = (await ask(`Sender email [${username.includes('@') ? username : ''}]: `)) || username;
  const to = (await ask(`Send a test email to [${sender}]: `)) || sender;
  if (!username || !password) throw new Error('Username and password are required.');

  const result = await testSmtp({ host, port, username, password, sender, to });
  if (result.ok) {
    console.log(`\nIt works -- a test email was sent to ${to} (check spam too).`);
    console.log('Use exactly these settings in Supabase: Authentication > Emails > SMTP Settings, then Save.');
  } else {
    console.log(`\nFailed at: ${result.stage}\nServer reply:\n${result.reply}\n\n${explain(result)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`\nStopped: ${e.message}`);
    process.exitCode = 1;
  });
}

module.exports = { testSmtp };
