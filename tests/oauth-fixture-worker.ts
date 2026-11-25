// Local harness entry point. All outbound HTTP stays inside this synthetic provider.
import app from "../server/index";
import type { Env } from "../server/auth";
type FixtureEnv = Env & { FIXTURE_ID_TOKEN: string; FIXTURE_JWKS: string };
export default {
  async fetch(req: Request, env: FixtureEnv, ctx: ExecutionContext) {
    globalThis.fetch = async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.href === "https://oauth2.googleapis.com/token")
        return Response.json({
          access_token: "fixture-access",
          token_type: "Bearer",
          expires_in: 3600,
          id_token: env.FIXTURE_ID_TOKEN,
        });
      if (url.href === "https://www.googleapis.com/oauth2/v3/certs")
        return Response.json(JSON.parse(env.FIXTURE_JWKS));
      throw new Error("Unknown fixture provider destination");
    };
    return app.fetch(req, env, ctx);
  },
};
