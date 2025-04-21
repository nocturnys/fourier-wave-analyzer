declare module 'fft.js' {
    export default class FFT {
      constructor(size: number);
      transform(
        realOutput: Float64Array, 
        imagOutput: Float64Array, 
        realInput: Float64Array, 
        imagInput: Float64Array
      ): void;
      // Другие методы библиотеки...
    }
  }