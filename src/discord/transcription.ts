import { readFile } from "node:fs/promises";
import type { DiscordTranscriptionConfig } from "../config/types.discord.js";
import { logVerbose } from "../globals.js";
import { groqProvider } from "../media-understanding/providers/groq/index.js";

const SUPPORTED_AUDIO_FORMATS = [".ogg", ".mp3", ".wav", ".m4a", ".webm", ".oga", ".opus"];
const DEFAULT_MAX_FILE_SIZE_MB = 25;
const DEFAULT_MODEL = "whisper-large-v3";

export type TranscriptionResult = {
  text: string;
  success: boolean;
  error?: string;
};

function isAudioFile(filename: string, contentType?: string): boolean {
  if (contentType?.startsWith("audio/")) {
    return true;
  }
  const lowerFilename = filename.toLowerCase();
  return SUPPORTED_AUDIO_FORMATS.some((ext) => lowerFilename.endsWith(ext));
}

export async function transcribeAudioFile(params: {
  filePath: string;
  filename: string;
  contentType?: string;
  config: DiscordTranscriptionConfig;
  fileSize?: number;
}): Promise<TranscriptionResult> {
  const { filePath, filename, contentType, config, fileSize } = params;

  // Check if file is audio
  if (!isAudioFile(filename, contentType)) {
    return { text: "", success: false };
  }

  // Check file size limit
  const maxSizeMB = config.maxFileSizeMB ?? DEFAULT_MAX_FILE_SIZE_MB;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (fileSize && fileSize > maxSizeBytes) {
    logVerbose(
      `discord: skipping transcription for ${filename} (size ${fileSize} exceeds limit ${maxSizeBytes})`,
    );
    return { text: "", success: false, error: "File size exceeds limit" };
  }

  // Get API key
  const apiKey = config.apiKey;
  if (!apiKey) {
    logVerbose("discord: transcription enabled but no API key configured");
    return { text: "", success: false, error: "No API key configured" };
  }

  try {
    // Read file buffer
    const buffer = await readFile(filePath);

    // Transcribe using Groq provider
    const model = config.model ?? DEFAULT_MODEL;
    const result = await groqProvider.transcribeAudio!({
      buffer,
      fileName: filename,
      mime: contentType,
      apiKey,
      model,
      timeoutMs: 30000, // 30 second timeout
    });

    logVerbose(`discord: transcribed ${filename} successfully (${result.text.length} chars)`);
    return { text: result.text, success: true };
  } catch (err) {
    const errorMsg = String(err);
    logVerbose(`discord: transcription failed for ${filename}: ${errorMsg}`);
    return { text: "", success: false, error: errorMsg };
  }
}

export function shouldTranscribe(
  config: DiscordTranscriptionConfig | undefined,
  filename: string,
  contentType?: string,
): boolean {
  if (!config?.enabled) {
    return false;
  }
  if (!config.apiKey) {
    return false;
  }
  return isAudioFile(filename, contentType);
}
