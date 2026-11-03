import { concat, crc32, utf8 } from './bytes';

const u16 = (n: number) => Uint8Array.from([n & 255, (n >> 8) & 255]);
const u32 = (n: number) => Uint8Array.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255]);

/** ZIP sin compresión (método 0): alcanza para .xlsx y es determinista. Fecha fija para que el archivo sea reproducible. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const DATE = ((2026 - 1980) << 9) | (1 << 5) | 1, TIME = 0;
  const chunks: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = utf8(f.name), crc = crc32(f.data);
    const head = concat([u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(TIME), u16(DATE), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), name]);
    chunks.push(head, f.data);
    central.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(TIME), u16(DATE), u32(crc), u32(f.data.length), u32(f.data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += head.length + f.data.length;
  }
  const cd = concat(central);
  return concat([...chunks, cd, u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(offset), u16(0)]);
}
