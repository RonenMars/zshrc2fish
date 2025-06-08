import { readFile, writeFile, cp } from "fs/promises";
import readline from "readline/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { stdin as input, stdout as output } from "process";
import path from "path";

const aliasRegex = /^alias\s+([^\s=]+)=(["'])(.+?)\2/;
const exportRegex = /^export\s+(\w+)=["']?(.+?)["']?$/;
const functionStartRegex = /^(\w+)\s*\(\)\s*{/;
const functionEndRegex = /^}/;
const sourceRegex = /^\s*source\s+["']?(.+?)["']?\s*$/;
const ifStartRegex = /^\s*if\s/;
const elifRegex = /^\s*elif\s/;
const fiRegex = /^\s*fi\s*$/;
const envAssignRegex = /^([A-Za-z_][A-Za-z0-9_]*)=(["']?)(.+?)\2$/;

const complexPatterns = [
	/^\s*plugins=\(.*\)$/,
	/^\s*ZSH=.*$/,
	/oh-my-zsh/,
	/powerlevel10k/,
	/zsh-syntax-highlighting/,
	/zstyle\s/,
	/^\s*autoload\s+/,
	/^\s*setopt\s+/,
	/^\s*unsetopt\s+/,
	/^\s*bindkey\b/,
	/^\s*compinit\b/,
	/^\s*prezto\s+/,
	/^\s*antigen\s+/,
	/^\s*PROMPT=.+$/,
	/^\s*RPROMPT=.+$/,
	/^\s*source .*\.zsh.*$/,
];

const SECTIONS = {
	aliases: [],
	envs: [],
	functions: [],
	unhandled: [],
};

let skippedLines = [];
let unhandledLines = [];

function getBackupPath(filePath) {
	let backupPath = filePath + ".bak";
	if (!existsSync(backupPath)) return backupPath;
	let n = 1;
	while (existsSync(filePath + `.bak.${n}`)) n++;
	return filePath + `.bak.${n}`;
}

function isComplex(line) {
	return complexPatterns.some((re) => re.test(line));
}

function isZshSource(path) {
	return (
		path.includes("oh-my-zsh") ||
		path.includes("zsh-syntax-highlighting") ||
		path.includes("powerlevel10k") ||
		path.includes(".zsh") ||
		path.includes("zsh-theme") ||
		path.includes("gitstatus")
	);
}

function fishQuoteIfNeeded(value) {
	value = value.replace(/^['"]|['"]$/g, "");
	if (
		/[\s'";|&!<>()[\]{}]/.test(value) ||
		value === "" ||
		value.includes("#")
	) {
		return `"${value.replace(/(["\\])/g, '\\$1')}"`;
	}
	return value;
}


async function handleIfBlock(lines, idx, rl) {
	let block = [];
	let innerIdx = idx;
	let level = 0;
	let blockHasUnhandled = false;

	while (innerIdx < lines.length) {
		let line = lines[innerIdx];
		if ((ifStartRegex.test(line) || elifRegex.test(line))) {
			level++;
			block.push(line);
			innerIdx++;
			continue;
		}
		if (fiRegex.test(line)) {
			level--;
			block.push(line);
			innerIdx++;
			if (level === 0) break;
			continue;
		}
		block.push(line);
		innerIdx++;
	}

	let migrated = [];
	let blockBody = block.join("\n");
	for (const l of block) {
		if (isComplex(l) || (sourceRegex.test(l) && isZshSource(l))) {
			blockHasUnhandled = true;
		}
	}

	if (!blockHasUnhandled) {
		for (const l of block) {
			if (aliasRegex.test(l)) {
				const [, name, , value] = l.match(aliasRegex);
				migrated.push({ section: "aliases", line: `alias ${name}=${fishQuoteIfNeeded(value)}` });
			} else if (exportRegex.test(l)) {
				const [, name, value] = l.match(exportRegex);
				migrated.push({ section: "envs", line: `set -gx ${name} ${fishQuoteIfNeeded(value)}` });
			} else if (sourceRegex.test(l)) {
				const [, path] = l.match(sourceRegex);
				migrated.push({ section: "sources", line: `source ${fishQuoteIfNeeded(path)}` });
			} else if (envAssignRegex.test(l)) {
				const [, name, , value] = l.match(envAssignRegex);
				migrated.push({ section: "envs", line: `set -gx ${name} ${fishQuoteIfNeeded(value)}` });
			}
		}
	} else {
		if (rl) {
			const userHandledBlock = await promptUserBlock(rl, blockBody);
			if (userHandledBlock !== undefined && userHandledBlock !== null) {
				if (typeof userHandledBlock === "object" && userHandledBlock.unhandled) {
					unhandledLines.push(userHandledBlock.line);
				} else if (userHandledBlock !== null) {
					skippedLines.push(userHandledBlock);
				}
			}
		} else {
			unhandledLines.push(`# [UNHANDLED IF BLOCK]\n${blockBody}\n# [/UNHANDLED IF BLOCK]`);
		}
	}
	return { migrated, nextIdx: innerIdx };
}


async function promptUserBlock(rl, block) {
	if (skipAll) {
		skippedLines.push(block);
		return null;
	}
	if (commentAll) return { unhandled: true, line: `# [UNHANDLED BLOCK]\n${block}\n# [/UNHANDLED BLOCK]` };

	const promptText = `Cannot confidently migrate this block:\n${block}\nWhat do you want to do?
[1] Skip (default, press Enter)
[2] Skip All
[3] Comment as # [UNHANDLED BLOCK]
[4] Comment All as # [UNHANDLED BLOCK]
[5] Manually rewrite
[6] Keep this block as is
> `;

	let answer = (await rl.question(promptText)).trim();

	switch (answer) {
		case "1":
		case "":
			skippedLines.push(block);
			return null;
		case "2":
			skipAll = true;
			skippedLines.push(block);
			return null;
		case "3":
			return { unhandled: true, line: `# [UNHANDLED BLOCK]\n${block}\n# [/UNHANDLED BLOCK]` };
		case "4":
			commentAll = true;
			return { unhandled: true, line: `# [UNHANDLED BLOCK]\n${block}\n# [/UNHANDLED BLOCK]` };
		case "5": {
			let replacement = await rl.question("Type your replacement Fish syntax for the entire block (empty to skip):\n> ");
			if (replacement.trim()) {
				return replacement.trim();
			}
			skippedLines.push(block);
			return null;
		}
		case "6":
			skippedLines.push(block);
			return block;
		default:
			skippedLines.push(block);
			return null;
	}
}

async function promptUser(rl, line) {
	if (skipAll) {
		skippedLines.push(line);
		return null;
	}
	if (commentAll) return `# [UNHANDLED] ${line}`;

	const promptText = `Cannot confidently migrate: "${line.trim()}".\nWhat do you want to do?
[1] Skip (default, press Enter)
[2] Skip All
[3] Comment as # [UNHANDLED]
[4] Comment All as # [UNHANDLED]
[5] Manually rewrite
[6] Keep this line as is
> `;

	let answer = (await rl.question(promptText)).trim();

	switch (answer) {
		case "1":
		case "":
			skippedLines.push(line);
			return null;
		case "2":
			skipAll = true;
			skippedLines.push(line);
			return null;
		case "3":
			unhandledLines.push(`# [UNHANDLED] ${line}`);
			return `# [UNHANDLED] ${line}`;
		case "4":
			commentAll = true;
			unhandledLines.push(`# [UNHANDLED] ${line}`);
			return `# [UNHANDLED] ${line}`;
		case "5": {
			let replacement = await rl.question("Type your replacement Fish syntax (empty to skip):\n> ");
			if (replacement.trim()) {
				return replacement.trim();
			}
			skippedLines.push(line);
			return null;
		}
		case "6":
			skippedLines.push(line);
			return line;
		default:
			skippedLines.push(line);
			return null;
	}
}

function expandHome(p) {
	if (!p) return p;
	if (p.startsWith("~")) {
		return path.join(homedir(), p.slice(1));
	}
	return p;
}

function getDefaultConfigFishPath() {
	const env = process.env;
	if (env.XDG_CONFIG_HOME) {
		return path.join(env.XDG_CONFIG_HOME, "fish/config.fish");
	}
	return path.join(homedir(), ".config/fish/config.fish");
}

let skipAll = false;
let commentAll = false;
let inArrayBlock = false;

async function migrateZshrc(zshrcPath, outPath, rl) {
	const lines = (await readFile(zshrcPath, "utf8")).split("\n");
	let i = 0;
	let functionLines = [];
	let functionName = "";

	for (const key of Object.keys(SECTIONS)) SECTIONS[key] = [];

	while (i < lines.length) {
		let line = lines[i];

		if (inArrayBlock) {
			if (line.trim() === ")") inArrayBlock = false;
			i++;
			continue;
		}
		if (/^[a-zA-Z0-9_]+\s*=\s*\($/.test(line.trim())) {
			inArrayBlock = true;
			unhandledLines.push(line);
			i++;
			continue;
		}
		if (!line.trim() || line.trim().startsWith("#")) {
			i++;
			continue;
		}
		if (/^ZSH=/.test(line)) {
			unhandledLines.push(line);
			i++;
			continue;
		}
		if (aliasRegex.test(line)) {
			const [, name, , value] = line.match(aliasRegex);
			SECTIONS.aliases.push(`alias ${name}=${fishQuoteIfNeeded(value)}`);
			i++;
			continue;
		}
		if (exportRegex.test(line)) {
			const [, name, value] = line.match(exportRegex);
			SECTIONS.envs.push(`set -gx ${name} ${fishQuoteIfNeeded(value)}`);
			i++;
			continue;
		}
		if (envAssignRegex.test(line)) {
			const [, name, , value] = line.match(envAssignRegex);
			SECTIONS.envs.push(`set -gx ${name} ${fishQuoteIfNeeded(value)}`);
			i++;
			continue;
		}
		if (functionStartRegex.test(line)) {
			functionName = line.match(functionStartRegex)[1];
			functionLines = [`function ${functionName}`];
			i++;
			while (i < lines.length) {
				if (functionEndRegex.test(lines[i])) {
					functionLines.push("end");
					SECTIONS.functions.push(functionLines.join("\n"));
					break;
				}
				functionLines.push("  " + lines[i]);
				i++;
			}
			i++;
			continue;
		}
		if (sourceRegex.test(line)) {
			const [, srcPath] = line.match(sourceRegex);
			const bareSrcPath = srcPath.replace(/^['"]|['"]$/g, "");
			// Check both: the line and the unquoted path
			if (isZshSource(bareSrcPath) || isComplex(line) || /\.zsh/.test(bareSrcPath)) {
				unhandledLines.push(line);
			}
			i++;
			continue;
		}
		if (ifStartRegex.test(line)) {
			const { migrated, nextIdx } = await handleIfBlock(lines, i, rl);
			for (const m of migrated) {
				SECTIONS[m.section].push(m.line);
			}
			i = nextIdx;
			continue;
		}
		if (isComplex(line)) {
			unhandledLines.push(line);
			i++;
			continue;
		}
		const userHandled = await promptUser(rl, line);
		if (userHandled) {
			if (userHandled.startsWith("# [UNHANDLED]")) unhandledLines.push(userHandled);
			else SECTIONS.unhandled.push(`# [USER-MIGRATED] ${userHandled}`);
		}
		i++;
	}

	const outputLines = [
		"# Aliases",
		...SECTIONS.aliases,
		"",
		"# Environment Variables",
		...SECTIONS.envs,
		"",
		"# Functions",
		...SECTIONS.functions,
		"",
	];

	await writeFile(outPath, outputLines.join("\n"), "utf8");
	console.log(`\nMigration complete! See output at:\n${outPath}`);

	if (skippedLines.length) {
		console.log("\n===== Skipped (by user choice) =====");
		skippedLines.forEach((line) => {
			console.log(line);
		});
		console.log("===== End of Skipped =====\n");
	}

	if (unhandledLines.length) {
		console.log("\n===== Unhandled or Zsh-only lines =====");
		unhandledLines.forEach((line) => {
			console.log(line);
		});
		console.log("===== End of Unhandled =====\n");
	}

	if (!skippedLines.length && !unhandledLines.length) {
		console.log("All lines were migrated or handled!");
	}
}

async function promptUserForPaths() {
	const rl = readline.createInterface({ input, output });
	const defaultZshrc = path.join(homedir(), ".zshrc");
	let zshrcPath = await rl.question(`Enter path to your .zshrc file [${defaultZshrc}]: `);
	if (!zshrcPath.trim()) zshrcPath = defaultZshrc;
	zshrcPath = expandHome(zshrcPath);
	const defaultFish = getDefaultConfigFishPath();
	let fishConfigPath = await rl.question(`Enter path for output config.fish [${defaultFish}]: `);
	if (!fishConfigPath.trim()) fishConfigPath = defaultFish;
	fishConfigPath = expandHome(fishConfigPath);
	let backupAnswer = await rl.question(`Create a backup of the existing output file if it exists? (Y/n, press Enter for Yes): `);
	let createBackup = !backupAnswer.trim() || backupAnswer.trim().toLowerCase().startsWith("y");
	rl.close();
	return { zshrcPath, fishConfigPath, createBackup };
}

async function run() {
	const { zshrcPath, fishConfigPath, createBackup } = await promptUserForPaths();
	if (createBackup && existsSync(fishConfigPath)) {
		const backupPath = getBackupPath(fishConfigPath);
		await cp(fishConfigPath, backupPath);
		console.log(`Backup created: ${backupPath}`);
	}
	const rl = readline.createInterface({ input, output });
	await migrateZshrc(zshrcPath, fishConfigPath, rl);
	rl.close();
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
