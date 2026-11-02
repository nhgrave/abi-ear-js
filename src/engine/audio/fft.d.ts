// O fft.js 4.0.4 não traz tipos; só declaramos o que o matcher usa.
declare module 'fft.js' {
  export default class FFT {
    constructor(size: number)
    readonly size: number
    createComplexArray(): Float64Array
    /** Entrada e saída complexas intercaladas (re, im, re, im...). */
    transform(out: Float64Array, data: Float64Array): void
    /** Já dividida por `size`. */
    inverseTransform(out: Float64Array, data: Float64Array): void
  }
}
