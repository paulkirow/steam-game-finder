Valve provides these APIs so website developers can use data from Steam in new and interesting ways. They allow developers to query Steam for information that they can present on their own sites. At the moment the only APIs we offer provide item data for Team Fortress 2, but this list will grow over time.



## Steam Web APIs available

[ISteamNews](http://developer.valvesoftware.com/wiki/Steam_Web_API#GetNewsForApp_.28v0001.29): Steam provides methods to fetch news feeds for each Steam game.

[ISteamUserStats](http://developer.valvesoftware.com/wiki/Steam_Web_API#GetGlobalAchievementPercentagesForApp_.28v0001.29): Steam provides methods to fetch global stat information by game.

[ISteamUser](http://developer.valvesoftware.com/wiki/Steam_Web_API#GetPlayerSummaries_.28v0001.29): Steam provides API calls to provide information about Steam users.

[ITFItems\_440](http://wiki.teamfortress.com/wiki/WebAPI): Team Fortress 2 provides API calls to use when accessing player item data.



## Obtaining an Steam Web API Key

All use of the Steam Web API requires the use of an API Key. You can acquire one [by filling out this form](https://steamcommunity.com/dev/apikey). Use of the APIs also requires that you agree to the [Steam API Terms of Use](https://steamcommunity.com/dev/apiterms).



## Output Formats

All API calls take the form http://api.steampowered.com/<interface name>/<method name>/v<version>/?key=<api key>&format=<format>.

Format can be any of:

-   json - The output will be returned in the JSON format
-   xml - Output is returned as an XML document
-   vdf - Output is returned as a VDF file.

If you do not specify a format, your results will be returns in the JSON format.



## Steam OpenID Provider

Steam can act as an OpenID provider. This allows your application to authenticate a user's SteamID without requiring them to enter their Steam username or password on your site (which would be a violation of the API Terms of Use.) Just download an [OpenID library](http://openid.net/developers/libraries/) for your language and platform of choice and use https://steamcommunity.com/openid as the provider. The returned Claimed ID will contain the user's 64-bit SteamID. The Claimed ID format is: https://steamcommunity.com/openid/id/<steamid>



## Valve Brand and Links

If you are using OpenID on your site, we request that you use one of the following buttons as your link to the Steam sign in page.

![](https://community.fastly.steamstatic.com/public/images/signinthroughsteam/sits_01.png)

![](https://community.fastly.steamstatic.com/public/images/signinthroughsteam/sits_02.png)