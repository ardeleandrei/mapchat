import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { HttpError } from "../errors/HttpError.js";

export const handleApiError: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: "Invalid request",
      issues: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: error.message,
    });
    return;
  }

  if (error && typeof error === "object" && "type" in error) {
    if (error.type === "entity.parse.failed") {
      response.status(400).json({
        error: "Invalid JSON body",
      });
      return;
    }

    if (error.type === "entity.too.large") {
      response.status(413).json({
        error: "Request body is too large",
      });
      return;
    }
  }

  console.error("Request failed:", error);

  response.status(500).json({
    error: "An unexpected server error occurred",
  });
};
