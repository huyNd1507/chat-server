import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env file
// const result = dotenv.config({ path: path.resolve(__dirname, "../../.env") });
const envPath = path.resolve(process.cwd(), ".env");
const result = dotenv.config({ path: envPath });
// console.log("result:", result);
if (result.error) {
  console.error("Error loading .env file:", result.error);
  process.exit(1);
}

// Validate required environment variables
const requiredEnvVars = ["PASSJWT", "SESSION_SECRET", "DATABASE_URL"];
const missingEnvVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error(
    "Missing required environment variables:",
    missingEnvVars.join(", ")
  );
  process.exit(1);
}

// Export environment variables
export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 5000,
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  PASSJWT: process.env.PASSJWT as string,
  SESSION_SECRET: process.env.SESSION_SECRET as string,
  DATABASE_URL: process.env.DATABASE_URL as string,
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN as string,
  FRONT_END_URL: process.env.FRONT_END_URL as string,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME as string,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD as string,
  SWAGGER_URL_DEV: process.env.SWAGGER_URL_DEV as string,
  SWAGGER_URL_TEST: process.env.SWAGGER_URL_TEST as string,
  REDIS_URL: process.env.REDIS_URL as string,
};
