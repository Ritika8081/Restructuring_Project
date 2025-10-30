export class FFT {
  size: number;
  cosTable: Float32Array;
  sinTable: Float32Array;
  constructor(size: number) {
    if ((size & (size - 1)) !== 0) {
      throw new Error('FFT size must be a power of two');
    }
    this.size = size;
    this.cosTable = new Float32Array(size / 2);
    this.sinTable = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cosTable[i] = Math.cos(-2 * Math.PI * i / size);
      this.sinTable[i] = Math.sin(-2 * Math.PI * i / size);
    }
  }

  fft(real: Float32Array, imag: Float32Array) {
    const n = this.size;
    if (real.length !== n || imag.length !== n) {
      throw new Error('real and imag arrays must have length equal to FFT size');
    }
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
      if (i < j) {
        const tmpR = real[i];
        const tmpI = imag[i];
        real[i] = real[j];
        imag[i] = imag[j];
        real[j] = tmpR;
        imag[j] = tmpI;
      }
      let k = n >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      for (let i = 0; i < n; i += len) {
        for (let j = i, k = 0; j < i + half; j++, k++) {
          const tRe = real[j + half] * this.cosTable[(this.size / len) * k] - imag[j + half] * this.sinTable[(this.size / len) * k];
          const tIm = real[j + half] * this.sinTable[(this.size / len) * k] + imag[j + half] * this.cosTable[(this.size / len) * k];
          real[j + half] = real[j] - tRe;
          imag[j + half] = imag[j] - tIm;
          real[j] += tRe;
          imag[j] += tIm;
        }
      }
    }
  }

  computeMagnitudes(input: Float32Array): Float32Array {
    if (input.length !== this.size) {
      throw new Error('input length must equal FFT size');
    }
    const real = new Float32Array(this.size);
    const imag = new Float32Array(this.size);
    real.set(input);
    this.fft(real, imag);
    const mags = new Float32Array(this.size / 2);
    for (let i = 0; i < mags.length; i++) {
      mags[i] = Math.hypot(real[i], imag[i]) / (this.size / 2);
    }
    return mags;
  }
}
