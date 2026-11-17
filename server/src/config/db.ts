import dns from 'node:dns';
import mongoose from 'mongoose';

/**
 * Establishes the Mongoose connection to MongoDB Atlas.
 */
export async function connectDatabase(mongoUri: string): Promise<void> {
  // Node's c-ares resolver on Windows falls back to 127.0.0.1 when adapter DNS
  // cannot be read, which causes querySrv ECONNREFUSED on mongodb+srv:// URIs.
  const servers = dns.getServers();
  const isLoopbackOnly = servers.every((ip) => ip === '127.0.0.1' || ip === '::1');
  if (mongoUri.startsWith('mongodb+srv://') && isLoopbackOnly) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
  }

  await mongoose.connect(mongoUri);
  console.log('MongoDB connected');
}
