import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config";

let s3: S3Client | null = null;

export function s3Enabled(): boolean {
  return !!(config.awsBucket && config.awsRegion && config.awsAccessKeyId && config.awsSecretAccessKey);
}

function client(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: config.awsRegion,
      credentials: { accessKeyId: config.awsAccessKeyId, secretAccessKey: config.awsSecretAccessKey },
    });
  }
  return s3;
}

/** Reel buferini S3'ga yuklaydi (private). */
export async function putReelToS3(buffer: Buffer, key: string, contentType = "video/mp4"): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: config.awsBucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
    }),
  );
}

/** CloudFront/public domen orqali to'g'ridan-to'g'ri URL (AWS_PUBLIC_BASE_URL bo'lsa). */
export function publicUrlFor(key: string): string {
  const base = config.awsPublicBaseUrl || `https://${config.awsBucket}.s3.${config.awsRegion}.amazonaws.com`;
  return `${base.replace(/\/$/, "")}/${key}`;
}

/** Private obyekt uchun vaqtinchalik (presigned) GET URL — bucket public bo'lishi shart emas. */
export async function presignReelUrl(key: string, expiresIn = 86400): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: config.awsBucket, Key: key }), { expiresIn });
}
