import type { FastifyServerOptions } from "fastify";

const isDev = process.env.NODE_ENV !== "production";

export const loggerConfig: FastifyServerOptions["logger"] = {
  level: isDev ? "debug" : "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.token",
      "*.password",
      "*.secret",
      "*.accessToken",
      "*.refreshToken",
    ],
    censor: "[REDACTED]",
  },
  ...(isDev && {
    transport: { target: "pino-pretty", options: { colorize: true } },
  }),
};
