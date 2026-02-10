import mongoose, { Document, Schema } from "mongoose";

export type DeliveryStatus = "Pending" | "Delivered" | "Delayed" | "Cancelled";

export interface IDeliveryImage {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface IDeliveryRecord extends Document {
  userId: mongoose.Types.ObjectId;
  dateKey: string;
  categoryKey: string;
  categoryLabel: string;
  status: DeliveryStatus;
  statusReason?: string;
  statusUpdatedAt?: Date;
  uploadedAt?: Date;
  concerns: string[];
  remarks: string;
  images: IDeliveryImage[];
  createdAt?: Date;
  updatedAt?: Date;
}

const deliveryImageSchema = new Schema<IDeliveryImage>(
  {
    filename: { type: String, required: true, trim: true },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const deliveryRecordSchema = new Schema<IDeliveryRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    dateKey: { type: String, required: true, trim: true, index: true },
    categoryKey: { type: String, required: true, trim: true, index: true },
    categoryLabel: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["Pending", "Delivered", "Delayed", "Cancelled"],
      default: "Pending",
    },
    statusReason: { type: String, required: false, default: "" },
    statusUpdatedAt: { type: Date, required: false },
    uploadedAt: { type: Date, required: false },
    concerns: { type: [String], required: true, default: [] },
    remarks: { type: String, required: true, default: "" },
    images: { type: [deliveryImageSchema], required: true, default: [] },
  },
  { timestamps: true }
);

deliveryRecordSchema.index({ userId: 1, dateKey: 1, categoryKey: 1 }, { unique: true });

deliveryRecordSchema.index({ userId: 1, dateKey: 1, uploadedAt: -1 });

export const DeliveryRecord = mongoose.model<IDeliveryRecord>(
  "DeliveryRecord",
  deliveryRecordSchema
);
