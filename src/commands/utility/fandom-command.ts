import { ChatInputCommandInteraction, PermissionsString } from 'discord.js';
import { RateLimiter } from 'discord.js-rate-limiter';
import https from 'node:https';
import { URL } from 'node:url';

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

export class FandomCommand implements Command {
    public names = [Lang.getRef('utilityCommands.fandom', Language.Default)];
    public cooldown = new RateLimiter(1, 5000);
    public deferType = CommandDeferType.HIDDEN;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        let args = {
            query: intr.options.getString(Lang.getRef('arguments.option', Language.Default), true),
        };

        const url = new URL('https://dokodemo.fandom.com/api.php');
        url.searchParams.set('action', 'opensearch');
        url.searchParams.set('search', args.query);

        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'ToroBot/1.0',
            },
        };

        console.log(`Fetching data from: ${url}`);

        // Make the GET request
        const req = https.get(options, res => {
            const { statusCode } = res;
            const contentType = res.headers['content-type'];

            if (statusCode !== 200) {
                console.error(`Request failed with status code: ${statusCode}`);
                res.resume(); // Consume response data to free up memory
                return;
            }

            if (!/^application\/json/.test(contentType)) {
                console.error(`Expected JSON but got ${contentType}`);
                res.resume();
                return;
            }

            let rawData = '';
            res.setEncoding('utf8');

            // Collect data chunks
            res.on('data', chunk => {
                rawData += chunk;
            });

            // Process complete response
            res.on('end', () => {
                try {
                    const parsedData = JSON.parse(rawData);

                    const titles: string[] = parsedData[1] ?? [];
                    const urls: string[] = parsedData[3] ?? [];

                    if (titles[0].toLowerCase() == args.query.toLowerCase()) {
                        // Page exists with exact title, send URL
                        InteractionUtils.send(intr, urls[0]);
                    } else {
                        // Create list of results in Markdown format
                        let results = '';
                        for (let i = 0; i < titles.length; i++) {
                            const title = titles[i] ?? 'Untitled';
                            const link = urls[i] ?? '#';
                            results += `[${title}](${link})\n`;
                        }

                        InteractionUtils.send(
                            intr,
                            Lang.getEmbed('displayEmbeds.fandomResults', data.lang, {
                                QUERY: args.query,
                                RESULTS: results,
                            })
                        );
                    }
                } catch (e) {
                    console.error('Error parsing JSON:', e.message);
                }
            });
        });

        // Handle errors
        req.on('error', e => {
            console.error(`Error: ${e.message}`);
        });

        // Set a timeout
        req.setTimeout(10000, () => {
            console.error('Request timeout');
            req.destroy();
        });
    }
}
