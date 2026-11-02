import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth.middleware.js";
import { profileSchema } from "../schemas/profile.schema.js";
import type { createProfileService } from "../services/profile.service.js";

export function createProfileController(service: ReturnType<typeof createProfileService>) {
  return {
    async update(request: Request, response: Response) {
      const user = currentUser(response);
      const input = profileSchema.parse(request.body);
      if (input.username !== undefined && !user.registered) {
        response.status(403).json({ error: "Create an account before choosing a username." });
        return;
      }

      const updated = await service.update({ id: user.id, username: user.username }, input);
      response.json({
        user: { ...updated, createdAt: updated.createdAt.toISOString() },
      });
    },
  };
}
