/** O events.jsonl de uma gravação: um JSON por linha, escrito em ordem, sem segurar a página. */
export type TextSink = { write(data: string): Promise<void>; close(): Promise<void> }

export class EventLog {
  private queue: Promise<void> = Promise.resolve()
  private failure: unknown = null
  private count = 0
  private closed = false

  constructor(private sink: TextSink) {}

  /** O primeiro erro de escrita, assim que acontece (null enquanto tudo vai bem). */
  get error(): unknown {
    return this.failure
  }

  append(event: unknown): void {
    if (this.closed) return
    this.count++
    const line = JSON.stringify(event) + '\n'
    this.queue = this.queue.then(async () => {
      if (this.failure !== null) return
      try {
        await this.sink.write(line)
      } catch (err) {
        this.failure = err
      }
    })
  }

  /** Espera o que falta, fecha o arquivo e devolve quantas linhas foram pedidas. */
  async finish(): Promise<number> {
    this.closed = true
    await this.queue
    if (this.failure !== null) {
      await this.sink.close().catch(() => {})
      throw this.failure
    }
    await this.sink.close()
    return this.count
  }
}
