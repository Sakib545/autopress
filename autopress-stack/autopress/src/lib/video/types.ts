/**
 * Contract for the external short-form video service (MoneyPrinterTurbo).
 *
 * MoneyPrinterTurbo is deliberately NOT vendored into this application. It runs
 * as its own service and is reached over HTTP only, so it can be restarted,
 * scaled, or removed without touching the publishing platform.
 */

export type VideoAspect = '9:16' | '16:9' | '1:1';
export type VideoSource = 'pexels' | 'pixabay' | 'local';

/**
 * Narration script plus everything derived from the article alongside it.
 * `title` and `description` are the social-post copy; `script` is spoken.
 */
export interface VideoScript {
  script: string;
  terms: string[];
  wordCount: number;
  title: string;
  description: string;
  /** True when the deterministic fallback produced this, not the model. */
  fallback: boolean;
}

/** Parameters snapshotted onto the ArticleVideo row before dispatch. */
export interface VideoGenerationParams {
  aspect: VideoAspect;
  source: VideoSource;
  language: string;
  voiceName?: string;
  subtitles: boolean;
  bgMusic: boolean;
  count: number;
}

/** Request body for POST /api/v1/videos. */
export interface MptVideoRequest {
  video_subject: string;
  video_script: string;
  video_terms?: string[];
  video_aspect: VideoAspect;
  video_source: VideoSource;
  video_concat_mode?: 'random' | 'sequential';
  video_clip_duration?: number;
  video_count: number;
  video_language: string;
  /** Required in practice — MPT does not default an empty voice. */
  voice_name: string;
  voice_volume?: number;
  bgm_type?: 'random' | 'none';
  bgm_volume?: number;
  subtitle_enabled: boolean;
  subtitle_position?: 'top' | 'center' | 'bottom';
  /** MPT ships a Chinese default; Latin scripts need an explicit font. */
  font_name?: string;
  font_size?: number;
  stroke_width?: number;
}

/** MoneyPrinterTurbo wraps responses as { status, message, data }. */
export interface MptEnvelope<T> {
  status: number;
  message?: string;
  data: T;
}

export interface MptCreateTaskData {
  task_id: string;
}

export type MptTaskState =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETE'
  | 'FAILED';

export interface MptTaskData {
  /**
   * Whatever MoneyPrinterTurbo reported. Deliberately widened to `string`:
   * different MPT builds emit different casings and words, and normaliseState()
   * is responsible for reducing them to MptTaskState. Narrowing this type would
   * make the code look safe while the wire format stayed unpredictable.
   */
  state: number | string;
  progress?: number;
  videos?: string[];
  combined_videos?: string[];
  audio_file?: string;
  subtitle_path?: string;
  error?: string;
  message?: string;
}

/** Normalised task status, independent of MPT's numeric/string state quirks. */
export interface VideoTaskStatus {
  state: 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';
  progress: number;
  /** Openable URL, or null when MPT returned nothing we can safely serve. */
  videoUrl: string | null;
  /** Exactly what MPT reported, kept for debugging when videoUrl is null. */
  rawPaths: string[];
  /** Why videoUrl is null despite a completed task. */
  urlError?: string;
  error?: string;
}

export interface VideoServiceClient {
  isConfigured(): boolean;
  createTask(req: MptVideoRequest): Promise<string>;
  getTask(taskId: string): Promise<VideoTaskStatus>;
  ping(): Promise<boolean>;
}

export class VideoServiceUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `MoneyPrinterTurbo is unreachable: ${detail}. ` +
        `The article remains published — only the video job failed and will be retried.`,
    );
    this.name = 'VideoServiceUnavailableError';
  }
}

export class VideoServiceDisabledError extends Error {
  constructor() {
    super('Video generation is disabled. Set MPT_ENABLED=true and configure MPT_API_URL.');
    this.name = 'VideoServiceDisabledError';
  }
}
