implement every bot, one by one
start with protector, then miner, then builder

this commands HAS to work on every bot:

    Global Commands:
    #help [command] - Show this help message
    #list - List all active bots and their status
    #stop [bot_name] - Stop all bots or a specific bot
    #goto [bot_name] [x] [y] [z] - Command bot(s) to move to coordinates
    #come [bot_name] - Command bot(s) to come to your location
    #status [bot_name] - Get detailed status of bot(s)

and this for each bot:

    For Miner bot: mine, store, minearea

    For Builder bot: build, buildwall, blueprint

    For Protector bot: guard, patrol, follow, whitelist <playerName>
