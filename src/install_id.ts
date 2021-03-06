// This code is a part of MagicCap which is a MPL-2.0 licensed project.
// Copyright (C) Jake Gealer <jake@gealer.email> 2019.

// Requirements go here.
import { machineId } from "node-machine-id"
import { get } from "chainfetch"

// Creates the install ID.
export default async function newInstallId() {
    const newMachineId = await machineId()
    const siteGet = await get(`https://api.magiccap.me/install_id/new/${newMachineId}`)
    return siteGet.body
}
