import mongoose, { Document, Schema } from "mongoose";

export interface IWaterDistributionBatch extends Document {
  municipality?: string;
  bhssKitchenName: string;
  contentHash: string;
  sheetName?: string;
  sourceFileName?: string;
  uploadedByUserId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const waterDistributionBatchSchema = new Schema<IWaterDistributionBatch>(
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

waterDistributionBatchSchema.index({ municipality: 1, bhssKitchenName: 1, createdAt: -1 });
waterDistributionBatchSchema.index({ contentHash: 1 }, { unique: true });

export const WaterDistributionBatch = mongoose.model<IWaterDistributionBatch>(
  "WaterDistributionBatch",
  waterDistributionBatchSchema
);
