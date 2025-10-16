exports.handler = async (_event, context) => {
  const user = context?.clientContext?.user ?? null;

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ok: true,
      auth: Boolean(user),
      email: user?.email ?? null,
      roles: user?.app_metadata?.roles ?? [],
    }),
  };
};
