function activate(ctx) {
	return ctx.handle("echo", async (input) => ({ echoed: input, dataDirectory: ctx.dataDirectory }));
}
module.exports = { activate };
