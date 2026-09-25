declare module 'heic-decode' {
  type Decoded = { width: number; height: number; data: Uint8ClampedArray };
  type Lazy = { width: number; height: number; decode: () => Promise<Decoded> };
  interface Decode {
    (input: { buffer: ArrayBufferLike | Uint8Array }): Promise<Decoded>;
    all(input: { buffer: ArrayBufferLike | Uint8Array }): Promise<Lazy[] & { dispose: () => void }>;
  }
  const decode: Decode;
  export default decode;
}
