require('dotenv').config()
import {TradfriClient, Accessory, AccessoryTypes, discoverGateway} from "node-tradfri-client";
import {writeFileSync, readFileSync, existsSync} from 'fs'
import TelegramBotClient from 'node-telegram-bot-api'

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

  client.onText(/\/turnon/, msg => {
    if (msg.from && msg.from.username === 'jaloviina') {
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
  })

  client.onText(/\/turnoff/, msg => {
    if (msg.from && msg.from.username === 'jaloviina') {
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
  })

}

function writeCredsFile(identity: string, psk: string) {
  writeFileSync('./creds.json', JSON.stringify({identity, psk}))
}

app()