// This code is a part of MagicCap which is a MPL-2.0 licensed project.
// Copyright (C) Jake Gealer <jake@gealer.email> 2018-2019.
// Copyright (C) Rhys O'Kane <SunburntRock89@gmail.com> 2018.
// Copyright (C) Matt Cowley (MattIPv4) <me@mattcowley.co.uk> 2019.

// Imports go here.
const magicImports = require("magicimports")
const gifman = require("./gif_capture")
const fsnextra = magicImports("fs-nextra")
const { clipboard, nativeImage, Tray, dialog, shell, Notification } = magicImports("electron")
const i18n = require("./i18n")
const captureDatabase = magicImports("better-sqlite3")(`${require("os").homedir()}/magiccap.db`)
const selector = require("./selector")
const sharp = magicImports("sharp")
const filename = require(`${__dirname}/filename.js`)

// Defines if we are in a GIF.
let inGif = false

// Defines the capture statement.
const captureStatement = captureDatabase.prepare("INSERT INTO captures VALUES (?, ?, ?, ?, ?)")

// The main capture core.
module.exports = class CaptureCore {
    /**
     * Creates an instance of CaptureCore.
     * @param {Buffer} buffer - The buffer for the capture. If this is ommited, it will be set to undefined.
     * @param {String} filetype - Sets the filetype for the capture. If this is left ommited, it will be set to undefined.
     */
    constructor(buffer, filetype) {
        this._filename = null
        this._log = false
        this._fp = null
        this._url = null
        this.filetype = filetype
        this.buffer = buffer
        this.promiseQueue = []
    }

    /**
     * Sets the file path if it is known.
     * @param {String} location - The location where the file is.
     * @returns The CaptureCore class this was called from.
     */
    fp(location) {
        this._fp = location
        this.filetype = this._fp.split(".").pop().toLowerCase()
        return this
    }

    /**
     * Sets whether to log the result.
     * @returns The CaptureCore class this was called from.
     */
    log() {
        this._log = true
        return this
    }


    /**
     * Handles throwing notifications.
     * @param {String} result - What to print in the notification.
     * @returns The CaptureCore class this was called from.
     */
    notify(result) {
        this.promiseQueue.push(async() => {
            const notification = new Notification({
                title: "MagicCap",
                body: result,
                sound: true,
            })
            const cls = this
            notification.on("click", () => shell.openExternal(cls._url || cls._fp))
            notification.show()
        })
        return this
    }

    /**
     * This is used internally to do the upload logging.
     * @param {String} file - The filename which was uploaded.
     * @param {Boolean} success - Whether the upload was successful.
     * @param {String} url - The URL of the capture.
     * @param {String} filePath - The filepath to the capture.
     */
    async _logUpload(file, success, url, filePath) {
        const timestamp = new Date().getTime()
        await captureStatement.run(file, Number(success), timestamp, url, filePath)
        try {
            global.window.webContents.send("screenshot-upload", {
                filename: file,
                success: Number(success),
                timestamp: timestamp,
                url: url,
                file_path: filePath,
            })
        } catch (err) {
            // This isn't too important, we should just ignore.
        }
    }

    /**
     * This is used to allow for the normal capture workflow to be ran.
     * @param {Object} uploader - The uploader to use. If ommited, runs through the default capture workflow.
     * @returns The CaptureCore class this was called from.
     */
    upload(uploader) {
        this.promiseQueue.push(async() => {
            try {
                let url
                if (uploader || config.upload_capture) {
                    if (!uploader) {
                        const uploaderType = uploader || config.uploader_type
                        const uploaderName = nameUploaderMap[uploaderType]
                        if (uploaderName === undefined) {
                            const notFoundi18n = await i18n.getPoPhrase("Uploader not found.", "capture")
                            throw new Error(notFoundi18n)
                        }
                        uploader = importedUploaders[uploaderName]
                    }

                    for (const key in uploader.config_options) {
                        if (config[uploader.config_options[key].value] === undefined) {
                            if (uploader.config_options[key].default) {
                                config[uploader.config_options[key].value] = uploader.config_options[key].default
                            } else if (uploader.config_options[key].required) {
                                const missingOptioni18n = await i18n.getPoPhrase("A required config option is missing.", "capture")
                                throw new Error(missingOptioni18n)
                            }
                        }
                    }
                    url = await uploader.upload(this.buffer, this.filetype, this._filename)
                    this._url = url
                }
                if (!this._fp && config.save_capture && config.save_path) {
                    // We need to save this and tailor the return.
                    this._fp = `${config.save_path}${this._filename}`
                    await fsnextra.writeFile(this._fp, this.buffer)
                }
                switch (config.clipboard_action) {
                    case 0: {
                        break
                    }
                    case 1: {
                        clipboard.writeImage(
                            nativeImage.createFromBuffer(this.buffer)
                        )
                        break
                    }
                    case 2: {
                        if (!url) {
                            const noURLi18n = await i18n.getPoPhrase("URL not found to put into the clipboard. Do you have uploading on?", "capture")
                            throw new Error(noURLi18n)
                        }
                        clipboard.writeText(url)
                        break
                    }
                    default: {
                        throw new Error(
                            "Unknown clipboard action."
                        )
                    }
                }
                if (url && config.upload_open) {
                    shell.openExternal(url)
                }
                await this._logUpload(this._filename, true, url, this._fp)
            } catch (e) {
                await this._logUpload(this._filename, false, null, null)
                throw e
            }
        })
        return this
    }

    /**
     * Sets the capture filename.
     * @param {String} name - Sets the filename to the string specified. If this is ommited, it will be generated using the usual workflow.
     * @returns The CaptureCore class this was called from.
     */
    filename(name) {
        this.promiseQueue.push(async() => {
            if (name === undefined) {
                const setFilename = filename.newFilename()
                // Set with correct prefix
                this._filename = `${setFilename}.${this.filetype}`
            } else {
                this._filename = name
            }
        })
        return this
    }


    /**
     * Runs all of the promises in the internal queue in order.
     */
    async run() {
        for (const promise of this.promiseQueue) {
            try {
                await promise()
            } catch (e) {
                if (e.message === "Screenshot cancelled.") {
                    return
                }
                dialog.showErrorBox("MagicCap", `${e.message}`)
                return
            }
        }
    }

    /**
     * Allows for clipboard capture based on what is in the clipboard and creates a new instance of the CaptureCore class.
     * @returns A new instance of the CaptureCore class.
     */
    static clipboard() {
        const cls = new CaptureCore()
        cls.promiseQueue.push(async() => {
            // Attempt to fetch the nativeimage from the clipboard
            let image = clipboard.readImage()

            // If clipboard cannot be made an image, abort
            if (image.isEmpty()) {
                const noImagei18n = await i18n.getPoPhrase("The clipboard does not contain an image", "capture")
                throw new Error(noImagei18n)
            }

            // Convert nativeimage to png buffer (clipboard doesn't support animated gifs)
            image = image.toPNG()

            // Set up in class.
            cls.filetype = "png"
            cls.buffer = image
        })
        return cls
    }

    /**
     * Allows for file uploads and creates a new instance of the CaptureCore class.
     * @param {Buffer} buffer - The buffer to upload.
     * @param {String} file - The filename of the file.
     * @param {String} fp - The file path to the file.
     * @returns A new instance of the CaptureCore class.
     */
    static file(buffer, file, fp) {
        const extension = file.split(".").pop().toLowerCase()
        const cls = new CaptureCore(buffer, extension)
        cls.filename(file).fp(fp)
        return cls
    }

    /**
     * Allows for file region selection and creates a new instance of the CaptureCore class.
     * @param {Boolean} gif - Defines if the user asked for a GIF.
     * @returns A new instance of the CaptureCore class.
     */
    static region(gif) {
        const cls = new CaptureCore(undefined, gif ? "gif" : "png")
        cls.promiseQueue.push(async() => {
            if (gif && inGif) {
                throw new Error("Screenshot cancelled.")
            }
            let selectorArgs
            if (!gif) {
                selectorArgs = [
                    {
                        type: "selection",
                        name: "__cap__",
                        tooltip: await i18n.getPoPhrase("Select a region to capture", "capture"),
                        imageLocation: "crosshair.png",
                        active: true,
                    },
                ]
                const editors = require("./editors")
                for (const key in editors) {
                    const editor = editors[key]
                    selectorArgs.push({
                        name: key,
                        tooltip: editor.description,
                        imageLocation: editor.icon,
                        type: "selection",
                        active: false,
                    })
                }
            }

            const selection = await selector(selectorArgs)
            if (!selection) {
                throw new Error("Screenshot cancelled.")
            }

            const electronScreen = magicImports("electron").screen

            const displays = electronScreen.getAllDisplays().sort((a, b) => {
                let sub = a.bounds.x - b.bounds.x
                if (sub === 0) {
                    if (a.bounds.y > b.bounds.y) {
                        sub -= 1
                    } else {
                        sub += 1
                    }
                }
                return sub
            })
            const thisDisplay = displays[selection.display]

            if (gif) {
                inGif = true
                const success = await gifman.start(
                    15, selection.start.pageX, selection.start.pageY,
                    selection.width, selection.height, thisDisplay
                )
                if (!success) {
                    throw new Error("Screenshot cancelled.")
                }
                const gifIcon = new Tray(`${__dirname}/icons/stop.png`)
                await new Promise(res => {
                    gifIcon.once("click", () => {
                        res()
                    })
                })
                gifIcon.setImage(`${__dirname}/icons/cog.png`)
                const buffer = await gifman.stop()
                await gifIcon.destroy()
                inGif = false
                cls.buffer = buffer
            } else {
                const displayFull = selection.screenshots[selection.display]

                let sharpDesktop = sharp(displayFull)

                for (const part of selection.displayEdits) {
                    sharpDesktop = sharp(await sharpDesktop.overlayWith(part.edit, {
                        left: part.left,
                        top: part.top,
                    }).toBuffer())
                }

                const cropped = await sharpDesktop.extract({
                    top: selection.start.pageY,
                    left: selection.start.pageX,
                    width: selection.width,
                    height: selection.height,
                }).toBuffer()

                cls.buffer = cropped
            }
        })
        return cls
    }
}
