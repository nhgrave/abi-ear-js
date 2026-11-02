/// <reference lib="webworker" />
// Escuta contínua fora da thread da página: recebe as referências e os blocos de áudio, devolve as pegadas.
import { Listener } from '../engine/audio/listener'
import { SoundMatcher } from '../engine/audio/matcher'
import type { AudioIn, AudioOut } from './protocol'

let listener: Listener | null = null
const post = (m: AudioOut) => (self as unknown as Worker).postMessage(m)

self.onmessage = (e: MessageEvent<AudioIn>) => {
  const m = e.data
  if (m.type === 'refs') {
    const matcher = new SoundMatcher()
    for (const r of m.refs) matcher.addReference(r.soundId, r.samples, r.name)
    listener = new Listener(matcher)
    post({ type: 'ready' })
  } else if (m.type === 'audio' && listener) {
    const events = listener.push(m.samples, m.tStartMs)
    if (events.length) post({ type: 'events', events })
  }
}
