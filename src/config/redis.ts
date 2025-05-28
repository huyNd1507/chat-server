import { createClient } from "redis";
import dotenv from "dotenv";

dotenv.config();

const redisClient = createClient({
  url: process.env.REDIS_URL || "redis://localhost:6379",
});

redisClient.on("error", (err) => console.log("Redis Client Error", err));
redisClient.on("connect", () => console.log("Redis Client Connected"));

export const connectRedis = async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    console.error("Redis connection error:", error);
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
