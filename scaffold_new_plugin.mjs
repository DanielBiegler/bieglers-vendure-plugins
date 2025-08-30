/**
 * Helper Script to generate a new Plugin quickly with some expanded variables.
 *
 * Note: This doesnt protect from abuse like paths inside arguments, etc. but this script is just for me 😇.
 */

import { cpSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

function printUsage() {
  console.log(`Usage: node scaffold_new_plugin.mjs "Example Title" "Example description"`);
}

/**
 * @param {string[]} argv Pass the `process.argv` in here
 *
 * @typedef {Object} Variables These will get expanded inside selected source files.
 * @property {string} __SCAFFOLD_TITLE__ Used inside text, example "Lorem Ipsum"
 * @property {string} __SCAFFOLD_TITLE_URL_SAFE__ Gets derived from TITLE, example "lorem-ipsum"
 * @property {string} __SCAFFOLD_TITLE_NO_SPACE__ Gets derived from TITLE, "LoremIpsum"
 * @property {string} __SCAFFOLD_DESCRIPTION__ Used inside text, example "Helps you manage XYZ via JobQueue"
 * @property {number} __SCAFFOLD_YEAR__ Used inside text, example 2025
 *
 * @returns {Variables}
 */
function initVariables(argv) {
  const argTitle = argv[2]?.trim();
  const argDescription = argv[3]?.trim();

  if (!argTitle) {
    console.error("Title argument is required!");
    printUsage();
    process.exit(1);
  }

  if (!argDescription) {
    console.error("Description argument is required!");
    printUsage();
    process.exit(2);
  }

  return {
    __SCAFFOLD_TITLE__: argTitle,
    __SCAFFOLD_TITLE_URL_SAFE__: argTitle.toLowerCase().replaceAll(/\s/g, "-"),
    __SCAFFOLD_TITLE_NO_SPACE__: argTitle.replaceAll(/\s/g, ""),
    __SCAFFOLD_DESCRIPTION__: argDescription,
    __SCAFFOLD_YEAR__: new Date().getFullYear(),
  };
}

/**
 *
 * @param {Variables} variables
 * @param {string} pathNewPlugin
 */
function expandVariablesInSourceFiles(variables, pathNewPlugin) {
  const paths = readdirSync(pathNewPlugin, { encoding: "utf8", recursive: true });
  for (const path of paths) {
    if (path.startsWith(".")) continue;

    const pathNewFile = `${pathNewPlugin}/${path}`;
    if (statSync(pathNewFile).isFile() === false) continue;

    const content = readFileSync(pathNewFile, { encoding: "utf8" }).toString();

    let contentReplaced = content;
    for (const key in variables) contentReplaced = contentReplaced.replaceAll(key, variables[key]);

    if (content != contentReplaced) writeFileSync(pathNewFile, contentReplaced, { encoding: "utf8" });
  }
}

// Main

const VARIABLES = initVariables(process.argv);

const PATH_TEMPLATE_FOLDER = "./packages/template";
const pathDestination = `./packages/${VARIABLES.__SCAFFOLD_TITLE_URL_SAFE__}`;
console.log(`Copying "${PATH_TEMPLATE_FOLDER}" to the new plugin at "${pathDestination}"`);
cpSync(PATH_TEMPLATE_FOLDER, pathDestination, { recursive: true, force: false, errorOnExist: true });

console.log("Replacing variables inside source files");
expandVariablesInSourceFiles(VARIABLES, pathDestination);

console.log("Done, enjoy your new plugin!");
