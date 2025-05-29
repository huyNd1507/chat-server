import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.REDIS_URL) {
  console.error("REDIS_URL is not defined in environment variables");
}

const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      console.log(`Redis reconnecting... Attempt ${retries}`);
      return Math.min(retries * 100, 3000);
    },
  },
});

redisClient.on("error", (err) => {
  console.error("Redis Client Error:", err);
  console.log("Current REDIS_URL:", process.env.REDIS_URL);
});

redisClient.on("connect", () => {
  console.log("Redis Client Connected Successfully");
  console.log("Connected to Redis at:", process.env.REDIS_URL);
});

export const connectRedis = async () => {
  try {
    if (!process.env.REDIS_URL) {
      throw new Error("REDIS_URL is not defined");
    }
    await redisClient.connect();
  } catch (error) {
    console.error("Redis connection error:", error);
    // Don't throw the error, just log it
    // This allows the app to continue running even if Redis is not available
  }
};

export const getRedisClient = () => redisClient;

// Helper functions for common Redis operations
export const setCache = async (key: string, value: any, expiry?: number) => {
  try {
    const stringValue = JSON.stringify(value);
    if (expiry) {
      await redisClient.set(key, stringValue, { EX: expiry });
    } else {
      await redisClient.set(key, stringValue);
    }
  } catch (error) {
    console.error("Redis set error:", error);
  }
};

export const getCache = async (key: string) => {
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error("Redis get error:", error);
    return null;
  }
};

export const deleteCache = async (key: string) => {
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error("Redis delete error:", error);
  }
};
