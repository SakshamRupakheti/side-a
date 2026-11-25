import { randomBytes } from "node:crypto";
import {
  account,
  client,
  listen,
  postcard,
  profile,
  previewOrigin,
} from "../tests/social-fixtures.mjs";
const req = client(fetch, previewOrigin);
const password = randomBytes(18).toString("hex");
const cookies = {};
for (const name of ["alice", "bob", "charlie"])
  cookies[name] = await account(req, name, password);
const a = cookies.alice,
  b = cookies.bob;
const entry = (
  await req("/me/entries", a, "POST", { ...listen, shared: true }, 201)
).data.id;
await req("/me/profile", a, "PUT", profile("alice", true));
await req("/me/profile", b, "PUT", profile("bob", true));
await req(
  "/me/entries",
  b,
  "POST",
  { ...listen, url: "", title: "Bob's private TEST listen" },
  201,
);
await req(
  "/me/entries",
  cookies.charlie,
  "POST",
  { ...listen, url: "", title: "Charlie's private TEST listen" },
  201,
);
const published = (
  await req("/me/posts/" + entry, a, "PUT", {
    ...postcard(1, 0, true),
    caption:
      "TEST DATA · Would a warning still make sense ten thousand years from now?",
  })
).data;
await req("/me/social/follow/alice", b, "PUT", { active: true });
await req("/me/social/like/" + published.id, b, "PUT", { active: true });
await req("/me/social/bookmark/" + published.id, b, "PUT", { active: true });
console.log(
  JSON.stringify({
    post: published.id,
    accounts: ["alice", "bob", "charlie"],
    password,
  }),
);
