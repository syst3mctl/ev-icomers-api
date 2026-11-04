/**
 * საცავის გასაღებიდან საჯარო მისამართი (API-ს ფესვიდან). ფაილს აბრუნებს
 * `MediaController` (`GET /v1/media/...`): S3 ბრაუზერისთვის მიუწვდომელია.
 */
export function mediaUrl(storageKey: string): string {
  return `/v1/media/${storageKey}`;
}

/** `products/<product_id>/<uuid>.<ext>` — სხვა ფორმის გასაღები media-დან არ გაიცემა */
export const PRODUCT_IMAGE_FILE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;
