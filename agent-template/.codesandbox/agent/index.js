import { Session } from "./Session.js";
import { SessionEnvironment } from "./Environment.js";
export async function* query(options) {
    const context = new SessionEnvironment(options.workingDirectory, undefined, options.maxSteps ?? 50);
    return yield* Session.create(options.prompt, context, options.models, options.todos, options.repos);
}
// Re-export all types for SDK usage
export * from "./types.js";
export { Session } from "./Session.js";
export { SessionEnvironment } from "./Environment.js";
