import mongoose, { Document, Schema } from "mongoose";

export interface ILpgDistributionRow extends Document {
  batchId: mongoose.Types.ObjectId;
  municipality: string;
  bhssKitchenName: string;
  schoolName: string;
  gasul: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const lpgDistributionRowSchema = new Schema<ILpgDistributionRow>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: "LpgDistributionBatch", required: true },
    municipality: { type: String, required: true, trim: true },
    bhssKitchenName: { type: String, required: true, trim: true },
    schoolName: { type: String, required: true, trim: true },
    gasul: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

lpgDistributionRowSchema.index({ batchId: 1 });
lpgDistributionRowSchema.index({ municipality: 1, bhssKitchenName: 1, schoolName: 1 });

export const LpgDistributionRow = mongoose.model<ILpgDistributionRow>(
  "LpgDistributionRow",
  lpgDistributionRowSchema
);
