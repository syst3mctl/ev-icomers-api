export type ImageInfo = {
  type: 'jpeg' | 'png' | 'webp';
  ext: 'jpg' | 'png' | 'webp';
  content_type: string;
  width: number | null;
  height: number | null;
};

/**
 * სურათის ტიპი და ზომა ფაილის შიგთავსიდან (და არა სახელიდან ან ბრაუზერის
 * `Content-Type`-იდან, რომელიც შეიძლება ტყუილი იყოს). დამატებითი ბიბლიოთეკის გარეშე:
 * JPEG, PNG, WebP. სხვა ფორმატი → `null`.
 */
export function readImageInfo(buf: Buffer): ImageInfo | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    // PNG: IHDR ყოველთვის პირველია — width/height 16-ე ბაიტიდან
    return {
      type: 'png',
      ext: 'png',
      content_type: 'image/png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    const size = jpegSize(buf);
    return {
      type: 'jpeg',
      ext: 'jpg',
      content_type: 'image/jpeg',
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  }
  if (
    buf.length >= 16 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    const size = webpSize(buf);
    return {
      type: 'webp',
      ext: 'webp',
      content_type: 'image/webp',
      width: size?.width ?? null,
      height: size?.height ?? null,
    };
  }
  return null;
}

type Size = { width: number; height: number };

/** JPEG: ვეძებთ SOF მარკერს (0xC0–0xCF, გარდა C4, C8, CC) */
function jpegSize(buf: Buffer): Size | null {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: buf.readUInt16BE(offset + 5),
        width: buf.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

/** WebP: VP8 (lossy), VP8L (lossless), VP8X (extended) */
function webpSize(buf: Buffer): Size | null {
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ' && buf.length >= 30) {
    return {
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && buf.length >= 25) {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X' && buf.length >= 30) {
    return {
      width: 1 + buf.readUIntLE(24, 3),
      height: 1 + buf.readUIntLE(27, 3),
    };
  }
  return null;
}
