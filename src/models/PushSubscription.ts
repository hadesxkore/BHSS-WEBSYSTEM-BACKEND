import mongoose, { Document, Schema } from "mongoose";

export type WebPushKeys = {
  p256dh: string;
  auth: string;
};

export interface IPushSubscription extends Document {
  userId: mongoose.Types.ObjectId;
  endpoint: string;
  keys: WebPushKeys;
  createdAt?: Date;
  updatedAt?: Date;
}

const pushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, trim: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
  },
  { timestamps: true }
);

export const PushSubscription = mongoose.model<IPushSubscription>(
  "PushSubscription",
  pushSubscriptionSchema
);
