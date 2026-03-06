import mongoose, { Schema, Document } from "mongoose";

export interface IActivityField {
    id: string;
    type: "text" | "textarea" | "number" | "date";  // what the user fills in
    label: string;          // question title
    description: string;    // question description shown to users
    required: boolean;
    photoUrl: string;       // one admin-uploaded image per question
    unit: string;           // fixed unit shown to users (PCS, Unit, Box, etc.)
    placeholder: string;
}

export interface IActivity extends Document {
    title: string;
    description: string;
    isActive: boolean;
    fields: IActivityField[];
    createdAt: Date;
    updatedAt: Date;
}

const ActivityFieldSchema = new Schema<IActivityField>(
    {
        id: { type: String, required: true },
        type: { type: String, enum: ["text", "textarea", "number", "date"], required: true },
        label: { type: String, required: true },
        description: { type: String, default: "" },
        required: { type: Boolean, default: false },
        photoUrl: { type: String, default: "" },
        unit: { type: String, default: "" },
        placeholder: { type: String, default: "" },
    },
    { _id: false }
);

const ActivitySchema = new Schema<IActivity>(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        isActive: { type: Boolean, default: true },
        fields: { type: [ActivityFieldSchema], default: [] },
    },
    { timestamps: true }
);

export const Activity = mongoose.model<IActivity>("Activity", ActivitySchema);
