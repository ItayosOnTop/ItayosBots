this is a minecraft bot created in mineflayer
the bot is capable of mininig, building from schematic, guard the player, and more
the bot has commands like:
    #come
    #mine diamond_ore 64
    #guard <x><y><z> / #guard <playerName>
    #build <schematic_name>
    and more commands
the bot can be communicated trough discord and minecraft chat
the bot will get command only from the bot owner (DiscordID, Minecraft username)
the program can make "army" of bots, the bots will share data between them
the bots will be splitted into 3 bots types: miner, builder, protector:

    the miner type will mine and get the neccessary items and blocks for the schematic build, and put it all in chests, and share the data.

    the builder type will build the schematic with the blocks and items the the miner type put in the chests

    the protector type will protect the other types, himself, and specific player (specified by the bots owner) from any hostile mobs in a 50 blocks area.

the miner and builder bots can craft
the miner and the builder bots at the beginning will go and mine stuff specific by the bots owner, and they will go and craft tools and armors and will put them in a chest, the other bots will come and get those tools and armors (like gettign wood and then tools and so on..)
the command for that will be #start

the bot owner could specifiy if he wants specific bot to do it or all of the bots

the bots will have the command:
    #goto <botName> <x><y><z>
    #goto <x><y><z> //for all of them