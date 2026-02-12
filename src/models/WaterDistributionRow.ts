import mongoose, { Document, Schema } from "mongoose";

export interface IWaterDistributionRow extends Document {
  batchId: mongoose.Types.ObjectId;
  municipality: string;
  bhssKitchenName: string;
  schoolName: string;
  beneficiaries: number;
  water: number;
  week1: number;
  week2: number;
  week3: number;
  week4: number;
  week5: number;
  total: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const waterDistributionRowSchema = new Schema<IWaterDistributionRow>(
  {
    batchId: { type: Schema.Types.ObjectId, ref: "WaterDistributionBatch", required: true },
    municipality: { type: String, required: true, trim: true },
    bhssKitchenName: { type: String, required: true, trim: true },
    schoolName: { type: String, required: true, trim: true },
    beneficiaries: { type: Number, required: true, default: 0 },
    water: { type: Number, required: true, default: 0 },
    week1: { type: Number, required: true, default: 0 },
    week2: { type: Number, required: true, default: 0 },
    week3: { type: Number, required: true, default: 0 },
    week4: { type: Number, required: true, default: 0 },
    week5: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

waterDistributionRowSchema.pre("validate", function () {
  const doc = this as IWaterDistributionRow;
  const w = Number.isFinite(doc.water) ? doc.water : 0;
  const total = Number.isFinite(doc.total) ? doc.total : 0;
  if (!total) doc.total = w;
});

waterDistributionRowSchema.index({ batchId: 1 });
waterDistributionRowSchema.index({ municipality: 1, bhssKitchenName: 1, schoolName: 1 });

export const WaterDistributionRow = mongoose.model<IWaterDistributionRow>(
  "WaterDistributionRow",
  waterDistributionRowSchema
);
