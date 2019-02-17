// This code is a part of MagicCap which is a MPL-2.0 licensed project.
// Copyright (C) Jake Gealer <jake@gealer.email> 2018.
// Copyright (C) Rhys O'Kane <SunburntRock89@gmail.com> 2018.

const { post } = require("chainfetch");
const i18n = require("../i18n");
const { app } = require("electron");

module.exports = {
    name: "i.novus",
    icon: "novus.png",
    config_options: {
        "API Token": {
            value: "novus_token",
            type: "text",
            required: true,
        },
    },
    upload: async(buffer, fileType) => {
        let res = await post("https://i.novuscommunity.co/api/upload")
            .set("Authorization", `Bearer ${config.novus_token}`)
            .set("User-Agent", `MagicCap ${app.getVersion()}; ${config.install_id}`)
            .attach("file", buffer, `oof.${fileType}`);
        switch (res.status) {
            case 200: break;
            case 403: {
                throw new Error("Your key is invalid.");
            }
            case 429: {
                throw new Error("You have been ratelimited!");
            }
            default: {
                if (res.status >= 500 <= 599) {
                    throw new Error("There are currently server issues.");
                }
                const i18nEdgecase = await i18n.getPoPhrase("Server returned the status {status}.", "uploaders/exceptions");
                throw new Error(i18nEdgecase.replace("{status}", `${res.status}`));
            }
        }
        return res.body.url;
    },
};
