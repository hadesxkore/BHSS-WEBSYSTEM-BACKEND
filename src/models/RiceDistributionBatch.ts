import mongoose, { Document, Schema } from "mongoose";

export interface IRiceDistributionBatch extends Document {
  municipality?: string;
  bhssKitchenName: string;
  contentHash: string;
  sheetName?: string;
  sourceFileName?: string;
  uploadedByUserId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const riceDistributionBatchSchema = new Schema<IRiceDistributionBatch>(
  {
    municipality: { type: String, required: false, default: "ALL", trim: true },
    bhssKitchenName: { type: String, required: true, trim: true },
    contentHash: { type: String, required: true, trim: true },
    sheetName: { type: String, required: false, default: "", trim: true },
    sourceFileName: { type: String, required: false, default: "", trim: true },
    uploadedByUserId: { type: String, required: false, default: "", trim: true },
  },
  { timestamps: true }
);

riceDistributionBatchSchema.index({ municipality: 1, bhssKitchenName: 1, createdAt: -1 });
riceDistributionBatchSchema.index({ contentHash: 1 }, { unique: true });

export const RiceDistributionBatch = mongoose.model<IRiceDistributionBatch>(
  "RiceDistributionBatch",
  riceDistributionBatchSchema
);
