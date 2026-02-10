import mongoose, { Document, Schema } from "mongoose";

export type EventAttachment = {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
};

export type EventStatus = "Scheduled" | "Cancelled";

export interface IEvent extends Document {
  title: string;
  description: string;
  dateKey: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: EventStatus;
  cancelReason?: string;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;
  attachment?: EventAttachment;
  createdBy: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const attachmentSchema = new Schema<EventAttachment>(
  {
    filename: { type: String, required: true, trim: true },
    originalName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    url: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const eventSchema = new Schema<IEvent>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: false, default: "", trim: true, maxlength: 2000 },
    dateKey: { type: String, required: true, trim: true, index: true },
    startTime: { type: String, required: true, trim: true },
    endTime: { type: String, required: true, trim: true },
    status: {
      type: String,
      required: true,
      enum: ["Scheduled", "Cancelled"],
      default: "Scheduled",
      index: true,
    },
    cancelReason: { type: String, required: false, trim: true, maxlength: 500 },
    cancelledAt: { type: Date, required: false },
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User", required: false, index: true },
    attachment: { type: attachmentSchema, required: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  { timestamps: true }
);

eventSchema.index({ dateKey: 1, startTime: 1 });

export const Event = mongoose.model<IEvent>("Event", eventSchema);
