// Convex httpActions and non-node functions have access to process.env at runtime.
// This declaration makes TypeScript aware of it.
// Note: Buffer and other Node.js APIs are NOT available — only process.env.

declare const process: {
	env: Record<string, string | undefined>;
};
