// This code is a part of MagicCap which is a MPL-2.0 licensed project.
// Copyright (C) Jake Gealer <jake@gealer.email> 2019.

const { post } = require("chainfetch")
const { google } = require("googleapis")
const streamifier = require("streamifier")
const mime = require("mime-types")

module.exports = {
    name: "Google Drive",
    icon: "gdrive.png",
    config_options: {
        "Client ID": {
            value: "gdrive_client_id",
            type: "text",
            required: true,
        },
        "Client Secret": {
            value: "gdrive_client_secret",
            type: "text",
            required: true,
        },
        Token: {
            value: "gdrive_token",
            type: "oauth2",
            required: true,
        },
    },
    getOAuthUrl: () => `https://accounts.google.com/o/oauth2/v2/auth?client_id=${config.gdrive_client_id}&redirect_uri=http%3A%2F%2F127.0.0.1%3A61222&access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive&response_type=code`,
    handleOAuthFlow: async req => {
        if (!req.query.code) {
            return
        }
        const urlEncode = `?client_id=${config.gdrive_client_id}&client_secret=${config.gdrive_client_secret}&redirect_uri=http%3A%2F%2F127.0.0.1%3A61222&code=${req.query.code}&grant_type=authorization_code`
        let response
        try {
            response = await post(`https://www.googleapis.com/oauth2/v4/token${urlEncode}`).set("Content-Type", "application/x-www-form-urlencoded").toJSON()
        } catch (_) {
            return
        }

        return {
            gdrive_token: response.body.access_token,
            gdrive_expires_at: Math.floor(new Date() / 1000) + response.body.expires_in,
            gdrive_refresh_token: response.body.refresh_token,
        }
    },
    upload: async(buffer, filetype, filename) => {
        if (Math.floor(new Date() / 1000) > config.gdrive_expires_at) {
            // We need to renew the access token.
            const urlEncode = `?client_id=${config.gdrive_client_id}&client_secret=${config.gdrive_client_secret}&refresh_token=${config.gdrive_refresh_token}&grant_type=refresh_token`
            const response = await post(`https://www.googleapis.com/oauth2/v4/token${urlEncode}`).set("Content-Type", "application/x-www-form-urlencoded").toJSON()
            config.gdrive_token = response.body.access_token
            config.gdrive_expires_at = Math.floor(new Date() / 1000) + response.body.expires_in
            saveConfig()
        }

        const oauth = new google.auth.OAuth2()
        oauth.setCredentials({
            access_token: config.gdrive_token,
        })
        const drive = google.drive({
            version: "v3",
            auth: oauth,
        })
        const mimeType = mime.lookup(filetype)
        const driveResponse = await drive.files.create({
            requestBody: {
                name: filename,
                mimeType: mimeType,
            },
            media: {
                mimeType: mimeType,
                body: streamifier.createReadStream(buffer),
            },
        })
        const driveId = driveResponse.data.id
        await drive.permissions.create({
            fileId: driveId,
            resource: {
                role: "reader",
                type: "anyone",
            },
            fields: "id",
        })

        return `https://drive.google.com/file/d/${driveId}/view?usp=sharing`
    },
}