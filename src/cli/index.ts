import { getCliBanner } from "../index.js";

export const main = (): void => {
  process.stdout.write(`${getCliBanner()}\n`);
};

main();
