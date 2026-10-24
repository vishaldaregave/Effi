import type { ImagePickerAsset } from "expo-image-picker";

export const MAX_REPORT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_REPORT_VIDEO_BYTES = 25 * 1024 * 1024;

export type ReportMediaKind = "image" | "video";

export type SelectedReportMedia = {
  uri: string;
  kind: ReportMediaKind;
  mediaType: string;
  fileName: string;
  sizeBytes: number;
};

const fallbackExtension = (kind: ReportMediaKind): string =>
  kind === "image" ? "jpg" : "mp4";

export const selectedReportMedia = (
  asset: ImagePickerAsset,
  fallbackSizeBytes?: number,
): SelectedReportMedia => {
  const kind: ReportMediaKind = asset.type === "video" ? "video" : "image";
  const sizeBytes =
    asset.fileSize ??
    (asset as { file?: { size?: number } }).file?.size ??
    fallbackSizeBytes ??
    0;
  if (sizeBytes <= 0) throw new Error("This file's size could not be read.");
  const maxBytes =
    kind === "image" ? MAX_REPORT_IMAGE_BYTES : MAX_REPORT_VIDEO_BYTES;
  if (sizeBytes > maxBytes) {
    throw new Error(
      kind === "image"
        ? "Choose an image smaller than 10 MB."
        : "Choose a video smaller than 25 MB.",
    );
  }
  const mediaType =
    asset.mimeType ?? (kind === "image" ? "image/jpeg" : "video/mp4");
  if (!mediaType.startsWith(`${kind}/`)) {
    throw new Error(`Choose a valid ${kind} file.`);
  }
  return {
    uri: asset.uri,
    kind,
    mediaType,
    fileName:
      asset.fileName ?? `effi-report-${Date.now()}.${fallbackExtension(kind)}`,
    sizeBytes,
  };
};

export const readableUploadError = (error: unknown): string =>
  error instanceof Error && error.message.trim()
    ? error.message
    : "The media could not be attached. Please try again.";
