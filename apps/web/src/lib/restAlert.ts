import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// Id of the single pending "rest over" notification.
const NOTIFICATION_ID = 4242
const CHANNEL_ID = 'rest-timer'
const native = Capacitor.isNativePlatform()

let channelReady: Promise<unknown> | null = null

function ensureChannel() {
  channelReady ??= LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Fim do descanso',
    description: 'Avisa quando o descanso entre séries termina',
    importance: 5,
    vibration: true,
    visibility: 1,
  }).catch((e) => console.error('rest alert channel', e))
  return channelReady
}

export type RestAlertStatus = { notifications: boolean; exact: boolean }

// null on web/PWA, where there is no OS-level alarm to set up.
export async function getRestAlertStatus(): Promise<RestAlertStatus | null> {
  if (!native) return null
  try {
    const [{ display }, { exact_alarm }] = await Promise.all([
      LocalNotifications.checkPermissions(),
      LocalNotifications.checkExactNotificationSetting(),
    ])
    return { notifications: display === 'granted', exact: exact_alarm === 'granted' }
  } catch (e) {
    console.error('rest alert status', e)
    return null
  }
}

// Asks for everything the alarm needs: notification permission, then (Android 12+) the
// "Alarms & reminders" switch, which opens a system settings screen. Call from a tap.
export async function enableRestAlert() {
  if (!native) return null
  await ensureChannel()
  try {
    await LocalNotifications.requestPermissions()
    const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting()
    if (exact_alarm !== 'granted') await LocalNotifications.changeExactNotificationSetting()
  } catch (e) {
    console.error('rest alert enable', e)
  }
  return getRestAlertStatus()
}

// Quiet startup: create the channel and show the notification permission prompt if it never was.
export async function prepareRestAlert() {
  if (!native) return
  await ensureChannel()
  try {
    const { display } = await LocalNotifications.checkPermissions()
    if (display === 'prompt' || display === 'prompt-with-rationale') await LocalNotifications.requestPermissions()
  } catch (e) {
    console.error('rest alert prepare', e)
  }
}

// Schedules an OS-level alarm: it fires with the screen off or the app in the background,
// where JS timers are throttled or frozen.
export async function scheduleRestAlert(endsAt: number) {
  if (!native) return
  await ensureChannel()
  await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] }).catch(() => {})
  if (endsAt <= Date.now()) return
  await LocalNotifications.schedule({
    notifications: [
      {
        id: NOTIFICATION_ID,
        title: 'Descanso terminou',
        body: 'Bora pra próxima série! 💪',
        channelId: CHANNEL_ID,
        schedule: { at: new Date(endsAt), allowWhileIdle: true },
      },
    ],
  }).catch(() => {})
}

export async function cancelRestAlert() {
  if (!native) return
  await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] }).catch(() => {})
}

let audio: AudioContext | undefined

function beep(at: number, frequency: number) {
  if (!audio) return
  const osc = audio.createOscillator()
  const gain = audio.createGain()
  osc.frequency.value = frequency
  osc.type = 'sine'
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(0.6, at + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.28)
  osc.connect(gain).connect(audio.destination)
  osc.start(at)
  osc.stop(at + 0.3)
}

// Web/PWA feedback while the page is open. On native the scheduled notification already rings and
// vibrates (foreground included), so this is skipped there to avoid doubling up.
export function playRestEnd() {
  if (native) return
  navigator.vibrate?.([300, 120, 300, 120, 500])
  try {
    audio ??= new AudioContext()
    void audio.resume()
    const t = audio.currentTime
    beep(t, 880)
    beep(t + 0.35, 880)
    beep(t + 0.7, 1175)
  } catch {
    /* audio blocked or unsupported */
  }
}
