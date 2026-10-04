import mongoose, { Schema, type Model } from 'mongoose';
import type { ContactInput, SiteContent } from '../validators/content.js';

const contentDocumentSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'site' },
    content: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, versionKey: false },
);

const contactDocumentSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 100 },
    email: { type: String, required: true, maxlength: 254 },
    phone: { type: String, required: true, maxlength: 20 },
    message: { type: String, required: true, maxlength: 2000 },
    consent: { type: Boolean, required: true, default: true },
  },
  { timestamps: true, versionKey: false },
);

type ContentDocument = { key: string; content: SiteContent };
type ContactDocument = ContactInput;

export const ContentModel: Model<ContentDocument> =
  (mongoose.models.SiteContent as Model<ContentDocument>) ??
  mongoose.model<ContentDocument>('SiteContent', contentDocumentSchema);
export const ContactModel: Model<ContactDocument> =
  (mongoose.models.Contact as Model<ContactDocument>) ??
  mongoose.model<ContactDocument>('Contact', contactDocumentSchema);
