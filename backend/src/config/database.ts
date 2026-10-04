import mongoose from 'mongoose';

export async function connectDatabase(uri: string | undefined): Promise<boolean> {
  if (!uri) return false;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, connectTimeoutMS: 10_000 });
  return true;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}
