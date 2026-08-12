// Shared role check used by every admin-gated function. Two independent
// shared secrets, not a real user/login system: ADMIN_KEY (Super Admin,
// full control) and CUSTOMER_ADMIN_KEY (Customer Admin, limited control).
export function getRole(req) {
  const key = req.headers.get("x-admin-key") || "";
  if (!key) return null;
  if (process.env.ADMIN_KEY && key === process.env.ADMIN_KEY) return "super";
  if (process.env.CUSTOMER_ADMIN_KEY && key === process.env.CUSTOMER_ADMIN_KEY) return "customer";
  return null;
}
