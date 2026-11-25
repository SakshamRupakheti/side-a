import assert from "node:assert/strict";
export const previewOrigin = "http://127.0.0.1:8793";
export function client(fetcher, origin) {
  if (!["http://127.0.0.1:8787", previewOrigin].includes(origin))
    throw Error("Synthetic diaries require local Wrangler.");
  return async (
    path,
    cookie = "",
    method = "GET",
    body,
    expected = 200,
    extra = {},
  ) => {
    const res = await fetcher(origin + "/api" + path, {
      method,
      headers: { "content-type": "application/json", origin, cookie, ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    assert.equal(
      res.status,
      expected,
      path + " " + JSON.stringify(data).slice(0, 280),
    );
    return {
      data,
      cookie: res.headers
        .getSetCookie()
        .map((x) => x.split(";")[0])
        .join("; "),
    };
  };
}
export function profile(name, published = false) {
  return {
    username: name,
    display_name: name[0].toUpperCase() + name.slice(1) + " · TEST DATA",
    bio: "Local social preview · TEST DATA",
    published,
    show_finished: false,
    show_shows: false,
    show_replays: false,
    show_badges: false,
  };
}
export const listen = {
  url: "https://99percentinvisible.org/episode/ten-thousand-years/",
  title: "Ten Thousand Years",
  creator: "Roman Mars",
  show_name: "99% Invisible",
  kind: "podcast",
  artwork: "",
  status: "want",
  rating: null,
  replays: 0,
  note: "TEST PRIVATE NOTE",
  takeaway: "A warning has to survive the language it was written in.",
  shared: false,
  experience: {
    source_description: "",
    duration_seconds: null,
    personal_description: "TEST PRIVATE DESCRIPTION",
    reflection: "TEST PRIVATE REFLECTION",
    moments: [
      {
        timestamp: "",
        title: "Reading a warning",
        description: "Which symbols would you trust?",
        shared: true,
      },
      {
        timestamp: "",
        title: "TEST PRIVATE MOMENT",
        description: "Never on a postcard",
        shared: false,
      },
    ],
  },
};
export async function account(req, name, password) {
  const email = name + "@social-preview.invalid";
  const { cookie } = await req("/auth/sign-up/email", "", "POST", {
    name,
    email,
    password,
  });
  await req("/me/profile", cookie, "PUT", profile(name));
  return cookie;
}
export const postcard = (
  entry_revision = 1,
  revision = 0,
  published = false,
) => ({
  caption: "Would a warning still make sense ten thousand years from now?",
  entry_revision,
  revision,
  published,
  include_takeaway: true,
  include_moments: true,
});
