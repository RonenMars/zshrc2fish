zshrc2fish
==========
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![GitHub issues](https://img.shields.io/github/issues/ronenmars/zshrc2fish.svg)](https://github.com/ronenmars/zshrc2fish/issues)
[![GitHub license](https://img.shields.io/github/license/ronenmars/zshrc2fish.svg)](LICENSE)


**A CLI tool to convert your `.zshrc` config to a Fish shell `config.fish` file --- with interactive migration and safe backups.**


## Features

-   **Automatic migration:** Converts most aliases, environment variables, and functions.

-   **Zsh-aware:** Skips or flags Zsh/Oh-My-Zsh/Powerlevel10k lines and plugins.

-   **Interactive prompts:** For tricky or ambiguous lines, you choose what to do.

-   **Safe:** Optionally backs up your existing `config.fish` before changes.

-   **Summary:** Shows which lines were skipped or couldn't be handled automatically.

-   **Cross-platform:** Works on Mac and Linux (Node.js 18.x or higher required).

## Installation

Clone this repo and run the script using Node.js (version 18+ recommended):

```bash
git clone https://github.com/ronenmars/zshrc2fish.git
cd zshrc2fish
```
No additional dependencies are required.

## Usage

Simply run the script with Node.js:

```bash
node zshrc2fish.js

```

The script will:

1.  Prompt you for the path to your `.zshrc` (default: `~/.zshrc`)

2.  Prompt you for the output path for `config.fish` (default: `~/.config/fish/config.fish`)

3.  Ask if you want to backup the current `config.fish` (default: yes)

4.  Show interactive prompts for any lines it's unsure about

**Tip**: Press Enter to accept default answers for a smooth, fast experience.

## Example

```bash
$ node zshrc2fish.js

Enter path to your .zshrc file [/Users/alice/.zshrc]:
Enter path for output config.fish [/Users/alice/.config/fish/config.fish]:
Create a backup of the existing output file if it exists? (Y/n, press Enter for Yes):
Backup created: /Users/alice/.config/fish/config.fish.bak

Cannot confidently migrate: "source $ZSH/oh-my-zsh.sh"
What do you want to do?
[1] Skip (default, press Enter)
[2] Skip All
[3] Comment as # [UNHANDLED]
[4] Comment All as # [UNHANDLED]
[5] Manually rewrite
[6] Keep this line as is
>

```

After completion, you'll see which lines were skipped or unhandled, so you can copy/edit them as needed.


## Output Summary Example

At the end of the migration, you'll get a summary like this:

```bash
Migration complete! See output at:
/Users/alice/.config/fish/config.fish

===== Skipped (by user choice) =====
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
gpgconf --launch gpg-agent
===== End of Skipped =====

===== Unhandled or Zsh-only lines =====
zstyle ':omz:update' mode auto   
plugins=(
source $ZSH/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
source /opt/homebrew/opt/powerlevel10k/share/powerlevel10k/powerlevel10k.zsh-theme
source $ZSH/oh-my-zsh.sh
source ~/gitstatus/gitstatus.prompt.zsh
===== End of Unhandled =====
```


## Limitations

- Some advanced Zsh features (e.g., keybindings, completion scripts) or plugin logic cannot be converted automatically.

- Lines that are Zsh/Oh-My-Zsh/Powerlevel10k-specific are skipped or flagged for review.

- The tool does not modify your original .zshrc—only generates/overwrites config.fish.

## Troubleshooting
If you encounter issues:
- Ensure you have Node.js 18.x or higher installed.
- Check file permissions for your `.zshrc` and `config.fish` paths.
- If the script fails, check the console output for error messages.
- For persistent issues, please open a [GitHub issue](https://github.com/ronenmars/zshrc2fish/issues).


## Contribution
Pull requests, issues, and feature suggestions are welcome! Check the [GitHub repository](https://github.com/ronenmars/zshrc2fish) for open issues or to submit feature ideas.

## License

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)