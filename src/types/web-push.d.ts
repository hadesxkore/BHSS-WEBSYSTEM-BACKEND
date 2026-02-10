declare module "web-push" {
  type VapidSubject = string;

  export type WebPushSubscription = {
    endpoint: string;
    keys?: {
      p256dh?: string;
      auth?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };

  export interface WebPushClient {
    setVapidDetails(subject: VapidSubject, publicKey: string, privateKey: string): void;
    sendNotification(
      subscription: WebPushSubscription,
      payload?: string | Buffer,
      options?: Record<string, unknown>
    ): Promise<unknown>;
  }

  const webpush: WebPushClient;
  export default webpush;
}
