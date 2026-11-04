import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { Env } from '../../config/env.js';

export type StoredObject = {
  body: Readable;
  content_type: string;
  content_length: number | undefined;
};

const CONTENT_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/**
 * ფაილების საცავი (პროდუქტის სურათები).
 *
 * - **S3** — როცა `S3_ENDPOINT` მითითებულია (usectl-ის S3 addon). S3 კლასტერის შიგნითაა
 *   და ბრაუზერისთვის მიუწვდომელია, ამიტომ ატვირთვაც და ჩვენებაც API-ზე გადის
 *   (`POST /v1/admin/products/{id}/images`, `GET /v1/media/...`).
 * - **ლოკალური დისკი** (`STORAGE_LOCAL_DIR`, ნაგულისხმევად `.storage/`) — S3-ის გარეშე,
 *   ლოკალური დეველოპმენტისთვის.
 *
 * გასაღები (`key`) ორივე შემთხვევაში ერთნაირია: `products/<product_id>/<uuid>.webp`.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly localDir: string;

  constructor(config: ConfigService<Env, true>) {
    const endpoint = config.get('S3_ENDPOINT', { infer: true });
    this.bucket = config.get('S3_BUCKET', { infer: true }) ?? '';
    this.localDir = resolve(config.get('STORAGE_LOCAL_DIR', { infer: true }));

    if (endpoint) {
      const useSsl = config.get('S3_USE_SSL', { infer: true });
      this.s3 = new S3Client({
        endpoint: /^https?:\/\//.test(endpoint)
          ? endpoint
          : `${useSsl ? 'https' : 'http'}://${endpoint}`,
        region: config.get('S3_REGION', { infer: true }),
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }) ?? '',
          secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }) ?? '',
        },
      });
    } else {
      this.s3 = null;
    }
  }

  get driver(): 's3' | 'local' {
    return this.s3 ? 's3' : 'local';
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
      return;
    }
    const path = this.localPath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  /** `null` — ფაილი არ არსებობს */
  async get(key: string): Promise<StoredObject | null> {
    if (this.s3) {
      try {
        const res = await this.s3.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        if (!res.Body) return null;
        return {
          body: res.Body as Readable,
          content_type: res.ContentType ?? contentTypeFor(key),
          content_length: res.ContentLength,
        };
      } catch (error) {
        if (error instanceof NoSuchKey) return null;
        throw error;
      }
    }
    const path = this.localPath(key);
    try {
      const info = await stat(path);
      return {
        body: createReadStream(path),
        content_type: contentTypeFor(key),
        content_length: info.size,
      };
    } catch {
      return null;
    }
  }

  /** წაშლა. ფაილი თუ უკვე აღარ არის — შეცდომა არ არის */
  async delete(key: string): Promise<void> {
    try {
      if (this.s3) {
        await this.s3.send(
          new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
        );
      } else {
        await rm(this.localPath(key), { force: true });
      }
    } catch (error) {
      // ჩანაწერი ბაზიდან უკვე წაშლილია; ობოლი ფაილი მხოლოდ ადგილს იკავებს
      this.logger.warn({ err: error, key }, 'storage delete failed');
    }
  }

  /** `key` საცავის საქაღალდიდან ვერ გავა (`../`) */
  private localPath(key: string): string {
    const path = resolve(this.localDir, key);
    if (!path.startsWith(this.localDir + sep)) {
      throw new Error(`invalid storage key: ${key}`);
    }
    return path;
  }
}

function contentTypeFor(key: string): string {
  return CONTENT_TYPES[extname(key).toLowerCase()] ?? 'application/octet-stream';
}
