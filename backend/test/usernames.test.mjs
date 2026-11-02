import test from "node:test";
import assert from "node:assert/strict";
import { usernameKey, isValidUsername } from "../dist/helpers/username.js";
import { createProfileService } from "../dist/services/profile.service.js";
import { createChatService } from "../dist/services/chat.service.js";
import { DuplicateKeyError } from "../dist/errors/DuplicateKeyError.js";

test("username comparison handles case, spacing and compatibility characters", () => {
  assert.equal(usernameKey("  Ａｎｄｒｅｉ  SMITH  "), usernameKey("andrei smith"));
  assert.equal(isValidUsername("Andrei\u200b"), false);
  assert.equal(isValidUsername("Andrei\nSmith"), false);
  assert.equal(isValidUsername("  "), false);
});

test("conflicting profile updates report 409 and do not return a saved profile", async () => {
  const service = createProfileService({ updateUser: async () => { throw new DuplicateKeyError(); } }, {});
  await assert.rejects(service.update({ id: "visitor", username: "Old" }, { username: "Taken" }),
    error => error.status === 409 && /already taken/i.test(error.message));
});

test("message writes reject usernames not owned by the current user", async () => {
  let writes = 0;
  const id = "100000000000000000000001";
  const service = createChatService({
    messages: { insert: async () => { writes++; } },
    rooms: { findById: async () => ({ id }) },
    profiles: { ownsUsername: async () => false },
  }, () => {});
  await assert.rejects(service.createMessage({ id: "visitor", username: "Taken" }, id,
    { text: "Impersonation attempt", clientMessageId: crypto.randomUUID() }), { status: 409 });
  assert.equal(writes, 0);
});
