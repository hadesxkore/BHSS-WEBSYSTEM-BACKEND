import mongoose, { Document, Schema } from "mongoose";

export interface IRiceDistributionRow extends Document {
  batchId: mongoose.Types.ObjectId;
  municipality: string;
  bhssKitchenName: string;
  schoolName: string;
  rice: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const riceDistributionRowSchema = new Schema<IRiceDistributionRow>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: "RiceDistributionBatch", required: true },
    municipality: { type: String, required: true, trim: true },
    bhssKitchenName: { type: String, required: true, trim: true },
    schoolName: { type: String, required: true, trim: true },
    rice: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

riceDistributionRowSchema.index({ batchId: 1 });
riceDistributionRowSchema.index({ municipality: 1, bhssKitchenName: 1, schoolName: 1 });

export const RiceDistributionRow = mongoose.model<IRiceDistributionRow>(
  "RiceDistributionRow",
  riceDistributionRowSchema
);
