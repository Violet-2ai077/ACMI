import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('serves only the loopback synthetic Observer and refuses write requests', async () => {
  const allow = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'userprofile', 'home'])
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allow.has(key.toLowerCase())))
  const child = fork(fileURLToPath(new URL('../run.mjs', import.meta.url)), ['--serve', '--zstd'], {
    env: { ...env, DSH_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'ignore', 'ipc'], windowsHide: true,
  })
  const exit = once(child, 'exit')
  const lines = createInterface({ input: child.stdout })
  const ready = new Promise(resolve => {
    lines.on('line', line => {
      const match = /^Observer: (http:\/\/127\.0\.0\.1:\d+\/observer\/[a-f0-9]{48}) /u.exec(line)
      if (match) resolve(match[1])
    })
  })
  const bounded = (promise, ms) => Promise.race([promise, delay(ms, undefined, { ref: false })])
  try {
    const url = await bounded(Promise.race([ready, exit.then(() => undefined)]), 8000)
    if (!url) throw new Error('Isolated Observer did not start')
    const origin = new URL(url)
    expect(['3080', '13080']).not.toContain(origin.port)
    const get = (input, method = 'GET') => fetch(input, { method, signal: AbortSignal.timeout(3000) })
    const page = await get(url)
    expect(page.status).toBe(200)
    expect(page.headers.get('cache-control')).toBe('no-store')
    const html = await page.text()
    expect(html).toContain('Read-only')
    expect(html).toContain('Session-local binding revision 1')
    expect(html).not.toMatch(/not exported|<script|<form/u)
    expect((await get(origin.origin)).status).toBe(404)
    expect((await get(url, 'POST')).status).toBe(404)
  } finally {
    lines.close()
    if (child.connected) child.disconnect()
    if (!await bounded(exit, 3000)) {
      child.kill()
      await exit
      throw new Error('Isolated Observer did not shut down cleanly')
    }
  }
}, 15000)
