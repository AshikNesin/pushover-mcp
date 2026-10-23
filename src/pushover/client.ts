const API_BASE_URL = "https://api.pushover.net/1";

export interface PushoverCredentials {
  /** Application API token. */
  token: string;
  /** User or group key that receives notifications. */
  user: string;
}

export type Priority = -2 | -1 | 0 | 1 | 2;

export interface Attachment {
  /** Base64-encoded image data. */
  base64: string;
  /** MIME type, e.g. `image/png`. */
  type: string;
}

/** A notification as accepted by `POST /messages.json`. */
export interface PushoverMessage {
  message: string;
  title?: string;
  html?: boolean;
  monospace?: boolean;
  url?: string;
  url_title?: string;
  priority?: Priority;
  /** Seconds between retries for emergency notifications (min 30). */
  retry?: number;
  /** Seconds until emergency retries stop (max 10800). */
  expire?: number;
  callback?: string;
  tags?: string[];
  sound?: string;
  /** Device name, or several joined with commas. */
  device?: string;
  /** Unix timestamp shown instead of the time Pushover received the message. */
  timestamp?: number;
  /** Seconds before the notification is deleted from devices. */
  ttl?: number;
  attachment?: Attachment;
}

export interface SendResult {
  request: string;
  /** Present for emergency (priority 2) notifications. */
  receipt?: string;
}

/** Receipt status. Timestamps are Unix seconds, `0` when the event has not happened. */
export interface Receipt {
  acknowledged: 0 | 1;
  acknowledged_at: number;
  acknowledged_by: string;
  acknowledged_by_device: string;
  last_delivered_at: number;
  expired: 0 | 1;
  expires_at: number;
  called_back: 0 | 1;
  called_back_at: number;
}

export interface UserValidation {
  group?: 0 | 1;
  devices: string[];
  licenses: string[];
}

export interface Limits {
  limit: number;
  remaining: number;
  /** Unix timestamp when the monthly count resets. */
  reset: number;
}

interface ApiResponse {
  status: number;
  request: string;
  errors?: string[];
}

type Params = Record<string, string | number | boolean | undefined>;

export class PushoverError extends Error {
  override readonly name = "PushoverError";

  constructor(
    message: string,
    /** HTTP status, or `0` when Pushover could not be reached. */
    readonly status: number,
    readonly errors: string[] = [],
  ) {
    super(message);
  }
}

/** Minimal typed client for the Pushover API. */
export class PushoverClient {
  constructor(private readonly credentials: PushoverCredentials) {}

  sendMessage({ tags, attachment, ...message }: PushoverMessage): Promise<SendResult> {
    return this.request("POST", "messages.json", {
      user: this.credentials.user,
      ...message,
      tags: tags?.join(","),
      attachment_base64: attachment?.base64,
      attachment_type: attachment?.type,
    });
  }

  getReceipt(receipt: string): Promise<Receipt> {
    return this.request("GET", `receipts/${encodeURIComponent(receipt)}.json`);
  }

  async cancelReceipt(receipt: string): Promise<void> {
    await this.request("POST", `receipts/${encodeURIComponent(receipt)}/cancel.json`);
  }

  async cancelReceiptsByTag(tag: string): Promise<void> {
    await this.request("POST", `receipts/cancel_by_tag/${encodeURIComponent(tag)}.json`);
  }

  async listSounds(): Promise<Record<string, string>> {
    const { sounds } = await this.request<{ sounds: Record<string, string> }>("GET", "sounds.json");
    return sounds;
  }

  validateUser(device?: string): Promise<UserValidation> {
    return this.request("POST", "users/validate.json", { user: this.credentials.user, device });
  }

  getLimits(): Promise<Limits> {
    return this.request("GET", "apps/limits.json");
  }

  private async request<T>(method: "GET" | "POST", path: string, params: Params = {}): Promise<T> {
    const form = toForm({ token: this.credentials.token, ...params });
    const url = new URL(`${API_BASE_URL}/${path}`);
    if (method === "GET") url.search = form.toString();

    let response: Response;
    try {
      response = await fetch(url, { method, body: method === "POST" ? form : undefined });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new PushoverError(`Could not reach Pushover: ${reason}`, 0);
    }

    const data = (await response.json().catch(() => undefined)) as (T & ApiResponse) | undefined;
    if (!response.ok || data?.status !== 1) {
      const errors = data?.errors ?? [];
      const detail = errors.length > 0 ? errors.join("; ") : response.statusText;
      throw new PushoverError(
        `Pushover API error (HTTP ${response.status}): ${detail}`,
        response.status,
        errors,
      );
    }
    return data;
  }
}

/** Encodes params as form fields: drops unset values and sends `true` as `1`. */
function toForm(params: Params): URLSearchParams {
  const form = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === false) continue;
    form.set(key, value === true ? "1" : String(value));
  }
  return form;
}
