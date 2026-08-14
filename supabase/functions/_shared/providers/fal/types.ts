export interface FalImage {
  url: string;
  content_type?: string;
  file_name?: string;
  file_size?: number;
  width?: number;
  height?: number;
}

export interface FalRemoveBackgroundInput {
  image_url: string;
  sync_mode: false;
}

export interface FalRemoveBackgroundOutput {
  image: FalImage;
}

export interface FalReplaceBackgroundInput {
  image_url: string;
  ref_image_url?: string;
  prompt?: string;
  negative_prompt: "";
  refine_prompt: true;
  fast: true;
  num_images: 1;
  sync_mode: false;
}

export interface FalReplaceBackgroundOutput {
  images: FalImage[];
  seed: number;
}

export interface FalVideoRemoveBackgroundInput {
  video_url: string;
  output_container_and_codec: "mp4_h264";
  preserve_audio: true;
  background_color: "Black";
  auto_zoom: false;
}

export interface FalVideoRemoveBackgroundOutput {
  video: FalImage;
  request_id: string;
}

export type FalJobInput =
  | FalRemoveBackgroundInput
  | FalReplaceBackgroundInput
  | FalVideoRemoveBackgroundInput;

export type FalQueueStatus =
  | { status: "IN_QUEUE"; request_id: string; queue_position?: number }
  | { status: "IN_PROGRESS"; request_id: string }
  | { status: "COMPLETED"; request_id: string };

export interface FalQueueSubmitResult {
  request_id: string;
}

export interface FalQueueResult<T> {
  data: T;
  requestId: string;
}

export interface FalQueueClientPort {
  submit(
    endpointId: string,
    options: { input: FalJobInput },
  ): Promise<FalQueueSubmitResult>;
  status(
    endpointId: string,
    options: { requestId: string; logs?: boolean },
  ): Promise<FalQueueStatus>;
  result<T>(
    endpointId: string,
    options: { requestId: string },
  ): Promise<FalQueueResult<T>>;
  cancel(endpointId: string, options: { requestId: string }): Promise<void>;
}

export interface FalClientPort {
  queue: FalQueueClientPort;
}
