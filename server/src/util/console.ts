// https://www.lihaoyi.com/post/BuildyourownCommandLinewithANSIescapecodes.html

export enum C {
	RESET = '\u001b[0m',
	GREEN = '\u001b[32m',
	YELLOW = '\u001b[33m',
	BLUE = '\u001b[34m',
	MAGENTA = '\u001b[35m',
	RED_BR = '\u001b[31;1m',
}