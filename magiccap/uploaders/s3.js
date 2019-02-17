// This code is a part of MagicCap which is a MPL-2.0 licensed project.
// Copyright (C) Jake Gealer <jake@gealer.email> 2018.
// Copyright (C) Rhys O'Kane <SunburntRock89@gmail.com> 2018.

const AWS = require("aws-sdk");
const i18n = require("../i18n");

function s3Promise(s3, bucketName, filename, buffer) {
    const s3Function = (resolve, reject) => {
        const s3Handler = (err, data) => {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        };
        s3.upload({
            Key: filename,
            Body: buffer,
            ACL: "public-read",
            Bucket: bucketName,
            ContentType: "image/png",
        }, s3Handler);
    };
    return new Promise(s3Function);
}
// The S3 upload promise that works with the rest of this code properly.

module.exports = {
    name: "S3",
    icon: "s3.png",
    config_options: {
        "Access Key ID": {
            value: "s3_access_key_id",
            type: "text",
            required: true,
        },
        "Secret Access Key": {
            value: "s3_secret_access_key",
            type: "text",
            required: true,
        },
        Endpoint: {
            value: "s3_endpoint",
            type: "text",
            required: true,
            default: "https://s3.eu-west-2.amazonaws.com",
        },
        "Bucket Name": {
            value: "s3_bucket_name",
            type: "text",
            required: true,
        },
        "Bucket URL": {
            value: "s3_bucket_url",
            type: "text",
            required: true,
        },
    },
    upload: async(buffer, _, filename) => {
        AWS.config.update({
            accessKeyId: config.s3_access_key_id.trim(),
            secretAccessKey: config.s3_secret_access_key.trim(),
        });
        const s3 = new AWS.S3({
            endpoint: new AWS.Endpoint(config.s3_endpoint),
        });
        try {
            await s3Promise(s3, config.s3_bucket_name, filename, buffer);
        } catch (err) {
            const s3Faili18n = await i18n.getPoPhrase("Failed to upload to S3: {err}", "uploaders/exceptions");
            throw new Error(s3Faili18n.replace("{err}", `${err}`));
        }
        let url = config.s3_bucket_url;
        if (!url.endsWith("/")) {
            url += "/";
        }
        if (!(url.startsWith("http://") || url.startsWith("https://"))) {
            url = `https://${url}`;
        }
        return `${url}${filename}`;
    },
};
