/* This code is a part of MagicCap which is a MPL-2.0 licensed project.
 * Copyright (C) Matt Cowley (MattIPv4) <me@mattcowley.co.uk> 2019.
 */
const magicImports = require("magicimports")
const { app, systemPreferences } = magicImports("electron")
const fs = require("fs")
const sys = systemPreferences
const Color = require("color")

// Verify macOS
if (process.platform !== "darwin") {
    console.error("Colors will only be built on macOS")
    app.quit()
}

/**
 * Sets the current system theme
 * @param {string} theme - Theme to apply
 */
const setTheme = theme => {
    sys.setAppLevelAppearance(theme)
    sys.getAppLevelAppearance()
}

/**
 * Sets the opacity of a given color
 * @param {string} color - The color to be alpha-ed
 * @param {int} percent - The percentage to alpha the color by
 * @returns {string} color - The new color
 */
const alpha = (color, percent) => Color(color)
    .fade(1 - (percent / 100))
    .rgb()
    .string()

/**
 * Generates the color variables for the given theme
 * @param {boolean} dark - If the theme should be dark mode
 */
const generate = dark => {
    // Set the system theme
    const type = dark ? "dark" : "light"
    setTheme(type)

    // Set the bulmaswatch theme to use
    const swatch = dark ? "darkly" : "default"

    // Generate the CSS vars
    const vars = `
    --red: ${sys.getSystemColor("red")}; /* Primary/Info button */
    --green: ${sys.getSystemColor("green")}; /* Success button */
    --blue: ${sys.getSystemColor("blue")}; /* Danger button */
    --orange: ${sys.getSystemColor("orange")}; /* Warning button */
    --gray: ${sys.getSystemColor("gray")}; /* Default button */
    
    --shadow: 0 0 3px 0 ${sys.getColor("shadow")};
    
    --separator: ${alpha(sys.getColor("separator"), 10)};
    --grid: ${alpha(sys.getColor("grid"), 10)};
    --link: ${sys.getColor("link")};
    --text: ${sys.getColor("text")};
    
    --window-background: ${sys.getColor("window-background")}; /* Main background */
    --control-background: ${sys.getColor("control-background")}; /* Sidebar background */
    --control-active-background: ${alpha(sys.getColor("quaternary-label"), 10)}; /* Sidebar item hover/active */
    --text-background: ${sys.getColor("text-background")}; /* Tooltip background */

    --scroll: ${alpha(sys.getColor("tertiary-label"), 25)}; /* Scroll thumb */
    --scroll-active: ${alpha(sys.getColor("secondary-label"), 55)}; /* Scroll thumb hover/active */
    --scroll-background: ${sys.getColor("control-background")}; /* Scroll background */
`

    // Create new theme
    let theme = fs.readFileSync(`${__dirname}/theme.tpl.css`, "utf8")
    theme = theme.replace("{{SWATCH}}", swatch).replace("/*{{VARS}}*/", vars)
    theme = `/*\n * WARNING: THIS FILE IS AUTOMATICALLY GENERATED BY colors.js FROM theme.tpl.css\n */\n${theme}`

    // Write
    const file = `${__dirname}/${type}.css`
    fs.writeFileSync(file, theme)
    console.info(`Theme written to ${file}`)
}

// Generate
if (process.argv.includes("-dark")) generate(true)
else if (process.argv.includes("-light")) generate(false)

// Done
app.quit()
