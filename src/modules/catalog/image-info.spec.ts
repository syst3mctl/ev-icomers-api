import { describe, expect, it } from 'vitest';
import { readImageInfo } from './image-info.js';

// 3×2 პიქსელიანი სურათები (Pillow-ით შექმნილი)
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFElEQVR4XmM8ISfHAAZMEIqBgQEAEy4BCG2NhtEAAAAASUVORK5CYII=';
const JPEG =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDkKKKK8U/TD//Z';
const WEBP_LOSSY =
  'UklGRjoAAABXRUJQVlA4IC4AAACwAQCdASoDAAIAAUAmJaACdLoABDAAAP7x3I/4DdfFtMv/vYL/3YL/3YL/WwAA';
const WEBP_LOSSLESS = 'UklGRh4AAABXRUJQVlA4TBEAAAAvAkAAAAdQjyLXo/+BiOh/AAA=';

const b64 = (s: string) => Buffer.from(s, 'base64');

describe('readImageInfo', () => {
  it.each([
    ['png', PNG, 'png', 'image/png'],
    ['jpeg', JPEG, 'jpg', 'image/jpeg'],
    ['webp (lossy)', WEBP_LOSSY, 'webp', 'image/webp'],
    ['webp (lossless)', WEBP_LOSSLESS, 'webp', 'image/webp'],
  ])('%s → ტიპი და ზომა 3×2', (_, data, ext, contentType) => {
    const info = readImageInfo(b64(data));
    expect(info).toMatchObject({
      ext,
      content_type: contentType,
      width: 3,
      height: 2,
    });
  });

  it('სხვა ფაილი (მაგ. PDF ან ტექსტი) → null', () => {
    expect(readImageInfo(Buffer.from('%PDF-1.7 ...'))).toBeNull();
    expect(
      readImageInfo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull();
    expect(readImageInfo(Buffer.alloc(0))).toBeNull();
  });
});
