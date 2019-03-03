require('dotenv').config()
import {TradfriClient, Accessory, AccessoryTypes, discoverGateway} from "node-tradfri-client";
import {writeFileSync, readFileSync, existsSync} from 'fs'
import TelegramBotClient from 'node-telegram-bot-api'
import permissions from './permissions.json'

async function app() {
  const devices = new Map<number, Accessory>()
  const client = new TelegramBotClient(process.env.TELEGRAM_TOKEN as string, {
    polling: true
  })
  const gatewayCredsFile = existsSync('./creds.json') ? JSON.parse(readFileSync('./creds.json', 'utf8')) : null
  let gatewayCreds = gatewayCredsFile !== null ? {identity: gatewayCredsFile.identity, psk: gatewayCredsFile.psk} : null

  const tradfri = new TradfriClient(process.env.GATEWAY_HOSTNAME as string)

  if (gatewayCreds && gatewayCreds.psk && gatewayCreds.identity) {
    try {
      await tradfri.connect(gatewayCreds.identity, gatewayCreds.psk)
      tradfri.on('device updated', (device: Accessory) => {
        if (device.type === AccessoryTypes.lightbulb || device.type === AccessoryTypes.remote) {
          console.log('Found device', device.name)
          console.log('Instance id', device.instanceId)
          devices.set(device.instanceId, device)
        }
      }).on('device removed', (device: Accessory) => {
        devices.delete(device.instanceId)
      })
      .observeDevices()
    } catch(e) {
      console.error(e)
    }
  } else {
    try {
      const {identity, psk} = await tradfri.authenticate(process.env.SECURITY_CODE as string)
      writeCredsFile(identity, psk)
      gatewayCreds = {identity, psk}
    } catch (e) {
      console.error(e)
    }
  }

  const turnOnLights = () => {
    const lightbulb = Array.from(devices.values()).filter(d => d.type === AccessoryTypes.lightbulb)
    if (lightbulb) {
      lightbulb.forEach((device) => {
        if (device.lightList && device.lightList.length > 0) {
          device.lightList.forEach(async l => {
            await l.turnOn()
            await l.setBrightness(1000)
          })
        }
      })
    }
  }

  const turnOnLight = (instanceId: number) => {
    const device = devices.get(instanceId)
    if (device) {
      device.lightList.forEach(async l => {
        await l.turnOn()
        await l.setBrightness(1000)
      })
    }
    
  } 

  const turnOffLight = (instanceId: number) => {
    const device = devices.get(instanceId)
    if (device) {
      device.lightList.forEach(l => l.turnOff())
    }
    
  } 

  const turnOffLights = () => {
    const lightbulb = Array.from(devices.values()).filter(d => d.type === AccessoryTypes.lightbulb)
    if (lightbulb) {
      lightbulb.forEach((device) => {
        if (!device) return
        if (device.lightList.length > 0) {
          device.lightList.forEach(l => l.turnOff())
        }
      })
    }
  }

  client.onText(/\/turnonall/, msg => {
    const perms = getPermissions()
    const filteredPerms = perms.filter(({permissions}) => permissions.indexOf(msg.from && msg.from.username ? msg.from.username : '') > -1)
    filteredPerms.forEach(({deviceInstanceId}) => turnOnLight(deviceInstanceId))
  })

  client.onText(/\/turnoffall/, msg => {
    const perms = getPermissions()
    const filteredPerms = perms.filter(({permissions}) => permissions.indexOf(msg.from && msg.from.username ? msg.from.username : '') > -1)
    filteredPerms.forEach(({deviceInstanceId}) => turnOffLight(deviceInstanceId))
  })

  client.onText(/\/list/, msg => {
    const devices = getPermissions().map(({nick}) => nick)
    client.sendMessage(msg.chat.id, `Available devices: ${devices.join(', ')}`)
  })

  client.onText(/\/turnon .*/g, msg => {
    const msgNick = msg.text ? msg.text.split(' ')[1] : -1
    const perms = getPermissions()
    const device = perms.find(({nick}) => nick === msgNick)
    const canTurnOn = device ? device.permissions.indexOf(msg.from && msg.from.username ? msg.from.username : '') > -1 : false
    if (canTurnOn && device) {
      turnOnLight(device.deviceInstanceId)
    }
  })

  client.onText(/\/turnoff .*/g, msg => {
    const msgNick = msg.text ? msg.text.split(' ')[1] : -1
    const perms = getPermissions()
    const device = perms.find(({nick}) => nick === msgNick)
    const canShutOff = device ? device.permissions.indexOf(msg.from && msg.from.username ? msg.from.username : '') > -1 : false
    if (canShutOff && device) {
      turnOffLight(device.deviceInstanceId)
    }
  })
}

function getPermissions() {
  return permissions as Array<{deviceInstanceId: number, nick: string, permissions: string[]}>
}

function writeCredsFile(identity: string, psk: string) {
  writeFileSync('./creds.json', JSON.stringify({identity, psk}))
}

app()