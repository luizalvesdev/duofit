import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

// Id of the single pending "rest over" notification.
const NOTIFICATION_ID = 4242
const CHANNEL_ID = 'rest-timer'
const native = Capacitor.isNativePlatform()

let channelReady: Promise<unknown> | null = null

function setupNative() {
  channelReady ??= (async () => {
    await LocalNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Fim do descanso',
      description: 'Avisa quando o descanso entre séries termina',
      importance: 5,
      vibration: true,
      visibility: 1,
    })
    const { display } = await LocalNotifications.checkPermissions()
    if (display !== 'granted') await LocalNotifications.requestPermissions()
  })().catch(() => {})
  return channelReady
}

// Call from a user gesture (e.g. starting a workout) so the permission prompt and audio unlock work.
export function prepareRestAlert() {
  if (native) void setupNative()
}

// Schedules an OS-level alarm: it fires with the screen off or the app in the background,
// where JS timers are throttled or frozen.
export async function scheduleRestAlert(endsAt: number) {
  if (!native) return
  await setupNative()
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
