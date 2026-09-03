import { connect, type ChannelModel } from 'amqplib';

let connectionPromise: Promise<ChannelModel> | null = null;

async function getConnection(): Promise<ChannelModel> {
  if (!connectionPromise) {
    connectionPromise = connect(process.env.RABBITMQ_URL as string).catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }
  return connectionPromise;
}

export async function checkRabbitmq(): Promise<void> {
  const connection = await getConnection();
  try {
    const channel = await connection.createChannel();
    await channel.close();
  } catch (error) {
    connectionPromise = null;
    throw error;
  }
}

export { getConnection };
