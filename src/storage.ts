import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

/** Reel (qisqa video) buferini S3'ga yuklaydi va public URL qaytaradi. */
export async function uploadReelToS3(buffer: Buffer, key: string, contentType = "video/mp4"): Promise<string> {
  await client().send(
    new PutObjectCommand({
      Bucket: config.awsBucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
    }),
  );
  const base = config.awsPublicBaseUrl || `https://${config.awsBucket}.s3.${config.awsRegion}.amazonaws.com`;
  return `${base.replace(/\/$/, "")}/${key}`;
}
