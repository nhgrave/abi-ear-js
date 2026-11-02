// Junta os canais em mono e manda blocos de 4096 amostras com o número da primeira amostra (cópia do gravador).
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  process(
    inputs: Float32Array[][],
    outputs?: Float32Array[][],
    parameters?: Record<string, Float32Array>,
  ): boolean
}

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: any) => AudioWorkletProcessor,
): void

declare const currentFrame: number

class CaptureProcessor extends AudioWorkletProcessor {
  private buffer = new Float32Array(4096)
  private bufferIndex = 0
  private chunkStartFrame = 0

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]
    if (!input || input.length === 0) {
      return true
    }

    const numChannels = input.length
    const numSamples = input[0].length

    for (let i = 0; i < numSamples; i++) {
      if (this.bufferIndex === 0) {
        this.chunkStartFrame = currentFrame + i
      }

      let sum = 0
      for (let ch = 0; ch < numChannels; ch++) {
        sum += input[ch][i]
      }
      this.buffer[this.bufferIndex++] = sum / numChannels

      if (this.bufferIndex === 4096) {
        this.port.postMessage({
          frame: this.chunkStartFrame,
          samples: this.buffer.slice(),
        })
        this.bufferIndex = 0
      }
    }

    return true
  }
}

registerProcessor('capture', CaptureProcessor)
export {} // módulo: as declarações acima não colidem com as do gravador
