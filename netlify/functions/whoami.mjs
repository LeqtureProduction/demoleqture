import { getRole } from "./lib/auth.mjs";

// Side-effect-free key check used by both admin pages to verify a key and
// find out which panel it unlocks, without mutating any state (unlike
// e.g. POSTing to survey-state just to test a key).
export default async (req) => {
  if (!process.env.ADMIN_KEY && !process.env.CUSTOMER_ADMIN_KEY) {
    return Response.json(
      { error: "Neither ADMIN_KEY nor CUSTOMER_ADMIN_KEY is configured on this site." },
      { status: 500 }
    );
  }
  const role = getRole(req);
  if (!role) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ role });
};

export const config = { path: "/api/whoami" };
